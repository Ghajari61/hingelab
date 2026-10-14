import { circle, rect, roundedRect } from "../geom";
import { material2Fields } from "../material2";
import { MOTIF_OPTIONS, motifArt } from "../motifs";
import { SHAPE_KINDS, SHAPE_NAMES, shapeArt, type ShapeKind } from "../shapes";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { textStyleSection } from "../textStyle";
import { fitArt, namedFile } from "../util";
import { buildSign, type SignOutput } from "./build";
import { checkSign } from "./check";
import { SIGN_DEFAULTS, mergeSign, type SignParams } from "./params";
import { SIGN_PRESETS } from "./presets";

const r1 = (v: number) => Math.round(v * 10) / 10;
const boarded = (p: SignParams) => p.style.kind !== "word" && p.style.kind !== "neon";
const twoMaterials = (p: SignParams) => p.style.kind === "layered" || p.style.kind === "inlay" || (boarded(p) && p.border.kind === "raised");

const sections: SectionSpec<SignParams>[] = [
  {
    id: "style", title: "Build", open: true,
    help: "How the sign is made: engraved on one sheet, letters layered on a board, the word cut out on its own, or letters inlaid in a second material.",
    fields: [
      {
        kind: "choice", key: "style.kind", label: "Build", rail: true,
        help: "Engraved marks one board; Layered glues letters from the second material onto it; Word cuts the letters as one piece; Inlay cuts the letters out and fills them with the second material; Neon look engraves glowing outlines on an acrylic piece cut around the letters; Stencil cuts the letters through, with bridges that hold their middles, for painting.",
        options: [{ v: "engraved", text: "Engraved" }, { v: "layered", text: "Layered", title: "Two materials" }, { v: "word", text: "Cut-out word" }, { v: "inlay", text: "Inlay", title: "Two materials" }, { v: "neon", text: "Neon look", title: "Glowing outlines on acrylic" }, { v: "stencil", text: "Stencil", title: "Letters cut through, with bridges" }],
      },
      {
        kind: "choice", key: "style.mark", label: "Mark", show: (p) => p.style.kind === "engraved",
        help: "Engrave fills the letters; Score traces their outlines, which is quick on a diode laser.",
        options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }],
      },
      { kind: "toggle", key: "style.mirror", label: "Mirror for back engraving", show: (p) => p.style.kind === "engraved" || p.style.kind === "neon", help: "Mirrors the marks so clear acrylic can be engraved from the back and read from the front." },
      { kind: "toggle", key: "style.join", label: "One piece", show: (p) => p.style.kind === "layered", help: "Bridges the letters into one piece that is easy to line up; turn it off to cut every letter on its own." },
      { kind: "number", key: "style.weld", label: "Weld", unit: "mm", min: 0.2, max: 4, step: 0.1, show: (p) => p.style.kind === "word" || p.style.kind === "layered", help: "How much the letters grow so neighbours fuse into one piece." },
      { kind: "number", key: "style.border", label: "Backer margin", unit: "mm", min: 2, max: 40, step: 0.5, show: (p) => p.style.kind === "neon", help: "How far the acrylic reaches past the letters; it is cut as one solid piece around them." },
    ],
  },
  {
    id: "board", title: "Board", open: true, show: boarded,
    help: "The board's outline and size.",
    fields: [
      { kind: "choice", key: "board.shape", label: "Shape", rail: true, options: SHAPE_KINDS.map((k) => ({ v: k, text: SHAPE_NAMES[k] })), help: "The outline of the board." },
      { kind: "toggle", key: "board.auto", label: "Fit to the text", help: "Sizes the board around the text and motif; turn it off to set the size yourself." },
      { kind: "number", key: "board.pad", label: "Margin", unit: "mm", min: 4, max: 120, step: 1, show: (p) => p.board.auto, help: "Space between the text and the board's edge." },
      { kind: "number", key: "board.width", label: "Width", unit: "mm", min: 40, max: 1200, step: 5, show: (p) => !p.board.auto, help: "Width of the board." },
      { kind: "number", key: "board.height", label: "Height", unit: "mm", min: 30, max: 800, step: 5, show: (p) => !p.board.auto, help: "Height of the board." },
      { kind: "number", key: "board.corner", label: "Corner radius", unit: "mm", min: 0, max: 80, step: 1, help: "Rounds the board's corners." },
    ],
  },
  {
    id: "text", title: "Text", open: true,
    help: "The words on the sign.",
    fields: [
      { kind: "text", key: "text.text", label: "Text", multiline: true, maxLength: 160, placeholder: "e.g. Welcome", help: "The words on the sign; press Enter for a new line." },
      { kind: "font", key: "text.fontId", label: "Font", sample: (p) => p.text.text || "Aa", help: "The typeface." },
      { kind: "number", key: "text.size", label: "Letter height", unit: "mm", min: 5, max: 300, step: 1, help: "Cap height of the letters." },
      { kind: "number", key: "text.spacing", label: "Letter spacing", unit: "mm", min: -5, max: 20, step: 0.1, help: "Extra space between letters; negative values join script letters." },
      { kind: "number", key: "text.lead", label: "Line spacing", unit: "", min: 0.8, max: 3, step: 0.05, help: "Distance between lines, as a multiple of the letter height." },
      { kind: "choice", key: "text.align", label: "Align", options: [{ v: "left", text: "Left" }, { v: "center", text: "Centre" }, { v: "right", text: "Right" }], help: "How lines of different lengths line up." },
      { kind: "number", key: "text.offset", label: "Move up or down", unit: "%", min: -40, max: 40, step: 1, show: boarded, help: "Shifts the text and motif from the middle of the board; negative moves them up." },
    ],
  },
  textStyleSection(),
  {
    id: "motif", title: "Motif", open: true,
    help: "A picture with the text: flowers, hearts, a crescent, a laurel and more.",
    fields: [
      { kind: "choice", key: "motif.kind", label: "Motif", rail: true, options: MOTIF_OPTIONS, help: "The picture on the sign." },
      {
        kind: "choice", key: "motif.side", label: "Position", show: (p) => p.motif.kind !== "none",
        help: "Where the motif sits: above, below or beside the text, on both sides (mirrored), or large behind it.",
        options: [{ v: "above", text: "Above" }, { v: "below", text: "Below" }, { v: "left", text: "Left" }, { v: "right", text: "Right" }, { v: "both", text: "Both sides" }, { v: "behind", text: "Behind" }],
      },
      { kind: "number", key: "motif.size", label: "Motif size", unit: "mm", min: 8, max: 600, step: 1, show: (p) => p.motif.kind !== "none", help: "The motif's larger side." },
      { kind: "number", key: "motif.gap", label: "Gap", unit: "mm", min: -30, max: 60, step: 0.5, show: (p) => p.motif.kind !== "none" && p.motif.side !== "behind", help: "Space between the motif and the text." },
    ],
  },
  {
    id: "border", title: "Border", open: false, show: boarded,
    help: "A frame just inside the board's edge.",
    fields: [
      {
        kind: "choice", key: "border.kind", label: "Border",
        help: "Score draws a line, Engrave fills a band, Raised cuts a frame from the second material to glue on.",
        options: [{ v: "none", text: "None" }, { v: "score", text: "Score" }, { v: "engrave", text: "Engrave" }, { v: "raised", text: "Raised", title: "Two materials" }],
      },
      { kind: "number", key: "border.inset", label: "Inset", unit: "mm", min: 1, max: 60, step: 0.5, show: (p) => p.border.kind !== "none", help: "Distance from the board's edge to the border." },
      { kind: "number", key: "border.width", label: "Band width", unit: "mm", min: 1, max: 40, step: 0.5, show: (p) => p.border.kind === "engrave" || p.border.kind === "raised", help: "Width of the engraved band or raised frame." },
    ],
  },
  {
    id: "mount", title: "Mounting", open: false,
    help: "How the sign hangs or stands.",
    fields: [
      {
        kind: "choice", key: "mount.kind", label: "Mounting",
        help: "Keyhole slots hide two screws; screw holes go straight through; hanging holes take a cord or chain; standoff holes suit acrylic office signs; a stand makes a desk or shelf sign.",
        options: [{ v: "none", text: "None" }, { v: "keyhole", text: "Keyhole slots" }, { v: "holes", text: "Screw holes" }, { v: "hanging", text: "Hanging cord" }, { v: "standoff", text: "Standoffs" }, { v: "stand", text: "Desk stand" }],
      },
      { kind: "number", key: "mount.hole", label: "Hole diameter", unit: "mm", min: 2, max: 20, step: 0.5, show: (p) => ["holes", "hanging", "standoff"].includes(p.mount.kind), help: "Diameter of the screw, cord or standoff holes." },
      { kind: "number", key: "mount.depth", label: "Base depth", unit: "mm", min: 30, max: 200, step: 1, show: (p) => p.mount.kind === "stand", help: "Front-to-back depth of the stand's base." },
    ],
  },
  {
    id: "mat", title: "Second material", open: false, show: twoMaterials,
    help: "The material of layered letters, inlays or a raised frame: mirror or coloured acrylic, or a contrasting wood.",
    fields: material2Fields<SignParams>("mat"),
  },
];

const HI: Contour[] = [rect(0, 0, 6, 26), rect(14, 0, 6, 26), rect(5, 10, 10, 6), rect(25, 8, 6, 18), circle(28, 3, 3.6, 0.2)];

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "board.shape") return shapeArt(v as ShapeKind);
  if (key === "motif.kind") return motifArt(v);
  if (key === "style.kind") {
    if (v === "word") return [{ d: fitArt(HI, 34).join(" "), fill: true }];
    if (v === "stencil") {
      const [o, ...m] = fitArt([roundedRect(-10, -8, 51, 42, 6), ...HI], 38);
      return [{ d: [o, ...m].join(" "), fill: true }];
    }
    if (v === "neon") {
      const [o, ...m] = fitArt([roundedRect(-6, -6, 43, 38, 12), ...HI], 38);
      return [{ d: o, fill: true }, ...m.map((d) => ({ d }))];
    }
    const [o, ...m] = fitArt([roundedRect(-10, -8, 51, 42, 6), ...HI], 38);
    if (v === "engraved") return [{ d: o, fill: true }, ...m.map((d) => ({ d }))];
    if (v === "layered") return [{ d: o }, { d: m.join(" "), fill: true }];
    return [{ d: [o, ...m].join(" "), fill: true }, { d: m.join(" ") }];
  }
  return [];
}

function scaleSign(p: SignParams, s: number): SignParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    board: { ...p.board, width: k(p.board.width), height: k(p.board.height), pad: k(p.board.pad), corner: k(p.board.corner) },
    text: { ...p.text, size: k(p.text.size) },
    textForm: { ...p.textForm, circle: k(p.textForm.circle) },
    motif: { ...p.motif, size: k(p.motif.size), gap: k(p.motif.gap) },
    border: { ...p.border, width: k(p.border.width), inset: k(p.border.inset) },
  };
}

const BUILD_NAMES = { engraved: "Engraved", layered: "Layered", word: "Cut-out word", inlay: "Inlay", neon: "Neon-look", stencil: "Stencil" } as const;

export const SIGN: GeneratorDef<SignParams> = {
  id: "sign",
  name: "Sign",
  version: 1,
  defaults: () => mergeSign({}),
  merge: mergeSign,
  sections,
  presets: SIGN_PRESETS,
  build: buildSign,
  check: (p, out) => checkSign(p, out as SignOutput),
  pro: (p) => (p.style.kind === "inlay" ? "Inlay signs need Pro." : boarded(p) && p.border.kind === "raised" ? "Raised two-material frames need Pro." : null),
  fonts: (p) => (p.text.text.trim() ? [p.text.fontId] : []),
  scale: scaleSign,
  art,
  batch: () => "text.text",
  fileName: (p) => namedFile("sign", p.name, p.style.kind),
  summary: (p) => {
    const first = p.text.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" ");
    return `${BUILD_NAMES[p.style.kind]} sign · “${first || "motif"}”${boarded(p) ? ` · ${SHAPE_NAMES[p.board.shape].toLowerCase()}` : ""}`;
  },
  help: {
    intro: [
      "The Sign generator makes wall, door, shop and desk signs in wood, acrylic or both: text and a motif engraved or scored on a shaped board, letters from a second material layered on top, the word cut out on its own, letters inlaid flush in a contrasting material, a neon-look acrylic piece with glowing engraved outlines, or a paint stencil whose bridges hold the middles of the letters.",
      "Pick any of 18 board shapes or let the board size itself around the text; add a scored, engraved or raised frame; and hang it on keyhole slots, screws, a cord or standoffs, or stand it on a slotted base.",
      "Clear acrylic can be engraved from the back: mirror the engraving and the sign reads correctly from the front with a smooth, glossy face.",
    ],
    tips: [
      "For inlays, use the same thickness for both materials and a bold font; the kerf makes the letters press in snugly.",
      "Mirror acrylic and coloured acrylic make striking layered letters on walnut or birch boards.",
      "Engrave with masking tape on the wood to stop smoke stains, then peel it after.",
      "Outdoor signs need exterior plywood or acrylic and a coat of clear varnish.",
      "Neon-look signs glow best in 5 mm cast acrylic on an LED base; engrave from the back with Mirror on.",
      "For a stencil, card or thin acrylic works; a bold font keeps the bridges short.",
    ],
    keywords: ["sign", "wall sign", "door sign", "name sign", "shop sign", "welcome", "acrylic", "wood", "layered", "inlay", "desk sign", "neon", "stencil"],
  },
};

export { SIGN_DEFAULTS };
