/**
 * Paper Box: folding cartons, mailers and gift boxes for a cutter or a laser. The geometry is the
 * paper box engine (lib/paperbox); the panels here are made from each style's schema, so a new
 * style needs no UI code.
 */
import { listBoxStyles, buildBox, paperById, type BoxStyle, type ParamField } from "@/lib/paperbox";
import type { FieldSpec, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { motifFonts } from "../motifArt";
import { patternArt, patternFields } from "../pattern";
import { FACE_TARGETS, WINDOW_SHAPES, type WindowShape } from "./decorate";
import { buildPaperBox, type PaperBoxOutput } from "./build";
import { mergePaperBox, PAPER_OPTIONS, PAPERBOX_DEFAULTS, PAPERBOX_VERSION, SHELL_KEYS, type PaperBoxParams } from "./params";
import { PAPERBOX_PRESETS } from "./presets";

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** One engine setting as a panel field, under styles.<style>.<key>. */
/** Sizes Randomise design throws (mm), kept to boxes that fold well. */
const SHUFFLE_SIZE: Record<string, [number, number]> = { L: [40, 160], W: [30, 120], H: [30, 140] };

function field(style: BoxStyle, f: ParamField): FieldSpec<PaperBoxParams> {
  const key = `styles.${style.id}.${f.key}`, help = sentence(f.help ?? f.label);
  const size = SHUFFLE_SIZE[f.key];
  switch (f.kind) {
    case "length": return { kind: "number", key, label: f.label, unit: "mm", min: f.min, max: f.max, step: f.step, help, ...(size ? { shuffle: [Math.max(f.min, size[0]), Math.min(f.max, size[1])] as [number, number] } : {}) };
    case "number": return { kind: "number", key, label: f.label, unit: f.unit ?? "", min: f.min, max: f.max, step: f.step, help };
    case "toggle": return { kind: "toggle", key, label: f.label, help, shuffle: true };
    case "select": return { kind: "choice", key, label: f.label, options: f.options, help, ...(f.key === "dims" ? {} : { shuffle: true as const }) };
  }
}

/** Every style's groups as sections shown while that style is picked (the board group is the shell's, bar the bleed). */
function styleSections(): SectionSpec<PaperBoxParams>[] {
  const out: SectionSpec<PaperBoxParams>[] = [];
  for (const s of listBoxStyles()) {
    for (const g of s.paramSchema) {
      const fields = g.fields.filter((f) => !SHELL_KEYS.has(f.key)).map((f) => field(s, f));
      if (!fields.length) continue;
      out.push({ id: `${s.id}-${g.id}`, title: g.id === "board" ? "Print" : g.title, open: g.id === "size", show: (p) => p.style === s.id, help: g.id === "board" ? "Bleed for printed boxes: extra print past the cut line." : `${g.title} of the ${s.name.toLowerCase()}.`, fields });
    }
  }
  return out;
}

const sections: SectionSpec<PaperBoxParams>[] = [
  {
    id: "style", title: "Box style", open: true,
    help: "The kind of box: each style folds from one sheet (or two pieces) and has its own settings below.",
    fields: [{ kind: "choice", key: "style", label: "Style", rail: true, shuffle: true, help: "The box's construction.", options: listBoxStyles().map((s) => ({ v: s.id, text: s.name, title: s.blurb })) }],
  },
  {
    id: "board", title: "Board", open: true,
    help: "The card or board you cut: its thickness sets every fold allowance.",
    fields: [{
      kind: "choice", key: "paper", label: "Board", help: "A board weight sets the thickness; pick My own to type it in the material settings.", options: PAPER_OPTIONS,
      apply: (p, v) => { const b = paperById(v); return { ...p, paper: v, ...(b ? { T: b.thickness, material: "custom" } : {}) }; },
    }],
  },
  ...styleSections(),
  {
    id: "window", title: "Window", open: false,
    help: "A window cut in the faces you choose, to show what is inside (glue clear film behind it).",
    fields: [
      { kind: "choice", key: "window.on", label: "Window on", help: "Which faces get a window; None leaves them closed.", options: [{ v: "none", text: "None" }, ...FACE_TARGETS.map((t) => ({ v: t.v, text: t.text })), { v: "all", text: "Every outside face" }] },
      { kind: "choice", key: "window.shape", label: "Shape", show: (p) => p.window.on !== "none", help: "The window's shape.", options: (Object.keys(WINDOW_SHAPES) as WindowShape[]).map((v) => ({ v, text: WINDOW_SHAPES[v] })) },
      { kind: "number", key: "window.size", label: "Size", unit: "%", min: 15, max: 95, step: 1, show: (p) => p.window.on !== "none", help: "The window's size as a share of the face." },
      { kind: "number", key: "window.corner", label: "Corner radius", unit: "mm", min: 0, max: 100, step: 0.5, show: (p) => p.window.on !== "none" && p.window.shape === "rounded", help: "Rounds the window's corners." },
    ],
  },
  {
    id: "pattern", title: "Cut-out pattern", open: false,
    help: "A decorative pattern cut through the faces you choose (or engraved or scored), face by face so it never crosses a fold, clear of the edges and any window.",
    fields: patternFields<PaperBoxParams>("pattern", FACE_TARGETS, { on: "Which faces carry the pattern." }),
  },
  {
    id: "lines", title: "Perforation", open: false,
    help: "Perforated lines (tear strips) are cut as dashes.",
    fields: [
      { kind: "number", key: "lines.perfCut", label: "Cut length", unit: "mm", min: 0.3, max: 10, step: 0.1, help: "Length of each cut dash." },
      { kind: "number", key: "lines.perfGap", label: "Gap length", unit: "mm", min: 0.3, max: 10, step: 0.1, help: "Uncut paper between dashes." },
    ],
  },
];

/** A rail card: the style's flat net, from its own defaults. */
function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "pattern.pattern") return patternArt(v);
  if (key !== "style") return [];
  try {
    const d = buildBox(v, {});
    const cs = d.parts[0].paths.filter((q) => q.type === "cut" && q.closed).map((q) => q.pts);
    return [{ d: fitArt(cs, 40).join(" "), fill: true }];
  } catch { return []; }
}

const styleName = (p: PaperBoxParams) => listBoxStyles().find((s) => s.id === p.style)?.name ?? p.style;
const dims = (p: PaperBoxParams) => { const s = p.styles[p.style] ?? {}; return `${s.L} × ${s.W} × ${s.H} mm ${s.dims === "outer" ? "outside" : "inside"}`; };

export const PAPERBOX: GeneratorDef<PaperBoxParams> = {
  id: "paperbox",
  name: "Paper Box",
  version: PAPERBOX_VERSION,
  defaults: () => mergePaperBox({}),
  merge: mergePaperBox,
  sections,
  presets: PAPERBOX_PRESETS,
  build: (p, ctx) => buildPaperBox(p, ctx),
  fonts: (p) => (p.pattern.pattern === "motif" ? motifFonts(p.pattern.motif, p.pattern.art) : []),
  check: (p, out) => ((out as PaperBoxOutput).info?.warnings ?? []).map((m, i) => ({ code: `PAPERBOX_${i}`, level: "warn" as const, message: m, fixes: [] })),
  art,
  fileName: (p) => namedFile("paperbox", p.name, p.style),
  summary: (p) => `${styleName(p)}, ${dims(p)}`,
  help: {
    intro: [
      "The Paper Box generator makes folding cartons and gift boxes from card or board: reverse and straight tuck-end cartons, mailer boxes with rolled walls and a front tuck, and two-piece boxes whose lid slides over the base.",
      "Pick a style, the board and the size. Folds sit on the board's middle, so a panel is the inside size plus one thickness and the outside of the box is the inside plus two; enter inside sizes for what goes in, or outside sizes for a space.",
      "Cut lines are on the outline layer, slits and perforations on the inner-cut layer, and creases on the score layer, so a laser scores them with low power and a Cricut or Silhouette scores them with its scoring tool.",
    ],
    tips: [
      "Score card before folding: a laser at low power, or a cutter's scoring stylus. Fold every crease back and forth once.",
      "Corrugated board folds best across its flutes; turn the sheet so the box's long folds run across them.",
      "Turn on Slit locks for tuck boxes that stay shut.",
    ],
    keywords: ["paper box", "carton", "dieline", "tuck end", "reverse tuck", "mailer", "gift box", "two-piece box", "cricut", "folding box", "packaging"],
  },
};

export { PAPERBOX_DEFAULTS };
