import { rect, roundedRect } from "../geom";
import { material2Fields } from "../material2";
import { MOTIF_OPTIONS, motifArt } from "../motifs";
import { motifArtFields, motifFonts } from "../motifArt";
import { SHAPE_KINDS, SHAPE_NAMES, shapeArt, type ShapeKind } from "../shapes";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { textStyleSection } from "../textStyle";
import { fitArt, namedFile, slug } from "../util";
import { buildTablenum, type TablenumOutput } from "./build";
import { checkTablenum } from "./check";
import { MAX_TABLES, TABLENUM_DEFAULTS, mergeTablenum, tableList, type TablenumParams } from "./params";
import { TABLENUM_PRESETS } from "./presets";

const r1 = (v: number) => Math.round(v * 10) / 10;
const stand = (p: TablenumParams) => p.build.kind === "stand";
const tent = (p: TablenumParams) => p.build.kind === "tent";

const sections: SectionSpec<TablenumParams>[] = [
  {
    id: "batch", title: "Tables", open: true,
    help: "Every table in one file: a range of numbers, or a list of table names.",
    fields: [
      { kind: "choice", key: "batch.mode", label: "Numbering", options: [{ v: "range", text: "Numbers" }, { v: "list", text: "Names" }], help: "Numbers counts from one table to another; Names makes one table per line of a list." },
      { kind: "number", key: "batch.from", label: "From", unit: "", min: 0, max: 999, step: 1, int: true, show: (p) => p.batch.mode === "range", help: "The first table number." },
      { kind: "number", key: "batch.to", label: "To", unit: "", min: 0, max: 999, step: 1, int: true, show: (p) => p.batch.mode === "range", help: `The last table number; up to ${MAX_TABLES} tables per file.` },
      { kind: "number", key: "batch.pad", label: "Digits", unit: "", min: 0, max: 3, step: 1, int: true, show: (p) => p.batch.mode === "range", help: "Pads numbers with leading zeros to this many digits (2 gives 01, 02 and so on); 0 leaves them as they are." },
      { kind: "text", key: "batch.names", label: "Second line", multiline: true, maxLength: 2000, placeholder: "One per table, in order", show: (p) => p.batch.mode === "range", help: "An optional line under each number, such as a family's name or a course, one per table in order." },
      { kind: "text", key: "batch.list", label: "Table names", multiline: true, maxLength: 2000, placeholder: "Rose\nLily\nTulip", show: (p) => p.batch.mode === "list", help: "One table per line; each name takes the place of the number." },
    ],
  },
  {
    id: "build", title: "Build", open: true,
    help: "How each table number stands.",
    fields: [
      {
        kind: "choice", key: "build.kind", label: "Build", rail: true,
        help: "Stand pushes the plate into a slotted base; Tent card folds on a living hinge and reads from both sides; Plaque is the plate alone, for a holder or a ribbon.",
        options: [{ v: "stand", text: "Stand" }, { v: "tent", text: "Tent card" }, { v: "plaque", text: "Plaque" }],
      },
      { kind: "toggle", key: "build.double", label: "Double-sided", show: stand, help: "Two plates glued back to back in one slot, so the number reads from both sides." },
    ],
  },
  {
    id: "plate", title: "Plate", open: true,
    help: "The plate's shape and size; every table gets the same size.",
    fields: [
      { kind: "choice", key: "plate.shape", label: "Shape", rail: true, options: SHAPE_KINDS.map((k) => ({ v: k, text: SHAPE_NAMES[k] })), help: "The outline of each plate; tent cards use a rounded rectangle." },
      { kind: "toggle", key: "plate.auto", label: "Fit to the text", help: "Sizes the plate around the widest table; turn it off to set the size yourself." },
      { kind: "number", key: "plate.pad", label: "Margin", unit: "mm", min: 3, max: 60, step: 1, show: (p) => p.plate.auto, help: "Space between the text and the plate's edge." },
      { kind: "number", key: "plate.width", label: "Width", unit: "mm", min: 30, max: 400, step: 1, show: (p) => !p.plate.auto, help: "Width of each plate." },
      { kind: "number", key: "plate.height", label: "Height", unit: "mm", min: 30, max: 400, step: 1, show: (p) => !p.plate.auto, help: "Height of each plate (each half of a tent card)." },
      { kind: "number", key: "plate.corner", label: "Corner radius", unit: "mm", min: 0, max: 40, step: 0.5, help: "Rounds the plate's corners." },
      { kind: "choice", key: "border.kind", label: "Border", options: [{ v: "none", text: "None" }, { v: "score", text: "Score" }, { v: "engrave", text: "Engrave" }], help: "A line or engraved band just inside the edge." },
      { kind: "number", key: "border.inset", label: "Border inset", unit: "mm", min: 1, max: 30, step: 0.5, show: (p) => p.border.kind !== "none", help: "Distance from the edge to the border." },
    ],
  },
  {
    id: "text", title: "Text", open: true,
    help: "The number, the label above it and the second line.",
    fields: [
      { kind: "font", key: "text.fontId", label: "Number font", sample: () => "12", help: "The typeface of the numbers or table names." },
      { kind: "number", key: "text.size", label: "Number height", unit: "mm", min: 8, max: 200, step: 1, help: "Height of the numbers." },
      { kind: "number", key: "text.spacing", label: "Digit spacing", unit: "mm", min: -5, max: 10, step: 0.1, help: "Extra space between digits." },
      { kind: "text", key: "text.label", label: "Label", maxLength: 40, placeholder: "e.g. Table", help: "A word above the number, such as Table; leave it empty for the number alone." },
      { kind: "font", key: "text.labelFont", label: "Label font", sample: (p) => p.text.label || "Table", help: "The typeface of the label and second line." },
      { kind: "number", key: "text.labelSize", label: "Label height", unit: "mm", min: 4, max: 80, step: 0.5, help: "Height of the label." },
      { kind: "toggle", key: "text.labelBelow", label: "Label below", help: "Puts the label under the number instead of above it." },
      { kind: "number", key: "text.nameSize", label: "Second line height", unit: "mm", min: 3, max: 40, step: 0.5, help: "Height of the second line." },
      {
        kind: "choice", key: "text.mark", label: "Text style",
        help: "Engrave fills the letters, Score traces them, Raised cuts them from the second material to glue on.",
        options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }, { v: "raised", text: "Raised", title: "Two materials" }],
      },
    ],
  },
  textStyleSection(),
  {
    id: "motif", title: "Motif", open: false,
    help: "A small picture with the number.",
    fields: [
      { kind: "choice", key: "motif.kind", label: "Motif", rail: true, options: MOTIF_OPTIONS, help: "The picture on each plate: a built-in motif, your own picture or your own text." },
      ...motifArtFields<TablenumParams>("motif.kind", "motif.art"),
      { kind: "choice", key: "motif.place", label: "Position", show: (p) => p.motif.kind !== "none", options: [{ v: "above", text: "Above" }, { v: "below", text: "Below" }, { v: "both", text: "Both sides" }], help: "Above or below the text, or on both sides of the number." },
      { kind: "number", key: "motif.size", label: "Motif size", unit: "mm", min: 6, max: 150, step: 1, show: (p) => p.motif.kind !== "none", help: "The motif's larger side." },
      { kind: "number", key: "motif.gap", label: "Gap", unit: "mm", min: -20, max: 30, step: 0.5, show: (p) => p.motif.kind !== "none", help: "Space between the motif and the text." },
    ],
  },
  {
    id: "base", title: "Base", open: false, show: stand,
    help: "The block each plate stands in.",
    fields: [
      { kind: "number", key: "base.layers", label: "Layers", unit: "", min: 1, max: 3, step: 1, int: true, help: "Sheets glued into the base; with two or three, the bottom layer closes the slot." },
      { kind: "number", key: "base.width", label: "Base width", unit: "mm", min: 40, max: 400, step: 1, help: "Length of the base along the plate." },
      { kind: "number", key: "base.depth", label: "Base depth", unit: "mm", min: 25, max: 200, step: 1, help: "Front-to-back depth of the base; deeper bases stop tall plates tipping." },
      { kind: "number", key: "base.step", label: "Step", unit: "mm", min: 0, max: 15, step: 0.5, show: (p) => p.base.layers > 1, help: "How much each layer above is smaller, for a stepped base; 0 makes a straight block." },
      { kind: "number", key: "base.corner", label: "Base corners", unit: "mm", min: 0, max: 30, step: 0.5, help: "Rounds the base's corners." },
    ],
  },
  {
    id: "hinge", title: "Hinge", open: false, show: tent,
    help: "The living hinge that lets a tent card fold.",
    fields: [
      { kind: "number", key: "hinge.band", label: "Band length", unit: "mm", min: 6, max: 60, step: 1, help: "Length of the slit band at the fold; longer bands bend more gently." },
      { kind: "number", key: "hinge.slit", label: "Slit length", unit: "mm", min: 5, max: 80, step: 1, help: "Length of each slit." },
      { kind: "number", key: "hinge.bridge", label: "Bridge", unit: "mm", min: 1, max: 10, step: 0.5, help: "Uncut material between slits; smaller bridges bend more easily but are weaker." },
      { kind: "number", key: "hinge.pitch", label: "Row spacing", unit: "mm", min: 0.8, max: 6, step: 0.1, help: "Distance between rows of slits." },
    ],
  },
  {
    id: "plaque", title: "Plaque", open: false, show: (p) => p.build.kind === "plaque",
    help: "Holes for hanging the plaques.",
    fields: [
      { kind: "choice", key: "plaque.holes", label: "Holes", options: [{ v: "none", text: "None" }, { v: "top", text: "One at the top" }, { v: "two", text: "Two at the top" }], help: "Holes for a ribbon, a ring or a table stand's clip." },
    ],
  },
  {
    id: "mat", title: "Second material", open: false, show: (p) => p.text.mark === "raised",
    help: "The material of raised numbers: mirror or coloured acrylic, or a contrasting wood.",
    fields: material2Fields<TablenumParams>("mat"),
  },
];

/** A little "12" for the build pictures. */
const N12: Contour[] = [rect(0, 0, 4, 18), rect(8, 0, 10, 4), rect(14, 0, 4, 10), rect(8, 7, 10, 4), rect(8, 7, 4, 11), rect(8, 14, 10, 4)];
const mv = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as [number, number]));

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "plate.shape") return shapeArt(v as ShapeKind);
  if (key === "motif.kind") return motifArt(v);
  if (key === "build.kind") {
    if (v === "stand") {
      const [o, b, ...n] = fitArt([roundedRect(0, 0, 30, 34, 3), rect(-6, 34, 42, 5), ...mv(N12, 6, 8)], 38);
      return [{ d: o }, { d: b, fill: true }, { d: n.join(" "), fill: true }];
    }
    if (v === "tent") {
      const [a, b, ...n] = fitArt([[[0, 40], [16, 0], [20, 0], [36, 40]], [[16, 0], [20, 0], [20, 3], [16, 3]], ...mv(N12, 9, 16)], 38);
      return [{ d: a }, { d: b, fill: true }, { d: n.join(" ") }];
    }
    const [o, h, ...n] = fitArt([roundedRect(0, 0, 32, 32, 4), rect(15, 3, 2, 2), ...mv(N12, 7, 9)], 38);
    return [{ d: o }, { d: h, fill: true }, { d: n.join(" "), fill: true }];
  }
  return [];
}

function scaleTablenum(p: TablenumParams, s: number): TablenumParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    plate: { ...p.plate, width: k(p.plate.width), height: k(p.plate.height), pad: k(p.plate.pad) },
    text: { ...p.text, size: k(p.text.size), labelSize: k(p.text.labelSize), nameSize: Math.max(3, k(p.text.nameSize)) },
    textForm: { ...p.textForm, circle: k(p.textForm.circle) },
    motif: { ...p.motif, size: k(p.motif.size), gap: k(p.motif.gap) },
    base: { ...p.base, width: k(p.base.width), depth: k(p.base.depth) },
  };
}

const BUILD_NAMES = { stand: "stands", tent: "tent cards", plaque: "plaques" } as const;

export const TABLENUM: GeneratorDef<TablenumParams> = {
  id: "tablenum",
  name: "Table Numbers",
  version: 1,
  defaults: () => mergeTablenum({}),
  merge: mergeTablenum,
  sections,
  presets: TABLENUM_PRESETS,
  build: buildTablenum,
  check: (p, out) => checkTablenum(p, out as TablenumOutput),
  pro: (p) => (p.text.mark === "raised" ? "Raised two-material numbers need Pro." : p.build.double ? "Double-sided stands need Pro." : null),
  fonts: (p) => [p.text.fontId, ...(p.text.label.trim() || p.batch.names.trim() ? [p.text.labelFont] : []), ...motifFonts(p.motif.kind, p.motif.art)],
  scale: scaleTablenum,
  art,
  fileName: (p) => {
    const t = tableList(p);
    return namedFile("table-numbers", p.name, t.length > 1 ? slug(`${t[0].main}-${t.at(-1)!.main}`, `${t.length}-tables`) : "single");
  },
  summary: (p) => {
    const t = tableList(p);
    return `${t.length} ${SHAPE_NAMES[p.build.kind === "tent" ? "rounded" : p.plate.shape].toLowerCase()} ${BUILD_NAMES[p.build.kind]}${t.length ? ` · ${t[0].main}${t.length > 1 ? ` to ${t.at(-1)!.main}` : ""}` : ""}`;
  },
  help: {
    intro: [
      "The Table Numbers generator makes a whole set at once: number the tables from one value to another, or type a list of table names, and every plate comes out the same size in one file.",
      "Each plate can stand in a slotted base of one to three layers (stepped or straight), fold into a tent card on a living hinge so it reads from both sides, or be a plaque for a holder or a ribbon. Add a label such as Table, a second line per table, a motif and a border; engrave, score or raise the numbers in mirror acrylic.",
    ],
    tips: [
      "Make one spare of the most-used numbers in case one gets knocked over.",
      "For tent cards, use 3 mm plywood or MDF and bend slowly; acrylic will snap.",
      "A two-layer base hides the tab ends and lets the plates lift out for storage.",
    ],
    keywords: ["table numbers", "wedding", "restaurant", "event", "tent card", "place card", "batch", "stand"],
  },
};

export { TABLENUM_DEFAULTS };
