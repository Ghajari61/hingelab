/**
 * The desktop app's products, built on the server: a catalog of plain-data settings panels, and
 * `generateDesign`, which applies an edit, runs the checks and fixes, enforces the caller's plan
 * and returns the SVG. The geometry never leaves the server; the app only renders what it gets.
 */
import { FIELDS, type FieldDef } from "@/components/editor/fields";
import { HINGE_RANGES, hingeRequestError } from "@/lib/billing/validate";
import { serverBuildContext } from "@/lib/billing/exportGenerator";
import { arrangeHinge } from "@/lib/fit/hinge";
import { GENERATOR_IDS, GENERATOR_INFO, isGeneratorId, type GeneratorId } from "@/lib/generators/ids";
import { arrangeGenerator, genSVG, sheetIssues } from "@/lib/generators/output";
import { getPath, setPath } from "@/lib/generators/path";
import { loadGenerator } from "@/lib/generators/registry";
import { sanitizeGeneratorParams } from "@/lib/generators/sanitize";
import { MAX_BATCH, MAX_BATCH_TEXT, MAX_COPIES, type AnyGenerator, type FieldSpec, type GenBase } from "@/lib/generators/types";
import { HINGE_FIELD_HELP } from "@/lib/help/fieldHelp";
import { clone, DEFAULTS, exportSVG, MATERIALS, mergeParams, type Params } from "@/lib/hinge";
import { HINGE_PRESETS, hingePresetParams } from "@/lib/hinge/presets";
import { autoFixAll, sortIssues, type Issue } from "@/lib/issues";
import { hingeIssues } from "@/lib/issues/hinge";
import { BUNDLED_FONTS, FONT_CATEGORIES } from "@/lib/letters/fonts";
import { addWatermark, FREE_PATTERNS, FREE_SHAPES, hingeLocks, needsWatermark, PATTERN_NAMES, SHAPE_NAMES, type Plan } from "@/lib/plans";
import { generatorScene } from "@/lib/generators/scene3d";
import { buildHingeScene } from "@/lib/hinge3d/scene";
import type { Scene3D } from "@/lib/three/flat";
import { sceneModel } from "./model3d";
import type { DCatalog, D3Model, DesktopProductId, DField, DForm, DIssue, DProduct, DSection, GenerateRequest, GenerateResponse } from "./types";

const FONTS_BY_STYLE = FONT_CATEGORIES.flatMap((c) => BUNDLED_FONTS.filter((f) => f.category === c.id));

const DESKTOP_GENERATORS: readonly GeneratorId[] = GENERATOR_IDS;
export const DESKTOP_PRODUCTS: DesktopProductId[] = ["hinge", ...DESKTOP_GENERATORS];
export const CATALOG_VERSION = 1;

export const isDesktopProduct = (v: unknown): v is DesktopProductId => v === "hinge" || isGeneratorId(v);

const MATERIAL_OPTIONS = Object.entries(MATERIALS).map(([v, m]) => ({ v, text: m.name }));

// ---------------------------------------------------------------- Hinge Box

const HINGE_SECTIONS: { id: FieldDef["sec"] | "secShape"; title: string; help: string }[] = [
  { id: "secShape", title: "Shape", help: "The box's outline and lid." },
  { id: "secDims", title: "Dimensions", help: "Outside sizes of the box, in millimetres." },
  { id: "secMat", title: "Material", help: "The sheet you cut: its thickness and the laser's kerf." },
  { id: "secHinge", title: "Hinge", help: "The living-hinge pattern cut into the bending wall." },
  { id: "secJoints", title: "Joints", help: "Tabs and slots that join the wall to the base and lid." },
  { id: "secSheet", title: "Sheet", help: "Your laser bed and how parts are laid out on it." },
];

function hingeNumber(f: FieldDef): DField {
  const [lo, hi] = HINGE_RANGES[f.id] ?? [0, 10000];
  return {
    kind: "number", key: f.id, label: f.label, help: HINGE_FIELD_HELP[f.id],
    unit: f.len ? "mm" : f.id === "stretch" ? "%" : "",
    min: f.min ?? lo, max: Math.min(f.max ?? hi, hi), step: f.step,
    ...(!f.len && !f.float ? { int: true } : {}),
  };
}

function hingeProduct(): DProduct {
  const extra: Record<string, DField[]> = {
    secShape: [
      { kind: "choice", key: "shape", label: "Shape", options: (["rect", "pill", "poly", "cyl"] as const).map((v) => ({ v, text: SHAPE_NAMES[v], pro: !FREE_SHAPES.includes(v) })) },
      { kind: "choice", key: "lid", label: "Lid", options: [{ v: "open", text: "Open tray", title: "No lid" }, { v: "fixed", text: "Fixed lid", title: "A lid joined to the walls" }, { v: "removable", text: "Removable lid", title: "A lid with a lip that lifts off" }] },
    ],
    secMat: [{ kind: "choice", key: "material", label: "Material", options: MATERIAL_OPTIONS }],
    secHinge: [
      { kind: "choice", key: "pattern", label: "Pattern", options: (["straight", "wave", "relief", "serpentine", "honeycomb"] as const).map((v) => ({ v, text: PATTERN_NAMES[v], pro: !FREE_PATTERNS.includes(v) })) },
      { kind: "choice", key: "cutStyle", label: "Cut style", options: [{ v: "slot", text: "Slots" }, { v: "line", text: "Single line" }] },
    ],
  };
  const tail: Record<string, DField[]> = {
    secJoints: [{ kind: "choice", key: "split", label: "Wall", options: [{ v: "1", text: "One strip" }, { v: "2", text: "Two halves" }] }],
    secSheet: [
      { kind: "toggle", key: "labels", label: "Engrave part names" },
      { kind: "toggle", key: "testStrip", label: "Add a bend test strip" },
    ],
  };
  const sections: DSection[] = HINGE_SECTIONS.map((s) => ({
    id: s.id, title: s.title, help: s.help,
    fields: [...(extra[s.id] ?? []), ...FIELDS.filter((f) => f.sec === s.id && !f.unset).map(hingeNumber), ...(tail[s.id] ?? [])],
  }));
  const presets = HINGE_PRESETS.map((pr) => ({ id: pr.id, name: pr.name, note: pr.note, pro: hingeLocks("free", hingePresetParams(pr.params)).length > 0 }));
  return { id: "hinge", name: "Hinge Box", blurb: "Living-hinge boxes in rounded, pill, polygon and cylinder shapes, with tabs and a lid.", icon: "box", sections, presets };
}

function hingeForm(p: Params): DForm {
  const hidden: string[] = [];
  const labels: Record<string, string> = {};
  for (const f of FIELDS) {
    if (f.show && !f.show(p)) hidden.push(f.id);
    if (f.lab) labels[f.id] = f.lab(p);
  }
  if (p.lid === "open") hidden.push("lidGap");
  return { hidden: [...new Set(hidden)], hiddenSections: [], labels };
}

// ---------------------------------------------------------------- Generators

/** Material and sheet settings every generator shares (the web editor's dock). */
const GEN_SHEET: DSection = {
  id: "_sheet", title: "Material and sheet", help: "The sheet you cut, your laser bed and how parts are laid out.",
  fields: [
    { kind: "choice", key: "material", label: "Material", options: MATERIAL_OPTIONS },
    { kind: "number", key: "T", label: "Thick", help: HINGE_FIELD_HELP.T, unit: "mm", min: 0.5, max: 30, step: 0.1 },
    { kind: "number", key: "K", label: "Kerf", help: HINGE_FIELD_HELP.K, unit: "mm", min: 0, max: 1, step: 0.01 },
    { kind: "number", key: "bedW", label: "Bed W", help: HINGE_FIELD_HELP.bedW, unit: "mm", min: 50, max: 10000, step: 10 },
    { kind: "number", key: "bedH", label: "Bed H", help: HINGE_FIELD_HELP.bedH, unit: "mm", min: 50, max: 10000, step: 10 },
    { kind: "number", key: "gap", label: "Spacing", help: HINGE_FIELD_HELP.gap, unit: "mm", min: 0, max: 1000, step: 0.5 },
    { kind: "number", key: "sheet.copies", label: "Copies", help: "How many sets of parts to cut.", unit: "", min: 1, max: MAX_COPIES, step: 1, int: true },
    { kind: "choice", key: "sheet.nest", label: "Packing", options: [{ v: "box", text: "Upright" }, { v: "outline", text: "True shape" }] },
    { kind: "toggle", key: "sheet.labels", label: "Score part names" },
    { kind: "toggle", key: "sheet.calibration", label: "Calibration bar" },
    { kind: "toggle", key: "job.mirror", label: "Mirror", help: "Flip every part left to right, so engraving on the back of clear acrylic reads the right way from the front." },
    {
      kind: "text", key: "job.names", label: "Batch names", multiline: true, maxLength: MAX_BATCH_TEXT,
      placeholder: "One name per line", help: `One set of parts for each line, with that line as the design's text (up to ${MAX_BATCH} lines).`,
    },
  ],
};

const MAT_KEYS = new Set(["T", "K"]);

function genField(f: FieldSpec<GenBase>): DField | null {
  const common = { key: f.key, label: f.label, help: f.help };
  switch (f.kind) {
    case "number": return { kind: "number", ...common, unit: f.unit, min: f.min, max: f.max, step: f.step, ...(f.int ? { int: true } : {}) };
    case "choice": return { kind: "choice", ...common, options: f.options.filter((o) => o.input !== "picture").map((o) => ({ v: o.v, text: o.text, ...(o.title ? { title: o.title } : {}), ...(o.pro ? { pro: true } : {}) })) };
    case "toggle": return { kind: "toggle", ...common };
    case "text": return { kind: "text", ...common, placeholder: f.placeholder, multiline: f.multiline, maxLength: f.maxLength ?? 2000 };
    case "font": return { kind: "choice", ...common, options: FONTS_BY_STYLE.map((b) => ({ v: b.id, text: b.scripts.includes("arabic") ? `${b.name} (Persian)` : b.name, title: `${FONT_CATEGORIES.find((c) => c.id === b.category)?.name}: ${b.note}` })) };
    // Pictures are not offered in the desktop app yet.
    case "image": return null;
  }
}

function genProduct(id: GeneratorId, def: AnyGenerator): DProduct {
  const info = GENERATOR_INFO[id] as { name: string; blurb: string; icon: DProduct["icon"] };
  const sections: DSection[] = def.sections.map((s) => ({ id: s.id, title: s.title, help: s.help, fields: s.fields.map(genField).filter((f): f is DField => !!f) })).filter((s) => s.fields.length);
  return {
    id, name: info.name, blurb: info.blurb, icon: info.icon, sections: [...sections, GEN_SHEET],
    presets: def.presets.map((pr) => ({ id: pr.id, name: pr.name, note: pr.note, pro: !!pr.pro })),
    ...(def.scale ? { scale: true } : {}),
  };
}

function genForm(def: AnyGenerator, p: GenBase): DForm {
  const hidden: string[] = [];
  const hiddenSections: string[] = [];
  for (const s of def.sections) {
    if (s.show && !s.show(p)) hiddenSections.push(s.id);
    for (const f of s.fields) if (f.show && !f.show(p)) hidden.push(f.key);
  }
  if (!def.batch?.(p)) hidden.push("job.names");
  return { hidden, hiddenSections, labels: {} };
}

// ---------------------------------------------------------------- Catalog

let catalog: Promise<DCatalog> | null = null;

export function desktopCatalog(): Promise<DCatalog> {
  catalog ??= (async () => {
    const gens = await Promise.all(DESKTOP_GENERATORS.map(async (id) => genProduct(id, await loadGenerator[id]())));
    const { ART_PRODUCT } = await import("./art");
    return { version: CATALOG_VERSION, products: [hingeProduct(), ...gens], art: ART_PRODUCT };
  })();
  return catalog;
}

function fieldOf(product: DProduct, key: string): DField | null {
  for (const s of product.sections) for (const f of s.fields) if (f.key === key) return f;
  return null;
}

/** An edit, checked against the field it targets. Returns the new value or a message. */
export function coerce(f: DField, value: unknown): { v: unknown } | { error: string } {
  switch (f.kind) {
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      if (!Number.isFinite(n)) return { error: `${f.label} must be a number.` };
      const c = Math.min(f.max, Math.max(f.min, n));
      return { v: f.int ? Math.round(c) : c };
    }
    case "choice": {
      const s = String(value);
      return f.options.some((o) => o.v === s) ? { v: s } : { error: `Unknown option for ${f.label}.` };
    }
    case "toggle":
      return typeof value === "boolean" ? { v: value } : { error: `${f.label} must be on or off.` };
    case "text":
      return typeof value === "string" ? { v: value.slice(0, f.maxLength) } : { error: `${f.label} must be text.` };
  }
}

function withMaterial<T extends { material: string; T: number; K: number }>(p: T, id: string): T {
  const m = MATERIALS[id];
  const next = { ...p, material: id };
  if (m && m.T != null && m.K != null) { next.T = m.T; next.K = m.K; }
  return next;
}

// ---------------------------------------------------------------- Generate

export type GenerateResult = { status: number; body: GenerateResponse | { error: string } };

export const toIssues = <P>(list: Issue<P>[]): DIssue[] => sortIssues(list).map((i) => ({
  code: i.code, level: i.level, message: i.message, fixes: i.fixes.map((f) => ({ id: f.id, label: f.label, safe: f.safe })),
}));

export function applyFix<P>(p: P, issues: Issue<P>[], fix: GenerateRequest["fix"]): { p: P; applied: string[] } {
  if (!fix || typeof fix.code !== "string" || typeof fix.id !== "string") return { p, applied: [] };
  const f = issues.find((i) => i.code === fix.code)?.fixes.find((x) => x.id === fix.id);
  return f ? { p: f.apply(p), applied: [f.label] } : { p, applied: [] };
}

function sheetSize(svg: string): { width?: number; height?: number } {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : {};
}

const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The 3D model when the app asked for it; a design too large to send, or a failed build, sends none. */
export function modelPart(r: GenerateRequest, at: (explode: number) => Scene3D): { model?: D3Model } {
  if (r.model !== true) return {};
  try {
    const model = sceneModel(at);
    return model ? { model } : {};
  } catch (e) {
    console.error("desktop 3D model failed", e);
    return {};
  }
}

/**
 * One request from the desktop editor. The plan comes from the caller's session, never from the
 * request; a design the plan does not include gets 403 with no SVG at all, because anything sent
 * to the app can be saved from it.
 */
export async function generateDesign(req: unknown, plan: Plan): Promise<GenerateResult> {
  if (!plainObject(req) || !(isDesktopProduct(req.product) || req.product === "art")) return { status: 400, body: { error: "Unknown product." } };
  const r = req as unknown as GenerateRequest;
  if (r.params !== undefined && !plainObject(r.params)) return { status: 400, body: { error: "Invalid settings." } };
  if (r.change !== undefined && (!plainObject(r.change) || typeof r.change.key !== "string")) return { status: 400, body: { error: "Invalid change." } };
  if (r.fix !== undefined && !plainObject(r.fix)) return { status: 400, body: { error: "Invalid fix." } };
  if (r.scale !== undefined && !(typeof r.scale === "number" && r.scale >= 0.2 && r.scale <= 5)) return { status: 400, body: { error: "Invalid scale." } };
  if (r.change?.key === "name") {
    // The design's name is free text (used for the file name, which is sanitized separately).
    if (typeof r.change.value !== "string") return { status: 400, body: { error: "The name must be text." } };
    r.params = { ...(plainObject(r.params) ? r.params : {}), name: r.change.value.replace(/[\u0000-\u001f]/g, "").slice(0, 120) };
    delete r.change;
  }
  if (r.product === "art") return (await import("./art")).generateArt(r, plan);
  const product = (await desktopCatalog()).products.find((p) => p.id === r.product)!;
  return r.product === "hinge" ? generateHinge(r, product, plan) : generateGenerator(r, r.product, product, plan);
}

type Change = { key: string; value: unknown };

function changeHinge(p: Params, product: DProduct, change: Change): Params | { error: string } {
  const f = fieldOf(product, change.key);
  if (!f) return { error: "Unknown setting." };
  const c = coerce(f, change.value);
  if ("error" in c) return c;
  const key = change.key as keyof Params;
  let q: Params = key === "material" ? withMaterial(p, c.v as string) : ({ ...p, [key]: key === "split" ? Number(c.v) : c.v } as Params);
  if (FIELDS.some((x) => x.id === key && x.mat) && q.material !== "custom") q = { ...q, material: "custom" };
  return q;
}

function changeGenerator(def: AnyGenerator, product: DProduct, p: GenBase, change: Change): GenBase | { error: string } {
  const f = fieldOf(product, change.key);
  if (!f) return { error: "Unknown setting." };
  const c = coerce(f, change.value);
  if ("error" in c) return c;
  const key = change.key;
  const spec = def.sections.flatMap((s) => s.fields).find((x) => x.key === key);
  let q: GenBase;
  if (key === "material") q = withMaterial(p, c.v as string);
  else if (spec?.kind === "choice" && spec.apply) q = spec.apply(p, c.v as string);
  else q = setPath(p, key, c.v);
  if (MAT_KEYS.has(key) && q.material !== "custom") q = { ...q, material: "custom" };
  if (key === "sheet.copies" || key === "sheet.nest" || key === "sheet.labels" || key === "sheet.calibration") {
    q = setPath(q, "sheet", { nest: "box", calibration: false, labels: false, copies: 1, ...(getPath(q, "sheet") as object), [key.slice(6)]: c.v });
  }
  return q;
}

/**
 * A design's settings from a preset (or the defaults) with edits applied, each checked against its
 * field like an edit from the editor; an edit the catalog does not allow is skipped and reported.
 */
export async function designFromChanges(id: DesktopProductId, preset: string | null, changes: Change[], from?: Record<string, unknown>): Promise<{ params: Record<string, unknown>; skipped: string[] }> {
  const product = (await desktopCatalog()).products.find((x) => x.id === id)!;
  const skipped: string[] = [];
  if (id === "hinge") {
    const pr = preset ? HINGE_PRESETS.find((x) => x.id === preset) : undefined;
    let p = from ? mergeParams(from as Partial<Params>) : pr ? hingePresetParams(pr.params) : clone(DEFAULTS);
    for (const c of changes) {
      const q = changeHinge(p, product, c);
      if ("error" in q) skipped.push(c.key);
      else p = q;
    }
    return { params: p as unknown as Record<string, unknown>, skipped };
  }
  const def = await loadGenerator[id]();
  const pr = preset ? def.presets.find((x) => x.id === preset) : undefined;
  let p: GenBase = def.merge(from ?? (pr ? pr.params : {}));
  for (const c of changes) {
    const q = changeGenerator(def, product, p, c);
    if ("error" in q) skipped.push(c.key);
    else p = q;
  }
  return { params: sanitizeGeneratorParams(def, def.merge(p)) as unknown as Record<string, unknown>, skipped };
}

function generateHinge(r: GenerateRequest, product: DProduct, plan: Plan): GenerateResult {
  let p: Params;
  if (typeof r.preset === "string") {
    const pr = HINGE_PRESETS.find((x) => x.id === r.preset);
    if (!pr) return { status: 400, body: { error: "Unknown preset." } };
    p = hingePresetParams(pr.params);
  } else {
    p = r.params ? mergeParams(r.params as Partial<Params>) : clone(DEFAULTS);
  }
  if (r.change) {
    const q = changeHinge(p, product, r.change);
    if ("error" in q) return { status: 400, body: { error: q.error } };
    p = q;
  }
  const base = (q: Params, issues: DIssue[] = [], applied: string[] = []): GenerateResponse => ({
    product: "hinge", params: q as unknown as Record<string, unknown>, form: hingeForm(q), issues, stats: [], summary: hingeSummary(q), applied,
  });
  const invalid = hingeRequestError(p);
  if (invalid) return { status: 400, body: { ...base(p), error: invalid } };

  let applied: string[] = [];
  if (r.autofix) {
    const res = autoFixAll(p, hingeIssues);
    p = res.params;
    applied = res.applied;
  } else if (r.fix) {
    ({ p, applied } = applyFix(p, hingeIssues(p), r.fix));
  }
  const after = hingeRequestError(p);
  if (after) return { status: 400, body: { ...base(p, [], applied), error: after } };
  const issues = toIssues(hingeIssues(p));

  const locks = hingeLocks(plan, p);
  if (locks.length) {
    const locked = `${locks.join(" and ")} ${locks.length > 1 ? "are Pro features" : "is a Pro feature"}. Upgrade to Pro to preview and export it in the desktop app.`;
    return { status: 403, body: { ...base(p, issues, applied), locked } };
  }
  const a = arrangeHinge(p);
  if ("error" in a.result) return { status: 422, body: { ...base(p, issues, applied), error: a.result.error } };
  if (!a.lay) return { status: 422, body: { ...base(p, issues, applied), error: "The parts could not be laid out." } };
  const raw = exportSVG(a.result, a.lay, a.params);
  const watermark = needsWatermark(plan);
  const svg = watermark ? addWatermark(raw) : raw;
  const size = sheetSize(svg);
  const stats = [
    { label: "Parts", value: String(a.lay.items.length) },
    { label: "Sheet", value: size.width ? `${Math.round(size.width)} × ${Math.round(size.height!)} mm` : "-" },
    { label: "Material", value: MATERIALS[p.material]?.name ?? "Custom" },
  ];
  const model = a.result;
  return {
    status: 200,
    body: { ...base(p, issues, applied), stats, svg, fileName: fileNameOf(p.name, "hinge-box"), ...size, watermark, ...modelPart(r, (e) => buildHingeScene(model, a.params, e)) },
  };
}

function hingeSummary(p: Params): string {
  const size = p.shape === "cyl" ? `⌀${p.dia}` : p.shape === "poly" ? `${p.sides} sides × ${p.W}` : `${p.W} × ${p.D}`;
  return `${SHAPE_NAMES[p.shape]} · ${size} × ${p.H} mm · ${PATTERN_NAMES[p.pattern]}`;
}

/** A safe Windows file name: letters, digits, spaces, single dots, dashes and underscores. */
export function fileNameOf(name: string, fallback: string): string {
  let base = name.replace(/[^\p{L}\p{N} ._-]+/gu, " ").replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim().replace(/^[. ]+|[. ]+$/g, "").slice(0, 80).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `${base}-design`;
  return `${base || fallback}.svg`;
}

async function generateGenerator(r: GenerateRequest, id: GeneratorId, product: DProduct, plan: Plan): Promise<GenerateResult> {
  const def = await loadGenerator[id]();
  let p: GenBase;
  if (typeof r.preset === "string") {
    const pr = def.presets.find((x) => x.id === r.preset);
    if (!pr) return { status: 400, body: { error: "Unknown preset." } };
    p = def.merge(pr.params);
  } else {
    p = def.merge(r.params ?? {});
  }
  if (r.change) {
    const q = changeGenerator(def, product, p, r.change);
    if ("error" in q) return { status: 400, body: { error: q.error } };
    p = q;
  }
  if (r.scale !== undefined) {
    if (!def.scale) return { status: 400, body: { error: "This design cannot be scaled as a whole." } };
    p = def.scale(p, r.scale);
  }
  p = sanitizeGeneratorParams(def, def.merge(p));
  const ctx = await serverBuildContext(def, p);
  const base = (q: GenBase, issues: DIssue[] = [], applied: string[] = []): GenerateResponse => ({
    product: id, params: q as unknown as Record<string, unknown>, form: genForm(def, q), issues, stats: [], summary: def.summary(q), applied,
  });
  if (!ctx || "error" in ctx) return { status: 422, body: { ...base(p), error: "This design uses a font that is not available. Pick another font." } };

  const issuesOf = (q: GenBase): Issue<GenBase>[] => {
    const a = arrangeGenerator(def, q, ctx);
    if ("error" in a.result) return [];
    return [...def.check(q, a.result.out), ...sheetIssues(def, q, a)];
  };
  let applied: string[] = [];
  if (r.autofix) {
    const res = autoFixAll(p, issuesOf);
    p = sanitizeGeneratorParams(def, def.merge(res.params));
    applied = res.applied;
  } else if (r.fix) {
    const res = applyFix(p, issuesOf(p), r.fix);
    p = sanitizeGeneratorParams(def, def.merge(res.p));
    applied = res.applied;
  }
  const a = arrangeGenerator(def, p, ctx);
  if ("error" in a.result) return { status: 422, body: { ...base(p, [], applied), error: a.result.error } };
  const out = a.result.out;
  const issues = toIssues([...def.check(p, out), ...sheetIssues(def, p, a)]);
  const stats = out.stats;
  if (out.missing?.length) return { status: 422, body: { ...base(p, issues, applied), stats, error: "The font is missing some characters. Pick another font." } };
  if (!a.lay) return { status: 422, body: { ...base(p, issues, applied), stats, error: "The design does not fit on the sheet." } };
  const lock = def.pro?.(a.params, out) ?? null;
  if (lock && plan !== "pro") return { status: 403, body: { ...base(p, issues, applied), stats, locked: `${lock} Upgrade to Pro to preview and export it in the desktop app.` } };
  const svg = genSVG(def, a.params, a.lay);
  return {
    status: 200,
    body: { ...base(p, issues, applied), stats, svg, fileName: fileNameOf(def.fileName(a.params), id), ...sheetSize(svg), watermark: false, ...modelPart(r, (e) => generatorScene(out, a.params.T, e)) },
  };
}
