/**
 * Parametric sculptures in the desktop app, sliced on the server with manifold-3d like the website's
 * export: library shapes, formula shapes and text (shaped here with HarfBuzz and the bundled fonts).
 * Imported 3D files and photos never leave the website's device storage, so those designs open in
 * the website view. The settings are nested; each panel field has a getter and a setter here, and
 * the values travel to the app in `form.values`.
 */
import * as THREE from "three";
import { PARAM_FIELDS, type ParamField } from "@/components/parametric/fields";
import { partsObject } from "@/components/parametric/scene";
import { bundledFont, serverHarfBuzz } from "@/lib/billing/letterFonts";
import { serverManifold } from "@/lib/billing/serverManifold";
import { parametricRequestError } from "@/lib/billing/validate";
import { getPath, setPath } from "@/lib/generators/path";
import { MATERIALS } from "@/lib/hinge";
import { shapeText } from "@/lib/letters/shape";
import { allSheetsSVG, computeParametric, LIBRARY, loadSource, packOutline, type ParametricParams, type SliceResult } from "@/lib/parametric";
import { CLOCK_INSERTS, FORMULA_DEFAULTS, LEAF_CLOCK, mergeParametricParams, PARAMETRIC_DEFAULTS, TEXT_DEFAULTS } from "@/lib/parametric/defaults";
import { designParams, randomDesign } from "@/lib/parametric/generator";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";
import { addWatermark, needsWatermark, parametricLocks, type Plan } from "@/lib/plans";
import { finishScene, type Scene3D } from "@/lib/three/flat";
import { coerce, fileNameOf, FONTS_BY_STYLE, MATERIAL_OPTIONS, modelPart, sheetSize, withDefault, type GenerateResult } from "./products";
import type { DField, DForm, DIssue, DProduct, DSection, GenerateRequest, GenerateResponse } from "./types";

type P = ParametricParams;

interface Spec {
  f: DField;
  get: (p: P) => unknown;
  set: (p: P, v: unknown) => void;
  show?: (p: P) => boolean;
  /** Not a path in the settings: the app writes it at the top level, and it is applied from there. */
  virtual?: boolean;
}

const clone = <T,>(v: T): T => structuredClone(v);
const isText = (p: P) => p.source.kind === "text";
const isFormula = (p: P) => p.source.kind === "formula";
const method = (m: P["method"]) => (p: P) => p.method === m;

/** A setting at a plain path in the settings. */
const at = (f: DField, show?: (p: P) => boolean): Spec => ({
  f, show,
  get: (p) => getPath(p, f.key),
  set: (p, v) => { const q = setPath(p, f.key, v); Object.assign(p, q); },
});

const SOURCE_NAMES: Record<string, string> = {
  "formula:heightfield": "Formula surface", "formula:revolution": "Formula: turned shape", "formula:radial-profile": "Formula: sunburst", text: "Text",
};

const sourceValue = (p: P) => (p.source.kind === "library" ? `library:${p.source.id}` : p.source.kind === "formula" ? `formula:${p.source.type}` : p.source.kind);

function setSource(p: P, v: unknown) {
  const s = String(v);
  if (s === sourceValue(p)) return;
  if (s.startsWith("library:")) p.source = { kind: "library", id: s.slice(8) as Extract<P["source"], { kind: "library" }>["id"] };
  else if (s.startsWith("formula:")) p.source = clone(FORMULA_DEFAULTS[s.slice(8) as keyof typeof FORMULA_DEFAULTS]);
  else if (s === "text") p.source = clone(TEXT_DEFAULTS);
}

function numberSpec(pf: ParamField): Spec {
  const show = pf.sec === "text" ? (p: P) => isText(p) && (!pf.show || pf.show(p)) : pf.show;
  return {
    f: {
      kind: "number", key: pf.id, label: pf.label.replace(/°$/, ""), unit: pf.len ? "mm" : /°$/.test(pf.label) ? "deg" : "",
      min: pf.min ?? 0, max: pf.max ?? 10000, step: pf.step, ...(!pf.len && !pf.float ? { int: true } : {}),
    },
    get: (p) => { try { return pf.get(p); } catch { return undefined; } },
    set: (p, v) => pf.set(p, v as number),
    show,
    virtual: true,
  };
}

const nums = (sec: ParamField["sec"]) => PARAM_FIELDS.filter((f) => f.sec === sec).map(numberSpec);

function specs(): { id: string; title: string; help: string; specs: Spec[] }[] {
  return [
    {
      id: "source", title: "Shape", help: "What the sculpture is made from: a ready shape, a formula or text.",
      specs: [
        {
          f: {
            kind: "choice", key: "shape", label: "Shape", shuffle: true,
            options: [
              ...LIBRARY.map((l) => ({ v: `library:${l.id}`, text: l.name, title: l.note })),
              ...Object.entries(SOURCE_NAMES).map(([v, text]) => ({ v, text, pro: true })),
            ],
          },
          get: sourceValue, set: setSource, virtual: true,
        },
        at({ kind: "text", key: "source.text", label: "Text", maxLength: 200, placeholder: "Type a word" }, isText),
        at({ kind: "choice", key: "source.font", label: "Font", options: FONTS_BY_STYLE.map((b) => ({ v: b.id, text: b.scripts.includes("arabic") ? `${b.name} (Persian)` : b.name })) }, isText),
        at({ kind: "choice", key: "source.profile", label: "Profile", options: [{ v: "flat", text: "Flat" }, { v: "rounded", text: "Rounded" }] }, isText),
        at({ kind: "text", key: "source.expression", label: "Formula", maxLength: 2000, help: "The shape as a formula of x and y (surface), h (turned shape) or theta and s (sunburst)." }, isFormula),
        ...nums("formula"), ...nums("text"), ...nums("transform"),
      ],
    },
    {
      id: "method", title: "Build as", help: "How the shape is cut into flat parts.",
      specs: [
        at({ kind: "choice", key: "method", label: "Method", shuffle: true, options: [
          { v: "parallel", text: "Parallel fins" }, { v: "stacked", text: "Stacked layers", pro: true }, { v: "waffle", text: "Waffle", pro: true },
          { v: "radial", text: "Radial fins", pro: true }, { v: "curveNormal", text: "Fins along a curve", pro: true }, { v: "folded", text: "Folded nets", pro: true },
        ] }),
        at({ kind: "choice", key: "parallel.axis", label: "Fins", options: [{ v: "X", text: "Upright" }, { v: "Y", text: "Level" }] }, method("parallel")),
        at({ kind: "choice", key: "parallel.backboard", label: "Backboard", options: [{ v: "none", text: "None" }, { v: "plate", text: "Plate" }, { v: "slats", text: "Slats" }] }, method("parallel")),
        at({ kind: "toggle", key: "parallel.fillEmptySlots", label: "Slats across the whole board" }, (p) => p.method === "parallel" && p.parallel.backboard === "slats"),
        at({ kind: "choice", key: "stacked.axis", label: "Layers", options: [{ v: "Y", text: "Level" }, { v: "Z", text: "Against the wall" }] }, method("stacked")),
        at({ kind: "toggle", key: "stacked.dowels", label: "Dowel holes" }, method("stacked")),
        at({ kind: "toggle", key: "stacked.hollow", label: "Hollow layers" }, method("stacked")),
        at({ kind: "toggle", key: "stacked.registrationMarks", label: "Registration marks" }, method("stacked")),
        at({ kind: "toggle", key: "waffle.baseRibs", label: "Base ribs" }, method("waffle")),
        at({ kind: "choice", key: "radial.axis", label: "Axis", options: [{ v: "X", text: "X" }, { v: "Y", text: "Y" }, { v: "Z", text: "Z" }] }, method("radial")),
        { f: { kind: "choice", key: "radial.hubPlates", label: "Hub rings", options: [{ v: "0", text: "None" }, { v: "1", text: "One" }, { v: "2", text: "Two" }] }, get: (p) => String(p.radial.hubPlates), set: (p, v) => { p.radial.hubPlates = Number(v) as 0 | 1 | 2; }, show: method("radial") },
        { f: { kind: "choice", key: "guideShape", label: "Guide", options: [{ v: "ellipse", text: "Ellipse" }, { v: "circle", text: "Circle" }] }, virtual: true, get: (p) => p.curveNormal.guide.kind, set: (p, v) => {
          const g = p.curveNormal.guide;
          if (v === g.kind) return;
          p.curveNormal.guide = g.kind === "ellipse" ? { kind: "circle", d: g.w } : { kind: "ellipse", w: g.d, h: g.d };
        }, show: method("curveNormal") },
        { f: { kind: "toggle", key: "autoFins", label: "Fins from the spacing" }, virtual: true, get: (p) => p.curveNormal.count === null, set: (p, v) => { p.curveNormal.count = v ? null : 48; }, show: method("curveNormal") },
        { f: { kind: "choice", key: "outline", label: "Outline", options: [{ v: "none", text: "None" }, { v: "ellipse", text: "Ellipse" }, { v: "formula", text: "Formula" }] }, virtual: true, get: (p) => p.curveNormal.outerBoundary.kind, set: (p, v) => {
          if (v === p.curveNormal.outerBoundary.kind) return;
          p.curveNormal.outerBoundary = v === "ellipse" ? { kind: "ellipse", w: 300, h: 200 } : v === "formula" ? clone(LEAF_CLOCK.outerBoundary) : { kind: "none" };
        }, show: method("curveNormal") },
        at({ kind: "text", key: "curveNormal.outerBoundary.expression", label: "Outline formula", maxLength: 2000, help: "The outline's radius as a formula of the angle phi." }, (p) => p.method === "curveNormal" && p.curveNormal.outerBoundary.kind === "formula"),
        at({ kind: "text", key: "curveNormal.finLength", label: "Fin length", maxLength: 2000, help: "A formula of t (0 to 1 round the guide)." }, method("curveNormal")),
        at({ kind: "text", key: "curveNormal.finHeight", label: "Fin height", maxLength: 2000, help: "A formula of t, s (along the fin) and L (its length)." }, method("curveNormal")),
        at({ kind: "text", key: "curveNormal.twist", label: "Twist", maxLength: 2000, help: "Degrees, a formula of t." }, method("curveNormal")),
        at({ kind: "toggle", key: "curveNormal.backPlate", label: "Back plate" }, method("curveNormal")),
        at({ kind: "choice", key: "curveNormal.centerFeature", label: "Centre", options: [{ v: "none", text: "Nothing" }, { v: "clock-insert", text: "Clock insert" }, { v: "mirror", text: "Mirror" }, { v: "opening", text: "Opening" }] }, method("curveNormal")),
        { f: { kind: "choice", key: "curveNormal.clockInsertDia", label: "Clock insert", options: CLOCK_INSERTS.map((d) => ({ v: String(d), text: `${d} mm` })) }, get: (p) => String(p.curveNormal.clockInsertDia), set: (p, v) => { p.curveNormal.clockInsertDia = Number(v); }, show: (p) => p.method === "curveNormal" && p.curveNormal.centerFeature === "clock-insert" },
        at({ kind: "toggle", key: "folded.tabs", label: "Glue tabs" }, method("folded")),
        at({ kind: "toggle", key: "folded.numbers", label: "Edge numbers" }, method("folded")),
        ...nums("method"),
      ],
    },
    {
      id: "material", title: "Material", help: "The sheet you cut: its thickness and the laser's kerf.",
      specs: [
        { f: { kind: "choice", key: "material.id", label: "Material", options: MATERIAL_OPTIONS }, get: (p) => p.material.id, set: (p, v) => {
          const m = MATERIALS[String(v)];
          p.material.id = String(v);
          if (m && m.T != null && m.K != null) { p.material.T = m.T; p.material.K = m.K; }
        } },
        ...nums("material").map((s) => ({ ...s, set: (p: P, v: unknown) => { s.set(p, v); p.material.id = "custom"; } })),
        at({ kind: "choice", key: "material.grain", label: "Grain", options: [{ v: "any", text: "Any" }, { v: "along-x", text: "Along X" }, { v: "along-y", text: "Along Y" }] }),
      ],
    },
    {
      id: "joints", title: "Joints", help: "Tabs, slots and dowels that hold the parts together.",
      specs: [
        { f: { kind: "toggle", key: "autoTabs", label: "Tabs from the spacing" }, virtual: true, get: (p) => p.joints.tabCount === null, set: (p, v) => { p.joints.tabCount = v ? null : 2; } },
        ...nums("joints"),
      ],
    },
    {
      id: "sheet", title: "Sheet", help: "Your laser bed and how parts are laid out on it.",
      specs: [
        ...nums("sheet"),
        at({ kind: "choice", key: "material.nest", label: "Packing", options: [{ v: "box", text: "Upright" }, { v: "outline", text: "True shape" }] }),
        at({ kind: "toggle", key: "material.calibration", label: "Calibration bar" }),
        at({ kind: "toggle", key: "labels.enabled", label: "Part labels" }),
        at({ kind: "choice", key: "labels.style", label: "Labels", options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }] }, (p) => p.labels.enabled),
      ],
    },
    { id: "quality", title: "Quality", help: "Detail and small pieces.", specs: nums("quality") },
  ];
}

let cached: ReturnType<typeof specs> | null = null;
const SPECS = () => (cached ??= specs());
const specOf = (key: string) => SPECS().flatMap((s) => s.specs).find((s) => s.f.key === key) ?? null;

const buildable = (p: P) => p.source.kind === "library" || p.source.kind === "formula" || p.source.kind === "text" || p.method === "curveNormal";

/** The default design, and versions of it where the fields of other shapes and methods apply. */
function defaultDesigns(): P[] {
  const d = PARAMETRIC_DEFAULTS;
  return [
    d,
    { ...clone(d), source: clone(TEXT_DEFAULTS) },
    ...Object.values(FORMULA_DEFAULTS).map((f) => ({ ...clone(d), source: clone(f) })),
    { ...clone(d), method: "curveNormal", curveNormal: clone(LEAF_CLOCK) },
    { ...clone(d), method: "curveNormal", curveNormal: { ...clone(LEAF_CLOCK), outerBoundary: { kind: "ellipse", w: 300, h: 200 } } },
    { ...clone(d), sourceSettings: { ...clone(d.sourceSettings), targetSize: { axis: "height", value: 200 } } },
    { ...clone(d), joints: { ...clone(d.joints), tabCount: 2 } },
  ];
}

const defaultOf = (x: Spec, designs: P[]) => {
  for (const shown of [true, false]) {
    for (const p of designs) {
      if (shown && x.show && !x.show(p)) continue;
      const v = x.get(p);
      if (v !== undefined && v !== null && withDefault(x.f, v).default !== undefined) return v;
    }
  }
  return undefined;
};

export function parametricProduct(): DProduct {
  const designs = defaultDesigns();
  const sections: DSection[] = SPECS().map((s) => ({ id: s.id, title: s.title, help: s.help, fields: s.specs.map((x) => withDefault(x.f, defaultOf(x, designs))) }));
  return {
    id: "parametric", name: "Parametric", blurb: "Sculptures sliced into fins, layers or waffles from shapes, formulas and text.", icon: "shapes",
    sections,
    presets: PARAMETRIC_PRESETS.filter((pr) => buildable(mergeParametricParams(pr.params))).map((pr) => ({ id: pr.id, name: pr.name, note: pr.note, pro: parametricLocks("free", mergeParametricParams(pr.params)).length > 0 })),
  };
}

function parametricForm(p: P): DForm {
  const hidden: string[] = [];
  const values: Record<string, unknown> = {};
  for (const s of SPECS()) for (const x of s.specs) {
    let on = true;
    try { on = !x.show || x.show(p); } catch { on = false; }
    if (!on) { hidden.push(x.f.key); continue; }
    const v = x.get(p);
    if (v !== undefined) values[x.f.key] = v;
  }
  return { hidden, hiddenSections: [], labels: {}, values };
}

function cleanParametric(input: unknown): P | { error: string } {
  let p: P;
  try {
    p = mergeParametricParams(input && typeof input === "object" && !Array.isArray(input) ? (input as Partial<P>) : {});
  } catch {
    return { error: "Invalid sculpture settings." };
  }
  if (!p.source || typeof p.source !== "object" || typeof p.method !== "string") return { error: "Invalid sculpture settings." };
  if (typeof p.name !== "string") p.name = PARAMETRIC_DEFAULTS.name;
  p.name = p.name.slice(0, 120);
  if (p.source.kind === "formula" && !(p.source.resolution > 0 && p.source.resolution <= 512)) p.source.resolution = Math.min(512, Math.max(8, Math.round(Number(p.source.resolution) || 64)));
  if (p.source.kind === "text") p.source.text = String(p.source.text ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, 200);
  p.radial.hubPlates = ([0, 1, 2] as const).find((n) => n === Number(p.radial.hubPlates)) ?? PARAMETRIC_DEFAULTS.radial.hubPlates;
  p.curveNormal.clockInsertDia = Number(p.curveNormal.clockInsertDia) || PARAMETRIC_DEFAULTS.curveNormal.clockInsertDia;
  // Fields the app set at the top level (a section reset sends several at once).
  const loose = p as unknown as Record<string, unknown>;
  for (const s of SPECS()) for (const x of s.specs) {
    if (!x.virtual || !(x.f.key in loose)) continue;
    const c = coerce(x.f, loose[x.f.key]);
    delete loose[x.f.key];
    if ("error" in c) continue;
    try { x.set(p, c.v); } catch { /* not for this design */ }
  }
  return p;
}

function change(p: P, key: string, value: unknown): P | { error: string } {
  const s = specOf(key);
  if (!s) return { error: "Unknown setting." };
  const c = coerce(s.f, value);
  if ("error" in c) return c;
  const q = clone(p);
  try {
    s.set(q, c.v);
  } catch {
    return { error: "This setting does not apply to the current design." };
  }
  return q;
}

/** A random design for the same material and sheet; on the Free plan, one the plan includes. */
function randomParametric(p: P, plan: Plan, rnd: () => number = Math.random): P {
  const pick = <T,>(a: readonly T[]) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  if (plan === "pro") {
    const seed = 1 + Math.floor(rnd() * 999_998);
    return mergeParametricParams({ ...designParams(randomDesign(seed)), material: p.material, joints: p.joints, labels: p.labels, quality: p.quality, layers: p.layers });
  }
  // Free: a library shape in parallel fins.
  const q = clone(p);
  q.source = { kind: "library", id: pick(LIBRARY.filter((l) => !(q.source.kind === "library" && l.id === q.source.id))).id };
  q.method = "parallel";
  q.parallel = { ...q.parallel, axis: pick(["X", "Y"] as const), backboard: pick(["plate", "slats", "none"] as const), spacing: Math.round((q.material.T * (2 + rnd() * 2)) * 2) / 2 };
  return q;
}

/** The text source's outline, shaped here (the website shapes it in the browser). */
async function textOutline(p: P): Promise<{ file: ArrayBuffer } | { error: string }> {
  if (p.source.kind !== "text") return { error: "" };
  const hb = await serverHarfBuzz();
  const font = bundledFont(hb, p.source.font);
  if (!font) return { error: "This design uses a font uploaded on the website. Pick a built-in font, or open it in the full editor." };
  const out = shapeText(hb, await font, p.source.text, { direction: "auto", size: p.source.size, sizeMode: "capHeight", letterSpacing: p.source.letterSpacing });
  if (out.shaped.missing.length) return { error: `The font has no ${out.shaped.missing.map((c) => `“${c}”`).join(" ")}. Pick another font.` };
  return { file: packOutline(out.glyphs.flatMap((g) => g.contours)) };
}

/** The parts assembled, without edge lines (the app draws its own), named so explode can pair them. */
function parametricScene(r: SliceResult, T: number, explode: number): Scene3D {
  const parts = partsObject(r, T, explode * 40);
  for (const c of [...parts.children]) if ((c as THREE.LineSegments).isLineSegments) parts.remove(c);
  let i = 0;
  parts.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.name = String(m.userData.partId ?? `part-${i}`) + `#${i++}`;
    if (!m.geometry.getIndex()) {
      const n = m.geometry.getAttribute("position").count;
      m.geometry.setIndex(Array.from({ length: n }, (_, k) => k));
    }
  });
  // The model is y up with the wall at z = 0; the shared finish expects z up.
  const wrap = new THREE.Group();
  wrap.rotation.x = Math.PI / 2;
  wrap.add(parts);
  const inner = new THREE.Group();
  inner.add(wrap);
  return finishScene(inner);
}

const METHOD_NAMES: Record<P["method"], string> = { parallel: "Parallel fins", stacked: "Stacked layers", waffle: "Waffle", radial: "Radial fins", curveNormal: "Fins along a curve", folded: "Folded nets" };

function summaryOf(p: P): string {
  const src = p.source.kind === "library" ? (LIBRARY.find((l) => l.id === (p.source as { id: string }).id)?.name ?? "Shape") : SOURCE_NAMES[sourceValue(p)] ?? "Imported model";
  return `${p.method === "curveNormal" ? "Curve" : src} · ${METHOD_NAMES[p.method] ?? p.method}`;
}

const toIssues = (r: SliceResult): DIssue[] => r.warnings.map((w) => ({ code: w.code, level: "warn", message: w.message, fixes: [] }));

export async function generateParametric(r: GenerateRequest, plan: Plan): Promise<GenerateResult> {
  let start: P | { error: string };
  if (typeof r.preset === "string") {
    const pr = PARAMETRIC_PRESETS.find((x) => x.id === r.preset);
    if (!pr) return { status: 400, body: { error: "Unknown preset." } };
    start = mergeParametricParams(pr.params);
  } else start = cleanParametric(r.params ?? {});
  if ("error" in start) return { status: 400, body: { error: start.error } };
  let p = start;
  if (r.change) {
    const q = change(p, r.change.key, r.change.value);
    if ("error" in q) return { status: 400, body: { error: q.error } };
    p = q;
  }
  if (r.scale !== undefined) return { status: 400, body: { error: "This design cannot be scaled as a whole." } };
  if (r.randomise) p = randomParametric(p, plan);
  const base = (q: P, issues: DIssue[] = [], stats: GenerateResponse["stats"] = []): GenerateResponse => ({
    product: "parametric", params: q as unknown as Record<string, unknown>, form: parametricForm(q), issues, stats, summary: summaryOf(q), applied: [],
  });
  const invalid = parametricRequestError(p);
  if (invalid) return { status: 400, body: { ...base(p), error: invalid } };
  if (!buildable(p)) return { status: 422, body: { ...base(p), error: "Imported models and photos stay on the device that imported them. Open this design in the full editor." } };
  const early = parametricLocks(plan, p);
  if (early.length) return { status: 403, body: { ...base(p), locked: `${early.join(" and ")} ${early.length > 1 ? "are Pro features" : "is a Pro feature"}. Upgrade to Pro to preview and export it in the desktop app.` } };

  let file: ArrayBuffer | undefined;
  if (p.source.kind === "text" && p.method !== "curveNormal") {
    const t = await textOutline(p);
    if ("error" in t) return { status: 422, body: { ...base(p), error: t.error } };
    file = t.file;
  }
  let result: SliceResult;
  try {
    result = computeParametric(p, await loadSource(p, file), await serverManifold());
  } catch (e) {
    return { status: 422, body: { ...base(p), error: e instanceof Error && e.message ? e.message : "The sculpture could not be built." } };
  }
  const issues = toIssues(result);
  const stats = [
    { label: "Parts", value: String(result.stats.partCount) },
    { label: "Sheets", value: String(result.stats.sheetCount) },
    { label: "Material", value: MATERIALS[p.material.id]?.name ?? "Custom" },
  ];
  const late = parametricLocks(plan, p, result.stats.partCount);
  if (late.length) return { status: 403, body: { ...base(p, issues, stats), locked: `${late.join(" and ")} ${late.length > 1 ? "are Pro features" : "is a Pro feature"}. Upgrade to Pro to preview and export it in the desktop app.` } };
  if (!result.sheets.length) return { status: 422, body: { ...base(p, issues, stats), error: "There are no parts to cut. Make the shape larger or the spacing smaller." } };
  const watermark = needsWatermark(plan);
  const raw = allSheetsSVG(result, p, { watermark });
  const svg = watermark && !raw.includes("Made with HingeLab") ? addWatermark(raw) : raw;
  return {
    status: 200,
    body: { ...base(p, issues, stats), svg, fileName: fileNameOf(p.name, "parametric"), ...sheetSize(svg), watermark, ...modelPart(r, (e) => parametricScene(result, p.material.T, e)) },
  };
}
