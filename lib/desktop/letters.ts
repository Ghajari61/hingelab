/**
 * Letters in the desktop app, built on the server like every other product: the website's Letters
 * editor as a settings panel, shaped with HarfBuzz and the bundled fonts, with the same plan rule as
 * the website's export (Free: a Letter Box of one letter, with the mark). A design that uses a font
 * uploaded on the website is not built here; the app opens it in the website view.
 */
import { LETTER_FIELDS, MARQUEE_KEYS, isMarqueeKey, type LetterField } from "@/components/letters/fields";
import { MAX_EXPORT_TEXT } from "@/lib/billing/exportLetters";
import { bundledFont, serverHarfBuzz } from "@/lib/billing/letterFonts";
import { HINGE_RANGES } from "@/lib/billing/validate";
import { arrangeLetters } from "@/lib/fit/letters";
import { FRET_NAMES } from "@/lib/generators/fretwork";
import { getPath, setPath } from "@/lib/generators/path";
import { HINGE_FIELD_HELP } from "@/lib/help/fieldHelp";
import { MATERIALS } from "@/lib/hinge";
import { autoFixAll } from "@/lib/issues";
import { fontFor, lettersIssues, type FontSource } from "@/lib/issues/letters";
import { cleanCutout, exportLetterSVG, fontInfo, LETTER_CUTOUT_KINDS, LETTER_DEFAULTS, mergeLetterParams, type LetterModel, type LetterParams, type LoadedFont } from "@/lib/letters";
import { LETTER_PRESETS } from "@/lib/letters/presets";
import { randomLetterStyle } from "@/lib/letters/randomStyle";
import { buildLetterScene } from "@/lib/letters/scene3d";
import { addWatermark, hasPro, lettersLock, needsWatermark, type Plan } from "@/lib/plans";
import type { Scene3D } from "@/lib/three/flat";
import { applyFix, coerce, fieldOf, fileNameOf, FONTS_BY_STYLE, MATERIAL_OPTIONS, modelPart, sheetSize, toIssues, withDefault, withMaterial, type GenerateResult } from "./products";
import type { DField, DForm, DProduct, DSection, GenerateRequest, GenerateResponse } from "./types";

type NumField = Extract<DField, { kind: "number" }>;

const MODE_NAMES: Record<LetterParams["mode"], string> = { box: "Letter box", solid: "Solid letters", stencil: "Stencil" };

/** Settings the website leaves to the app (an empty box): null, or "auto" for the corner radius. */
const AUTO_KEYS = new Set(["minCornerRadius", "wallMaxLength", "stencilBridge"]);

const keyOf = (f: LetterField) => (isMarqueeKey(f.id) ? `marquee.${MARQUEE_KEYS[f.id]}` : f.id);

function letterNumber(f: LetterField): NumField {
  const [lo, hi] = (HINGE_RANGES as Record<string, [number, number] | undefined>)[f.id] ?? [f.min ?? 0, 10000];
  return {
    kind: "number", key: keyOf(f), label: f.label, help: (HINGE_FIELD_HELP as Record<string, string | undefined>)[f.id],
    unit: f.len ? "mm" : f.id === "stretch" ? "%" : "",
    min: f.min ?? lo, max: Math.min(f.max ?? hi, hi), step: f.step,
    ...(!f.len && !f.float ? { int: true } : {}),
    ...(AUTO_KEYS.has(f.id) ? { auto: "Auto" } : {}),
  };
}

const nums = (sec: LetterField["sec"]) => LETTER_FIELDS.filter((f) => f.sec === sec).map(letterNumber);

const FONT_FIELD: DField = {
  kind: "choice", key: "fontId", label: "Font", shuffle: true,
  options: FONTS_BY_STYLE.filter((b) => b.scripts.includes("latin") || b.scripts.includes("arabic")).map((b) => ({ v: b.id, text: b.scripts.includes("arabic") ? `${b.name} (Persian)` : b.name, title: b.note })),
};

export function lettersProduct(): DProduct {
  const sections: DSection[] = [
    {
      id: "text", title: "Text", help: "The words, the font and how big the letters are.",
      fields: [
        { kind: "text", key: "text", label: "Text", multiline: true, maxLength: MAX_EXPORT_TEXT, placeholder: "Type a name or word", help: "Letters, numbers and Persian text. A new line starts a new row." },
        FONT_FIELD,
        { kind: "choice", key: "sizeMode", label: "Size measures", options: [{ v: "capHeight", text: "Cap height", title: "Size is the height of a capital letter such as H" }, { v: "totalHeight", text: "Total height", title: "Size is the full height of the text, ascenders and descenders included" }] },
        ...nums("text"),
        { kind: "toggle", key: "noWeld", label: "No Weld", help: "Keep glyphs and detached dots separate; retain the previous weld settings." },
        { kind: "choice", key: "weld", label: "Weld", options: [{ v: "word", text: "Whole word", title: "Letters that touch become one piece" }, { v: "letters", text: "Each letter", title: "One piece per letter, even where letters touch" }] },
        { kind: "choice", key: "direction", label: "Direction", options: [{ v: "auto", text: "Auto" }, { v: "ltr", text: "Left to right" }, { v: "rtl", text: "Right to left" }] },
      ],
    },
    {
      id: "style", title: "Style", help: "A box in the shape of the letters, solid letters, or a stencil.",
      fields: [
        { kind: "choice", key: "mode", label: "Make", shuffle: true, options: [{ v: "box", text: "Letter box", title: "A box in the shape of the letters, with walls" }, { v: "solid", text: "Solid", title: "Flat letter shapes", pro: true }, { v: "stencil", text: "Stencil", title: "Letters cut out of one sheet", pro: true }] },
        { kind: "choice", key: "wallStyle", label: "Walls", shuffle: true, options: [{ v: "hinge", text: "Living hinge", title: "One bendable strip per outline" }, { v: "faceted", text: "Flat panels", title: "Flat panels joined at the corners" }] },
        { kind: "choice", key: "lid", label: "Lid", options: [{ v: "open", text: "Open tray" }, { v: "fixed", text: "Fixed lid" }, { v: "removable", text: "Removable lid" }] },
      ],
    },
    {
      id: "box", title: "Box", help: "Depth, corners and the small pieces of a letter box.",
      fields: [
        { kind: "choice", key: "corners", label: "Corners", help: "Keep the letter's sharp corners (the wall is split into strips that meet at each corner), or round them so one strip bends all the way round.", options: [{ v: "joint", text: "Keep", title: "Strips meet at each corner" }, { v: "round", text: "Round off", title: "One strip per outline, corners rounded" }] },
        ...nums("box"),
        { kind: "choice", key: "smallIslands", label: "Small pieces", help: "Dots and accents too small to box.", options: [{ v: "flat", text: "Cut flat", title: "Cut them as flat pieces to glue on top of the lid" }, { v: "drop", text: "Leave out" }] },
        { kind: "toggle", key: "stackIslands", label: "Stack to full height", help: "Cut each small piece enough times to glue into a stack as tall as the box." },
        { kind: "toggle", key: "marquee.enabled", label: "Marquee light holes", help: "Round holes in the lid (or the base of an open tray) for bulbs." },
        ...nums("marquee"),
        { kind: "choice", key: "cutout.kind", label: "Cut-out pattern", help: "A decorative pattern cut through the lid, the base or both, inside the walls and clear of the slots and light holes.", options: [{ v: "none", text: "None" }, ...LETTER_CUTOUT_KINDS.map((v) => ({ v, text: FRET_NAMES[v] }))], default: "none" },
        { kind: "choice", key: "cutout.on", label: "Put it on", options: [{ v: "both", text: "Lid and base" }, { v: "lid", text: "Lid" }, { v: "base", text: "Base" }], default: "both" },
        { kind: "number", key: "cutout.cell", label: "Pattern size", unit: "mm", min: 6, max: 80, step: 0.5, default: 16 },
        { kind: "number", key: "cutout.bar", label: "Bar width", unit: "mm", min: 1, max: 15, step: 0.25, default: 3 },
      ],
    },
    {
      id: "solid", title: "Solid and stencil", help: "Bridges that hold pieces together.",
      fields: [
        { kind: "choice", key: "operation", label: "Letters", options: [{ v: "cut", text: "Cut" }, { v: "score", text: "Score" }], help: "Score traces letters without cutting them out or applying kerf." },
        { kind: "toggle", key: "weldDots", label: "Weld dots", help: "Join every separate piece of a word, dots and accents included, with small bridges so each word cuts as one part." },
        { kind: "choice", key: "bridgesPerIsland", label: "Bridges per centre", options: [{ v: "1", text: "One", title: "One bridge across the thinnest stroke" }, { v: "2", text: "Two", title: "A second bridge at least 120° from the first" }] },
        ...nums("solid"),
      ],
    },
    { id: "mat", title: "Material", help: "The sheet you cut: its thickness and the laser's kerf.", fields: [{ kind: "choice", key: "material", label: "Material", options: MATERIAL_OPTIONS }, ...nums("mat")] },
    {
      id: "hinge", title: "Hinge pattern", help: "The living-hinge cuts where the letters curve.",
      fields: [
        { kind: "choice", key: "cutStyle", label: "Cut style", options: [{ v: "slot", text: "Slots" }, { v: "line", text: "Single line" }] },
        { kind: "choice", key: "pattern", label: "Pattern", shuffle: true, options: [{ v: "straight", text: "Straight" }, { v: "wave", text: "Wave" }, { v: "relief", text: "Relief" }, { v: "serpentine", text: "Serpentine" }] },
        ...nums("hinge"),
      ],
    },
    { id: "joints", title: "Joints and fit", help: "Tabs on the walls and the slots they fit.", fields: nums("joints") },
    { id: "sheet", title: "Sheet", help: "Your laser bed and how parts are laid out on it.", fields: [...nums("sheet"), { kind: "toggle", key: "labels", label: "Engrave part names" }] },
  ];
  const start = LETTER_DEFAULTS as unknown as Record<string, unknown>;
  return {
    id: "letters", name: "Letters", blurb: "Names and words as letter boxes with hinge walls, solid letters or stencils.", icon: "type",
    sections: sections.map((s) => ({ ...s, fields: s.fields.map((f) => withDefault(f, f.key === "bridgesPerIsland" ? String(start.bridgesPerIsland) : getPath(start, f.key))) })),
    presets: LETTER_PRESETS.map((pr) => ({ id: pr.id, name: pr.name, note: pr.note, pro: !!lettersLock("free", mergeLetterParams(pr.params)) })),
  };
}

function lettersForm(p: LetterParams): DForm {
  const hidden: string[] = [];
  for (const f of LETTER_FIELDS) if (f.show && !f.show(p)) hidden.push(keyOf(f));
  const box = p.mode === "box";
  if (!box) hidden.push("wallStyle", "lid");
  if (!box || p.wallStyle !== "hinge") hidden.push("corners");
  if (p.smallIslands !== "flat") hidden.push("stackIslands");
  if (!p.marquee.enabled) hidden.push(...Object.values(MARQUEE_KEYS).map((k) => `marquee.${k}`));
  if (!cleanCutout(p.cutout)) hidden.push("cutout.on", "cutout.cell", "cutout.bar");
  if (p.mode !== "stencil") hidden.push("bridgesPerIsland");
  if (p.mode !== "solid") hidden.push("weldDots", "operation");
  if (p.noWeld) hidden.push("weld", "weldDots");
  if (p.operation === "score") hidden.push("weldDots");
  const hiddenSections = [...(box ? ["solid"] : ["box", "joints"]), ...(box && p.wallStyle === "hinge" ? [] : ["hinge"])];
  const labels: Record<string, string> = { "marquee.enabled": `Marquee light holes in the ${p.lid === "open" ? "base" : "lid"}` };
  if (p.smallIslands === "flat") labels.stackIslands = `Stack to full height (${Math.max(1, Math.round(p.depth / p.T))} layers)`;
  return { hidden: [...new Set(hidden)], hiddenSections, labels };
}

const clampText = (s: unknown) => (typeof s === "string" ? [...s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")].slice(0, MAX_EXPORT_TEXT).join("") : LETTER_DEFAULTS.text);

/** Settings from a request or a file, with every value the panel shows inside its range. */
export function cleanLetters(input: unknown, product: DProduct): LetterParams {
  const p = mergeLetterParams(input && typeof input === "object" && !Array.isArray(input) ? (input as Partial<LetterParams>) : {});
  let q = { ...p, text: clampText(p.text), name: typeof p.name === "string" ? p.name.slice(0, 120) : LETTER_DEFAULTS.name, fontId: typeof p.fontId === "string" ? p.fontId.slice(0, 120) : LETTER_DEFAULTS.fontId } as LetterParams;
  for (const s of product.sections) {
    for (const f of s.fields) {
      if (f.key === "text" || f.key === "fontId") continue;
      const v = f.key === "bridgesPerIsland" ? String(q.bridgesPerIsland) : getPath(q, f.key);
      const d = f.key === "bridgesPerIsland" ? String(LETTER_DEFAULTS.bridgesPerIsland) : getPath(LETTER_DEFAULTS, f.key);
      let next: unknown = v;
      if (f.kind === "number") {
        if (f.auto && (v === null || v === "auto")) {
          if (f.key === "minCornerRadius") q = { ...q, minCornerRadius: "auto" };
          continue;
        }
        next = typeof v === "number" && Number.isFinite(v) ? Math.min(f.max, Math.max(f.min, v)) : d;
      } else if (f.kind === "choice") next = f.options.some((o) => o.v === String(v)) ? v : d;
      else if (f.kind === "toggle") next = typeof v === "boolean" ? v : d;
      if (next !== v && f.key !== "bridgesPerIsland") q = setPath(q, f.key, next);
    }
  }
  return { ...q, bridgesPerIsland: Number(q.bridgesPerIsland) === 2 ? 2 : 1 };
}

type Change = { key: string; value: unknown };

function changeLetters(p: LetterParams, product: DProduct, change: Change): LetterParams | { error: string } {
  const f = fieldOf(product, change.key);
  if (!f) return { error: "Unknown setting." };
  if (f.kind === "number" && f.auto && (change.value === null || change.value === "")) {
    return { ...p, [change.key]: change.key === "minCornerRadius" ? "auto" : null } as LetterParams;
  }
  const c = coerce(f, change.value);
  if ("error" in c) return c;
  if (change.key === "material") return withMaterial(p, c.v as string);
  if (change.key === "text") return { ...p, text: clampText(c.v) };
  if (change.key === "bridgesPerIsland") return { ...p, bridgesPerIsland: c.v === "2" ? 2 : 1 };
  let q = setPath(p, change.key, c.v);
  if ((change.key === "T" || change.key === "K") && q.material !== "custom") q = { ...q, material: "custom" };
  return q;
}

/** A Letters design from settings (a file or a preset) with edits applied, for the AI designer. */
export function lettersFromChanges(product: DProduct, preset: string | null, changes: Change[], from?: Record<string, unknown>): { params: Record<string, unknown>; skipped: string[] } {
  const pr = preset ? LETTER_PRESETS.find((x) => x.id === preset) : undefined;
  let p = cleanLetters(from ?? pr?.params ?? {}, product);
  const skipped: string[] = [];
  for (const c of changes) {
    const q = changeLetters(p, product, c);
    if ("error" in q) skipped.push(c.key);
    else p = q;
  }
  return { params: p as unknown as Record<string, unknown>, skipped };
}

function summaryOf(p: LetterParams): string {
  const words = p.text.trim().replace(/\s+/g, " ");
  const text = words ? `“${[...words].length > 24 ? [...words].slice(0, 23).join("") + "…" : words}”` : "No text";
  return `${MODE_NAMES[p.mode]} · ${text} · ${fontInfo(p.fontId)?.name ?? "Uploaded font"} · ${p.size} mm`;
}

export async function generateLetters(r: GenerateRequest, product: DProduct, plan: Plan): Promise<GenerateResult> {
  let p: LetterParams;
  if (typeof r.preset === "string") {
    const pr = LETTER_PRESETS.find((x) => x.id === r.preset);
    if (!pr) return { status: 400, body: { error: "Unknown preset." } };
    p = cleanLetters(pr.params, product);
  } else p = cleanLetters(r.params ?? {}, product);
  if (r.change) {
    const q = changeLetters(p, product, r.change);
    if ("error" in q) return { status: 400, body: { error: q.error } };
    p = q;
  }
  if (r.scale !== undefined) return { status: 400, body: { error: "This design cannot be scaled as a whole." } };
  if (r.randomise) {
    const locked = new Set(r.randomise.locked ?? []);
    const style = randomLetterStyle(p, { pro: hasPro(plan) });
    for (const [k, v] of Object.entries(style)) if (!locked.has(k)) p = { ...p, [k]: v };
  }
  const base = (q: LetterParams, issues: GenerateResponse["issues"] = [], applied: string[] = []): GenerateResponse => ({
    product: "letters", params: q as unknown as Record<string, unknown>, form: lettersForm(q), issues, stats: [], summary: summaryOf(q), applied,
  });
  if (!p.text.trim()) return { status: 422, body: { ...base(p), error: "Type the text to cut." } };

  const hb = await serverHarfBuzz();
  const loaded = new Map<string, LoadedFont>();
  const load = async (id: string) => {
    if (!loaded.has(id)) {
      const f = bundledFont(hb, id);
      if (f) loaded.set(id, await f);
    }
    return loaded.get(id) ?? null;
  };
  const uploaded = () => ({ status: 422, body: { ...base(p), error: "This design uses a font uploaded on the website. Pick a built-in font, or open it in the full editor." } });
  if (!(await load(p.fontId))) return uploaded();
  // A fix may suggest the bundled font that covers the text: have it ready for the checks.
  const other = fontFor(p.text, p.fontId);
  if (other) await load(other).catch(() => null);
  const fonts: FontSource = (id) => loaded.get(id) ?? null;

  let applied: string[] = [];
  if (r.autofix) {
    const res = autoFixAll(p, (q) => lettersIssues(q, fonts, hb));
    p = cleanLetters(res.params, product);
    applied = res.applied;
  } else if (r.fix) {
    const res = applyFix(p, lettersIssues(p, fonts, hb), r.fix);
    p = cleanLetters(res.p, product);
    applied = res.applied;
  }
  const font = fonts(p.fontId);
  if (!font) return uploaded();

  const a = arrangeLetters(p, font, hb);
  const issues = toIssues(lettersIssues(p, fonts, hb, a));
  const lock = lettersLock(plan, p);
  if (lock) return { status: 403, body: { ...base(p, issues, applied), locked: `${lock} Upgrade to Pro to preview and export it in the desktop app.` } };
  if ("error" in a.result) return { status: 422, body: { ...base(p, issues, applied), error: a.result.error } };
  if (!a.lay) return { status: 422, body: { ...base(p, issues, applied), error: "The parts could not be laid out." } };
  const raw = exportLetterSVG(a.lay, a.params, font.name);
  const watermark = needsWatermark(plan);
  const svg = watermark ? addWatermark(raw) : raw;
  const size = sheetSize(svg);
  const stats = [
    { label: "Parts", value: String(a.lay.items.length) },
    { label: "Sheet", value: size.width ? `${Math.round(size.width)} × ${Math.round(size.height!)} mm` : "-" },
    { label: "Material", value: MATERIALS[p.material]?.name ?? "Custom" },
  ];
  const model = a.result as LetterModel;
  return {
    status: 200,
    body: { ...base(p, issues, applied), stats, svg, fileName: fileNameOf(p.name, "letters"), ...size, watermark, ...modelPart(r, (e) => buildLetterScene(model, a.params, e) as Scene3D) },
  };
}
