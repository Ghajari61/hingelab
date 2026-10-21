import { circle, rect, roundedRect, stadium } from "../geom";
import { material2Fields } from "../material2";
import { MOTIF_OPTIONS, motifArt } from "../motifs";
import { motifArtFields, motifFonts } from "../motifArt";
import { SHAPE_KINDS, SHAPE_NAMES, shapeArt, type ShapeKind } from "../shapes";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { textStyleSection } from "../textStyle";
import { fitArt, namedFile } from "../util";
import { buildTopper, type TopperOutput } from "./build";
import { checkTopper } from "./check";
import { TOPPER_DEFAULTS, mergeTopper, type TopperParams } from "./params";
import { TOPPER_PRESETS } from "./presets";
import { byId, withPattern } from "../pattern";

const r1 = (v: number) => Math.round(v * 10) / 10;
const main = (p: TopperParams) => p.kit.kind !== "cupcake";
const picks = (p: TopperParams) => p.kit.kind !== "topper";
const SHAPE_OPTIONS = SHAPE_KINDS.map((k) => ({ v: k, text: SHAPE_NAMES[k] }));

const sections: SectionSpec<TopperParams>[] = [
  {
    id: "kit", title: "Kit", open: true,
    help: "A cake topper, a set of cupcake picks, or both cut together.",
    fields: [
      {
        kind: "choice", key: "kit.kind", label: "What to make", rail: true,
        help: "One cake topper, a set of cupcake picks, or a party set with both.",
        options: [{ v: "topper", text: "Cake topper" }, { v: "cupcake", text: "Cupcake picks" }, { v: "set", text: "Party set" }],
      },
    ],
  },
  {
    id: "text", title: "Text", open: true, show: main,
    help: "The words on the topper: each line is centred; script fonts join up into one piece.",
    fields: [
      { kind: "text", key: "text.text", label: "Text", multiline: true, maxLength: 80, placeholder: "Happy Birthday", help: "The words on the topper; press Enter for a new line." },
      { kind: "font", key: "text.fontId", shuffle: true, label: "Font", sample: (p) => p.text.text || "Aa", help: "Pacifico joins its letters like handwriting." },
      { kind: "number", key: "text.size", label: "Letter height", unit: "mm", min: 8, max: 200, step: 1, help: "Cap height of the letters; the topper grows with it." },
      { kind: "number", key: "text.spacing", label: "Letter spacing", unit: "mm", min: -5, max: 10, step: 0.1, help: "Extra space between letters; a little negative spacing makes script letters overlap so they hold together." },
      { kind: "number", key: "text.lead", label: "Line spacing", unit: "", min: 0.8, max: 2, step: 0.05, help: "Distance between lines as a multiple of the letter height; lower values make lines touch and join." },
    ],
  },
  textStyleSection(main),
  {
    id: "style", title: "Style", open: true, show: main,
    help: "How the topper is cut: welded letters, a silhouette, two layers, or a shaped plate.",
    fields: [
      {
        kind: "choice", key: "style.kind", shuffle: true, label: "Style", rail: true,
        help: "Letters cuts the text itself; Outline cuts a silhouette with the text engraved; Layered glues mirror letters onto a backing; Plate engraves the text on a shape.",
        options: [{ v: "letters", text: "Letters" }, { v: "outline", text: "Outline" }, { v: "layered", text: "Layered", title: "Two materials" }, { v: "plate", text: "Plate" }],
      },
      { kind: "number", key: "style.weld", label: "Weld", unit: "mm", min: 0.2, max: 4, step: 0.1, show: (p) => p.style.kind === "letters" || p.style.kind === "layered", help: "How much the letters grow so neighbours fuse into one piece; thicker welds are stronger." },
      { kind: "number", key: "style.border", label: "Border", unit: "mm", min: 1, max: 20, step: 0.5, show: (p) => p.style.kind === "outline" || p.style.kind === "layered", help: "Width of the silhouette around the letters." },
      {
        kind: "choice", key: "style.mark", shuffle: true, label: "Text on the face", show: (p) => p.style.kind === "outline" || p.style.kind === "plate",
        help: "Engrave fills the letters, Score traces their outlines (quick on a diode laser), None leaves a plain silhouette.",
        options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }, { v: "none", text: "None" }],
      },
    ],
  },
  {
    id: "motif", title: "Motif", open: true, show: main,
    help: "A picture welded to the text: balloons, hearts, rings, a crescent, stars and more.",
    fields: [
      { kind: "choice", key: "motif.kind", shuffle: true, label: "Motif", rail: true, options: MOTIF_OPTIONS, help: "The picture added to the topper, joined to the letters: a built-in motif, your own picture or your own text." },
      ...motifArtFields<TopperParams>("motif.kind", "motif.art"),
      {
        kind: "choice", key: "motif.place", label: "Position", show: (p) => p.motif.kind !== "none",
        help: "Where the motif sits: above, below or beside the text, on both sides (mirrored), or behind it.",
        options: [{ v: "above", text: "Above" }, { v: "below", text: "Below" }, { v: "left", text: "Left" }, { v: "right", text: "Right" }, { v: "both", text: "Both sides" }, { v: "behind", text: "Behind" }],
      },
      { kind: "number", key: "motif.size", label: "Motif size", unit: "mm", min: 10, max: 250, step: 1, show: (p) => p.motif.kind !== "none", help: "The motif's larger side." },
      { kind: "number", key: "motif.gap", label: "Gap", unit: "mm", min: -30, max: 30, step: 0.5, show: (p) => p.motif.kind !== "none" && p.motif.place !== "behind", help: "Space between motif and text; negative values overlap them so they join." },
    ],
  },
  {
    id: "plate", title: "Plate", open: true, show: (p) => main(p) && p.style.kind === "plate",
    help: "The shape the text is engraved on.",
    fields: [
      { kind: "choice", key: "plate.shape", shuffle: true, label: "Plate shape", rail: true, options: SHAPE_OPTIONS, help: "The outline of the plate." },
      { kind: "toggle", key: "plate.auto", label: "Fit to the text", help: "Sizes the plate around the text and motif; turn it off to set the size yourself." },
      { kind: "number", key: "plate.pad", label: "Margin", unit: "mm", min: 2, max: 60, step: 1, show: (p) => p.plate.auto, help: "Space between the text and the plate's edge." },
      { kind: "number", key: "plate.width", label: "Plate width", unit: "mm", min: 30, max: 600, step: 1, show: (p) => !p.plate.auto, help: "Width of the plate." },
      { kind: "number", key: "plate.height", label: "Plate height", unit: "mm", min: 20, max: 600, step: 1, show: (p) => !p.plate.auto, help: "Height of the plate." },
      { kind: "number", key: "plate.corner", label: "Corner radius", unit: "mm", min: 0, max: 40, step: 0.5, help: "Rounds the plate's corners." },
      { kind: "toggle", key: "plate.frame", shuffle: true, label: "Scored frame", help: "Scores a line just inside the edge, like a frame." },
    ],
  },
  {
    id: "sticks", title: "Sticks", open: false, show: main,
    help: "The sticks that hold the topper in the cake.",
    fields: [
      { kind: "number", key: "sticks.count", label: "Sticks", unit: "", min: 0, max: 3, step: 1, int: true, help: "How many sticks; two keep a wide topper from turning." },
      { kind: "number", key: "sticks.length", label: "Length", unit: "mm", min: 20, max: 250, step: 1, show: (p) => p.sticks.count > 0, help: "Length below the lowest point of the topper; about 80 mm reaches well into a cake." },
      { kind: "number", key: "sticks.width", label: "Width", unit: "mm", min: 3, max: 20, step: 0.5, show: (p) => p.sticks.count > 0, help: "Width of each stick; 6 to 8 mm is strong in 3 mm acrylic." },
      { kind: "number", key: "sticks.tip", label: "Point", unit: "mm", min: 0, max: 40, step: 1, show: (p) => p.sticks.count > 0, help: "Length of the pointed tip; 0 gives a square end." },
      { kind: "number", key: "sticks.spread", label: "Spread", unit: "%", min: 0, max: 100, step: 1, show: (p) => p.sticks.count > 1, help: "How far apart the sticks are, as a share of the topper's width." },
    ],
  },
  {
    id: "cupcake", title: "Cupcake picks", open: true, show: picks,
    help: "Small picks for cupcakes, each with a motif, a name or both.",
    fields: [
      { kind: "number", key: "cupcake.count", label: "Picks", unit: "", min: 1, max: 60, step: 1, int: true, help: "How many picks to cut." },
      { kind: "choice", key: "cupcake.shape", shuffle: true, label: "Pick shape", rail: true, options: [{ v: "motif", text: "Motif silhouette" }, ...SHAPE_OPTIONS], help: "A disc shape, or the motif itself cut as a silhouette." },
      { kind: "number", key: "cupcake.size", label: "Pick width", unit: "mm", min: 25, max: 120, step: 1, help: "Width of each pick; 45 to 60 mm suits a cupcake." },
      { kind: "choice", key: "cupcake.motif", shuffle: true, label: "Pick motif", rail: true, options: MOTIF_OPTIONS, help: "The picture on each pick, or the silhouette's shape: a built-in motif, your own picture or your own text." },
      ...motifArtFields<TopperParams>("cupcake.motif", "cupcake.art"),
      { kind: "text", key: "cupcake.text", label: "Names", multiline: true, maxLength: 1200, placeholder: "One name per line", help: "One name or word per line; the picks cycle through the list." },
      { kind: "font", key: "cupcake.fontId", shuffle: true, label: "Name font", sample: (p) => p.cupcake.text || "Aa", help: "The typeface of the names." },
      { kind: "number", key: "cupcake.textSize", label: "Name height", unit: "mm", min: 3, max: 40, step: 0.5, help: "Cap height of the names." },
      { kind: "number", key: "cupcake.stick", label: "Stick length", unit: "mm", min: 20, max: 150, step: 1, help: "Length of each pick's stick below the shape." },
      { kind: "toggle", key: "cupcake.layered", label: "Layered", help: "Cuts the motif and name from the second material to glue on, instead of engraving them." },
    ],
  },
  {
    id: "mat", title: "Second material", open: false, show: (p) => (main(p) && p.style.kind === "layered") || (picks(p) && p.cupcake.layered),
    help: "The material of the front layer in layered designs: mirror, glitter or coloured acrylic, or wood.",
    fields: material2Fields<TopperParams>("mat"),
  },
];

/** Little "Hi" letters for the style pictures. */
const HI: Contour[] = [rect(0, 0, 6, 26), rect(14, 0, 6, 26), rect(5, 10, 10, 6), rect(25, 8, 6, 18), circle(28, 3, 3.6, 0.2)];
const mv = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as [number, number]));

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "motif.kind" || key === "cupcake.motif") return motifArt(v);
  if (key === "plate.shape") return shapeArt(v as ShapeKind);
  if (key === "cupcake.shape") return v === "motif" ? motifArt("star") : shapeArt(v as ShapeKind);
  if (key === "kit.kind") {
    const topper = [...mv(HI, 0, 0), rect(6, 25, 3, 16), rect(24, 25, 3, 16)];
    const pick = [circle(0, 0, 9, 0.2), rect(-1.5, 8, 3, 14)];
    const cs = v === "topper" ? topper : v === "cupcake" ? [...mv(pick, 8, 10), ...mv(pick, 30, 10)] : [...topper, ...mv(pick, 46, 16)];
    return [{ d: fitArt(cs, 38).join(" "), fill: true }];
  }
  if (key === "style.kind") {
    if (v === "letters") return [{ d: fitArt(HI, 34).join(" "), fill: true }];
    const sil = stadium(-4, 13, 35, 13, 38);
    if (v === "outline") { const [o, ...m] = fitArt([sil, ...HI], 38); return [{ d: o, fill: true }, ...m.map((d) => ({ d }))]; }
    if (v === "layered") { const [o, ...m] = fitArt([sil, ...HI], 38); return [{ d: o, fill: true }, { d: m.join(" "), fill: true }]; }
    const [o, ...m] = fitArt([roundedRect(-10, -8, 51, 42, 6), ...HI], 38);
    return [{ d: o, fill: true }, ...m.map((d) => ({ d }))];
  }
  return [];
}

function scaleTopper(p: TopperParams, s: number): TopperParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    text: { ...p.text, size: k(p.text.size) },
    textForm: { ...p.textForm, circle: k(p.textForm.circle) },
    motif: { ...p.motif, size: k(p.motif.size), gap: k(p.motif.gap) },
    plate: { ...p.plate, width: k(p.plate.width), height: k(p.plate.height), pad: k(p.plate.pad) },
    sticks: { ...p.sticks, length: k(p.sticks.length) },
    cupcake: { ...p.cupcake, size: k(p.cupcake.size), textSize: k(p.cupcake.textSize), stick: k(p.cupcake.stick) },
  };
}

const KIT_NAMES = { topper: "Cake topper", cupcake: "Cupcake picks", set: "Party set" } as const;
const STYLE_NAMES = { letters: "letters", outline: "outline", layered: "layered", plate: "plate" } as const;

const TOPPER_BASE: GeneratorDef<TopperParams> = {
  id: "topper",
  name: "Cake Topper",
  version: 1,
  defaults: () => mergeTopper({}),
  merge: mergeTopper,
  sections,
  presets: TOPPER_PRESETS,
  build: buildTopper,
  check: (p, out) => checkTopper(p, out as TopperOutput),
  pro: (p) => (p.kit.kind === "set" ? "Party sets (a topper and picks together) need Pro." : p.style.kind === "plate" ? "Plate toppers need Pro." : null),
  fonts: (p) => [...(p.kit.kind !== "cupcake" && p.text.text.trim() ? [p.text.fontId] : []), ...(p.kit.kind !== "topper" && p.cupcake.text.trim() ? [p.cupcake.fontId] : []),
    ...(p.kit.kind !== "cupcake" ? motifFonts(p.motif.kind, p.motif.art) : []), ...(p.kit.kind !== "topper" ? motifFonts(p.cupcake.motif, p.cupcake.art) : [])],
  scale: scaleTopper,
  art,
  batch: (p) => (p.kit.kind === "cupcake" ? null : "text.text"),
  fileName: (p) => namedFile("topper", p.name, p.kit.kind),
  summary: (p) => {
    const first = p.text.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" ");
    const what = p.kit.kind === "cupcake" ? `${p.cupcake.count} picks` : `“${first || "motif"}”, ${STYLE_NAMES[p.style.kind]}`;
    return `${KIT_NAMES[p.kit.kind]} · ${what}${p.kit.kind === "set" ? ` + ${p.cupcake.count} picks` : ""}`;
  },
  help: {
    intro: [
      "The Cake Topper generator turns a few words into a topper ready to cut: script letters welded into one piece, a silhouette with the text engraved, mirror letters layered on a backing, or text engraved on a shaped plate. Add a motif (balloons, rings, a crescent, stars and many more) and sticks with pointed tips.",
      "Cupcake picks come in sets: a disc, star, heart or any other shape, or the motif itself as a silhouette, each with an engraved or layered motif and a name from your list.",
      "Every topper is welded into a single piece, so nothing falls out of the sheet: touching letters are fused, and anything left apart is joined with a short bridge.",
    ],
    tips: [
      "Mirror acrylic scratches easily: leave its film on while cutting and peel it after.",
      "Your picture makes a custom motif or pick silhouette from a logo or drawing; bold shapes with few thin lines cut cleanest.",
      "Thin script letters are fragile: raise the weld to 1 to 1.5 mm, or switch to the Outline style.",
      "Cut sticks along the length of the sheet's grain when using wood, so they do not snap.",
      "Wash acrylic toppers before they touch food, or wrap the sticks in food-safe film.",
    ],
    keywords: ["cake topper", "cupcake topper", "birthday", "wedding", "Mr & Mrs", "Eid", "acrylic", "mirror", "party"],
  },
};

export { TOPPER_DEFAULTS };

/** The generator with the cut-out pattern (lib/generators/pattern.ts). */
export const TOPPER: GeneratorDef<TopperParams> = withPattern(TOPPER_BASE, [
  { v: "topper", text: "Back layer", match: byId("topper") },
], { help: "A decorative pattern cut through the topper's back layer round its words (or engraved or scored); the letters and sticks stay solid." });
