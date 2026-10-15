import { rect } from "../geom";
import { material2Fields } from "../material2";
import { MOTIF_OPTIONS, motifArt } from "../motifs";
import { motifArtFields, motifFonts } from "../motifArt";
import { SHAPE_KINDS, SHAPE_NAMES, shapeArt, type ShapeKind } from "../shapes";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { textStyleSection } from "../textStyle";
import { fitArt, namedFile } from "../util";
import { buildKeyrack, hookProfile, type KeyrackOutput } from "./build";
import { checkKeyrack } from "./check";
import { KEYRACK_DEFAULTS, mergeKeyrack, type HookProfile, type KeyrackParams } from "./params";
import { KEYRACK_PRESETS } from "./presets";

const r1 = (v: number) => Math.round(v * 10) / 10;
const hooked = (p: KeyrackParams) => p.hooks.style === "hook";

const sections: SectionSpec<KeyrackParams>[] = [
  {
    id: "board", title: "Board", open: true,
    help: "The board that hangs on the wall: its shape and size.",
    fields: [
      { kind: "choice", key: "board.shape", label: "Board shape", rail: true, options: SHAPE_KINDS.map((k) => ({ v: k, text: SHAPE_NAMES[k] })), help: "The outline of the board." },
      { kind: "number", key: "board.width", label: "Width", unit: "mm", min: 60, max: 1200, step: 5, help: "Width of the board." },
      { kind: "number", key: "board.height", label: "Height", unit: "mm", min: 40, max: 600, step: 5, help: "Height of the board." },
      { kind: "number", key: "board.corner", label: "Corner radius", unit: "mm", min: 0, max: 60, step: 1, help: "Rounds the board's corners." },
      { kind: "toggle", key: "board.frame", label: "Scored border", help: "Scores a line just inside the edge, like a frame." },
    ],
  },
  {
    id: "text", title: "Text", open: true,
    help: "Words on the board, with an optional motif beside them.",
    fields: [
      { kind: "text", key: "text.text", label: "Text", multiline: true, maxLength: 80, placeholder: "e.g. Home Sweet Home", help: "The words on the board; press Enter for a new line." },
      { kind: "font", key: "text.fontId", label: "Font", sample: (p) => p.text.text || "Aa", help: "The typeface." },
      { kind: "number", key: "text.size", label: "Letter height", unit: "mm", min: 5, max: 150, step: 1, help: "Cap height of the letters." },
      { kind: "number", key: "text.spacing", label: "Letter spacing", unit: "mm", min: -5, max: 10, step: 0.1, help: "Extra space between letters." },
      {
        kind: "choice", key: "text.mark", label: "Text style",
        help: "Engrave fills the letters, Score traces them, Raised cuts them from the second material to glue on, None leaves the board plain.",
        options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }, { v: "raised", text: "Raised", title: "Two materials" }, { v: "none", text: "None" }],
      },
      { kind: "number", key: "text.y", label: "Height on board", unit: "%", min: 5, max: 95, step: 1, help: "Where the text sits, from the top of the board." },
      { kind: "choice", key: "motif.kind", label: "Motif", rail: true, options: MOTIF_OPTIONS, help: "A picture beside or above the text: a built-in motif, your own picture or your own text." },
      ...motifArtFields<KeyrackParams>("motif.kind", "motif.art"),
      { kind: "choice", key: "motif.side", label: "Motif position", show: (p) => p.motif.kind !== "none", options: [{ v: "left", text: "Left" }, { v: "right", text: "Right" }, { v: "both", text: "Both sides" }, { v: "above", text: "Above" }], help: "Where the motif sits next to the text." },
      { kind: "number", key: "motif.size", label: "Motif size", unit: "mm", min: 8, max: 200, step: 1, show: (p) => p.motif.kind !== "none", help: "The motif's larger side." },
      { kind: "number", key: "motif.gap", label: "Motif gap", unit: "mm", min: -20, max: 40, step: 0.5, show: (p) => p.motif.kind !== "none", help: "Space between the motif and the text." },
    ],
  },
  textStyleSection(),
  {
    id: "hooks", title: "Hooks", open: true,
    help: "Laser-cut hooks that slot through the board, or holes for wooden pegs or screw-in hooks.",
    fields: [
      {
        kind: "choice", key: "hooks.style", label: "Hook type",
        help: "Slot-in hooks cut from the same sheet, holes for wooden dowel pegs, or pilot holes for brass cup hooks.",
        options: [{ v: "hook", text: "Slot-in hooks" }, { v: "peg", text: "Dowel pegs" }, { v: "screw", text: "Screw-in hooks" }],
        apply: (p, v) => ({ ...p, hooks: { ...p.hooks, style: v as KeyrackParams["hooks"]["style"], hole: v === "screw" ? 3 : v === "peg" ? 8 : p.hooks.hole } }),
      },
      { kind: "choice", key: "hooks.profile", label: "Hook shape", rail: true, show: hooked, options: [{ v: "round", text: "Rounded J" }, { v: "square", text: "Square" }, { v: "ball", text: "Ball end" }], help: "The side profile of each hook." },
      { kind: "number", key: "hooks.count", label: "Hooks", unit: "", min: 0, max: 16, step: 1, int: true, help: "How many hooks or holes, spread evenly along the row." },
      { kind: "number", key: "hooks.reach", label: "Reach", unit: "mm", min: 10, max: 120, step: 1, show: hooked, help: "How far each hook sticks out from the board." },
      { kind: "number", key: "hooks.size", label: "Hook height", unit: "mm", min: 6, max: 40, step: 1, show: hooked, help: "Height of each hook's arm; larger hooks are stronger." },
      { kind: "number", key: "hooks.hole", label: "Hole diameter", unit: "mm", min: 2, max: 30, step: 0.5, show: (p) => !hooked(p), help: "The dowel diameter for pegs, or the pilot hole for screw-in hooks (2.5 to 3 mm)." },
      { kind: "number", key: "hooks.y", label: "Row height", unit: "%", min: 10, max: 95, step: 1, help: "Where the row of hooks sits, from the top of the board." },
      { kind: "number", key: "hooks.margin", label: "End margin", unit: "mm", min: 5, max: 400, step: 1, help: "Distance from each end of the board to the first and last hook." },
      { kind: "text", key: "hooks.labels", label: "Names", multiline: true, maxLength: 400, placeholder: "One name per hook", help: "A name engraved above each hook, one per line, left to right." },
      { kind: "font", key: "hooks.labelFont", label: "Name font", sample: (p) => p.hooks.labels || "Aa", help: "The typeface of the names." },
      { kind: "number", key: "hooks.labelSize", label: "Name height", unit: "mm", min: 3, max: 30, step: 0.5, help: "Cap height of the names." },
    ],
  },
  {
    id: "shelf", title: "Shelf", open: false,
    help: "A small shelf along the top for post, phones or sunglasses.",
    fields: [
      { kind: "toggle", key: "shelf.on", label: "Shelf", help: "Adds a shelf with two brackets that slot into the board." },
      { kind: "number", key: "shelf.depth", label: "Shelf depth", unit: "mm", min: 30, max: 200, step: 1, show: (p) => p.shelf.on, help: "How far the shelf sticks out." },
      { kind: "number", key: "shelf.at", label: "Shelf position", unit: "mm", min: 6, max: 300, step: 1, show: (p) => p.shelf.on, help: "Distance from the top of the board to the shelf." },
    ],
  },
  {
    id: "mount", title: "Wall mounting", open: false,
    help: "How the board hangs.",
    fields: [
      { kind: "choice", key: "mount.kind", label: "Mounting", options: [{ v: "keyhole", text: "Keyhole slots" }, { v: "holes", text: "Screw holes" }, { v: "none", text: "None" }], help: "Keyhole slots hang on two screw heads and hide them; screw holes go straight through." },
      { kind: "number", key: "mount.y", label: "Mount height", unit: "%", min: 5, max: 95, step: 1, show: (p) => p.mount.kind !== "none", help: "Where the mounting holes sit, from the top of the board." },
    ],
  },
  {
    id: "mat", title: "Second material", open: false, show: (p) => p.text.mark === "raised",
    help: "The material of raised letters: mirror or coloured acrylic, or a contrasting wood.",
    fields: material2Fields<KeyrackParams>("mat"),
  },
];

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "board.shape") return shapeArt(v as ShapeKind);
  if (key === "motif.kind") return motifArt(v);
  if (key === "hooks.profile") {
    const p = mergeKeyrack({ T: 3, hooks: { profile: v as HookProfile, reach: 34, size: 14 } });
    const h = hookProfile(p).outer;
    const board: Contour = rect(-6, -10, 3, 44);
    const [b, o] = fitArt([board, h], 36);
    return [{ d: b, fill: true }, { d: o, fill: true }];
  }
  return [];
}

function scaleKeyrack(p: KeyrackParams, s: number): KeyrackParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    board: { ...p.board, width: k(p.board.width), height: k(p.board.height), corner: k(p.board.corner) },
    text: { ...p.text, size: k(p.text.size) },
    textForm: { ...p.textForm, circle: k(p.textForm.circle) },
    motif: { ...p.motif, size: k(p.motif.size), gap: k(p.motif.gap) },
    hooks: { ...p.hooks, margin: k(p.hooks.margin), labelSize: Math.max(3, k(p.hooks.labelSize)) },
    shelf: { ...p.shelf, at: k(p.shelf.at), depth: k(p.shelf.depth) },
  };
}

const HOOK_NAMES = { hook: "hooks", peg: "pegs", screw: "cup hooks" } as const;

export const KEYRACK: GeneratorDef<KeyrackParams> = {
  id: "keyrack",
  name: "Key Holder",
  version: 1,
  defaults: () => mergeKeyrack({}),
  merge: mergeKeyrack,
  sections,
  presets: KEYRACK_PRESETS,
  build: buildKeyrack,
  check: (p, out) => checkKeyrack(p, out as KeyrackOutput),
  pro: (p) => (p.shelf.on ? "Key holders with a shelf need Pro." : p.text.mark === "raised" ? "Raised two-material lettering needs Pro." : null),
  fonts: (p) => [...(p.text.text.trim() ? [p.text.fontId] : []), ...(p.hooks.labels.trim() ? [p.hooks.labelFont] : []), ...motifFonts(p.motif.kind, p.motif.art)],
  scale: scaleKeyrack,
  art,
  batch: () => "text.text",
  fileName: (p) => namedFile("key-holder", p.name, `${Math.round(p.board.width)}mm`),
  summary: (p) => `${SHAPE_NAMES[p.board.shape]} board ${p.board.width} × ${p.board.height} mm · ${p.hooks.count} ${HOOK_NAMES[p.hooks.style]}${p.shelf.on ? " · shelf" : ""}`,
  help: {
    intro: [
      "The Key Holder generator makes a wall board for keys, leads, bags or mugs: any of 18 board shapes, text and a motif engraved, scored or raised in a second material, and a row of hooks.",
      "Hooks are cut from the same sheet and slot through the board (rounded J, square or ball-end profiles), or the board gets holes for wooden dowel pegs or pilot holes for brass cup hooks. Names can be engraved above each hook, a shelf with brackets can be added on top, and keyhole slots hang it on two hidden screws.",
    ],
    tips: [
      "Cut hooks from 4 to 6 mm plywood for heavy bunches; 3 mm hooks suit single keys.",
      "Glue each hook from the back with wood glue and let it set before hanging keys.",
      "Mark the keyhole spacing on the wall with a strip of masking tape laid over the board.",
      "For a two-tone look, engrave the text on walnut-veneer plywood or use raised mirror acrylic letters.",
    ],
    keywords: ["key holder", "key rack", "key hanger", "hooks", "wall organiser", "peg rail", "mug rack"],
  },
};

export { KEYRACK_DEFAULTS };
