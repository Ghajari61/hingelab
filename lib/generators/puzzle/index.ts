import { circle, rect, roundedRect } from "../geom";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildPuzzle, puzzleOutline, tabEdge, type PuzzleOutput } from "./build";
import { checkPuzzle } from "./check";
import { CORNERED_PUZZLES, FREE_PIECES, PUZZLE_DEFAULTS, mergePuzzle, type PuzzleParams } from "./params";
import { PUZZLE_PRESETS } from "./presets";

const r1 = (v: number) => Math.round(v * 10) / 10;
const engraves = (k: PuzzleParams["engrave"]["kind"]) => (p: PuzzleParams) => p.engrave.kind === k;

const SHAPE_NAMES: Record<PuzzleParams["shape"]["kind"], string> = {
  rect: "Rectangle", circle: "Circle", oval: "Oval", heart: "Heart", hexagon: "Hexagon", cloud: "Cloud", house: "House", arch: "Arch", shield: "Shield", custom: "Custom",
};
const STYLE_NAMES: Record<PuzzleParams["tabs"]["style"], string> = { classic: "classic", kids: "kids", wavy: "wavy", straight: "straight-cut" };

const sections: SectionSpec<PuzzleParams>[] = [
  {
    id: "shape", title: "Shape", open: true,
    help: "The puzzle's outline and size.",
    fields: [
      {
        kind: "choice", key: "shape.kind", label: "Puzzle shape", rail: true,
        help: "The outline of the whole puzzle; Custom takes the path data of any closed outline.",
        options: (Object.keys(SHAPE_NAMES) as PuzzleParams["shape"]["kind"][]).map((v) => ({ v, text: SHAPE_NAMES[v] })),
      },
      { kind: "number", key: "shape.width", label: "Width", unit: "mm", min: 40, max: 1200, step: 5, help: "Width of the puzzle; a circle's diameter." },
      { kind: "number", key: "shape.height", label: "Height", unit: "mm", min: 40, max: 1200, step: 5, show: (p) => p.shape.kind !== "circle", help: "Height of the puzzle; the outline stretches to fill width × height." },
      { kind: "number", key: "shape.corner", label: "Corner radius", unit: "mm", min: 0, max: 100, step: 1, show: (p) => CORNERED_PUZZLES.includes(p.shape.kind), help: "Rounds the puzzle's corners; 0 keeps them sharp." },
      { kind: "text", key: "shape.path", label: "Custom outline", multiline: true, placeholder: "M 0 0 C …", show: (p) => p.shape.kind === "custom", help: "SVG path data (the d attribute) of a closed outline; it is scaled to fit the width and height." },
    ],
  },
  {
    id: "pieces", title: "Pieces", open: true,
    help: "How many pieces, or the grid of columns and rows.",
    fields: [
      { kind: "toggle", key: "pieces.auto", label: "Set by piece count", help: "Picks columns and rows from a piece count; turn it off to set the grid yourself." },
      { kind: "number", key: "pieces.count", label: "Pieces", unit: "", min: 2, max: 1000, step: 1, int: true, show: (p) => p.pieces.auto, help: `About how many pieces; free accounts export up to ${FREE_PIECES}.` },
      { kind: "number", key: "pieces.cols", label: "Columns", unit: "", min: 1, max: 50, step: 1, int: true, show: (p) => !p.pieces.auto, help: "Pieces across." },
      { kind: "number", key: "pieces.rows", label: "Rows", unit: "", min: 1, max: 50, step: 1, int: true, show: (p) => !p.pieces.auto, help: "Pieces down." },
    ],
  },
  {
    id: "tabs", title: "Tabs", open: true,
    help: "The shape of the cuts between the pieces.",
    fields: [
      {
        kind: "choice", key: "tabs.style", shuffle: true, label: "Edge style", rail: true,
        help: "Classic knobs, chunky knobs for small hands, wavy cuts without knobs, or straight cuts.",
        options: [{ v: "classic", text: "Classic" }, { v: "kids", text: "Kids" }, { v: "wavy", text: "Wavy" }, { v: "straight", text: "Straight" }],
      },
      { kind: "number", key: "tabs.size", label: "Tab size", unit: "%", min: 10, max: 30, step: 1, show: (p) => p.tabs.style !== "straight", help: "How far the knobs reach into the next piece, as a share of the piece size." },
      { kind: "number", key: "tabs.jitter", shuffle: true, label: "Variation", unit: "%", min: 0, max: 15, step: 1, show: (p) => p.tabs.style !== "kids", help: "Bends the grid and varies each tab so no two pieces are alike; 0 gives a regular grid." },
      { kind: "number", key: "tabs.seed", shuffle: true, label: "Layout number", unit: "", min: 1, max: 9999, step: 1, int: true, random: true, help: "Each number gives a different arrangement of tabs; Randomise picks a new one." },
    ],
  },
  {
    id: "frame", title: "Frame", open: false,
    help: "An optional frame around the puzzle, or a tray with a base to keep the pieces in.",
    fields: [
      {
        kind: "choice", key: "frame.kind", shuffle: true, label: "Frame", rail: true,
        help: "No frame, a frame the puzzle drops into, or a tray (the frame glued onto a solid base).",
        options: [{ v: "none", text: "None" }, { v: "frame", text: "Frame" }, { v: "tray", text: "Tray" }],
      },
      { kind: "number", key: "frame.border", label: "Border", unit: "mm", min: 4, max: 100, step: 1, show: (p) => p.frame.kind !== "none", help: "Width of the frame around the puzzle." },
      { kind: "number", key: "frame.clearance", label: "Clearance", unit: "mm", min: 0, max: 3, step: 0.1, show: (p) => p.frame.kind !== "none", help: "Gap between the puzzle and the frame, after the kerf, so the pieces drop in easily." },
      { kind: "number", key: "frame.corner", label: "Frame corners", unit: "mm", min: 0, max: 100, step: 1, show: (p) => p.frame.kind !== "none" && p.shape.kind === "rect", help: "Corner radius of the frame's outside." },
    ],
  },
  {
    id: "engrave", title: "Engraving", open: true,
    help: "A picture, text or piece numbers engraved on the puzzle before it is cut.",
    fields: [
      {
        kind: "choice", key: "engrave.kind", label: "Engraving", rail: true,
        help: "What is engraved on top of the puzzle: nothing, a picture, text, or a small number on every piece.",
        options: [{ v: "none", text: "None" }, { v: "image", text: "Picture" }, { v: "text", text: "Text" }, { v: "numbers", text: "Numbers" }],
      },
      { kind: "image", key: "engrave.image", aspectKey: "engrave.aspect", label: "Picture", show: engraves("image"), help: "A photo or drawing (JPEG or PNG); it is turned grey and covers the puzzle." },
      { kind: "number", key: "engrave.zoom", label: "Picture zoom", unit: "%", min: 100, max: 300, step: 5, show: engraves("image"), help: "Enlarges the picture from the centre; 100 % just covers the puzzle." },
      { kind: "text", key: "engrave.text", label: "Text", multiline: true, maxLength: 120, placeholder: "Name or message", show: engraves("text"), help: "Engraved across the middle of the puzzle; each line is centred." },
      { kind: "font", key: "engrave.fontId", shuffle: true, label: "Font", show: (p) => p.engrave.kind === "text" || p.engrave.kind === "numbers", sample: (p) => (p.engrave.kind === "numbers" ? "123" : p.engrave.text || "Aa"), help: "The typeface of the text or numbers (the same fonts as Letters)." },
      { kind: "number", key: "engrave.size", label: "Text height", unit: "mm", min: 4, max: 300, step: 1, show: engraves("text"), help: "Cap height of the text." },
      { kind: "number", key: "engrave.numberSize", label: "Number height", unit: "mm", min: 2, max: 30, step: 0.5, show: engraves("numbers"), help: "Height of the piece numbers." },
    ],
  },
];

/** Rail pictures, drawn with the real tab curves. */
function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "shape.kind") {
    const o = puzzleOutline(mergePuzzle({ shape: { kind: v, width: v === "rect" ? 150 : 100, height: v === "heart" ? 90 : v === "oval" || v === "cloud" ? 70 : v === "arch" ? 120 : 100, path: v === "custom" ? "M 50 0 L 61 35 L 98 35 L 68 57 L 79 92 L 50 70 L 21 92 L 32 57 L 2 35 L 39 35 Z" : "" } }));
    return o ? [{ d: fitArt([o])[0], fill: true }] : [];
  }
  if (key === "tabs.style") {
    const style = v as PuzzleParams["tabs"]["style"];
    const tab = { style, t: style === "kids" ? 0.12 : 0.1, j: 0 };
    const rand = () => 0.5;
    const lines: Contour[] = [
      [...tabEdge([0, 30], [30, 30], 30, tab, false, rand), ...tabEdge([30, 30], [60, 30], 30, tab, true, rand).slice(1)],
      [...tabEdge([30, 0], [30, 30], 30, tab, true, rand), ...tabEdge([30, 30], [30, 60], 30, tab, false, rand).slice(1)],
    ];
    const [f, ...ls] = fitArt([rect(0, 0, 60, 60), ...lines], 38, [false, true, true]);
    return [{ d: f, fill: true }, ...ls.map((d) => ({ d }))];
  }
  if (key === "frame.kind") {
    const inner = rect(0, 0, 60, 40);
    if (v === "none") return fitArt([inner, rect(-12, -12, 84, 64)].slice(0, 1), 34).map((d) => ({ d, fill: true }));
    const cs = [roundedRect(-10, -10, 80, 60, 6), inner, ...(v === "tray" ? [roundedRect(-6, -6, 80, 60, 6)] : [])];
    const [o, i, t] = fitArt(cs, 40);
    return [...(t ? [{ d: t }] : []), { d: o, fill: true }, { d: i }];
  }
  if (key === "engrave.kind") {
    const base = rect(0, 0, 60, 40);
    const marks: Contour[] = [];
    if (v === "image") marks.push([[6, 34], [20, 18], [30, 28], [40, 14], [54, 34], [6, 34]], circle(16, 11, 4, 0.3));
    if (v === "text") marks.push(rect(10, 13, 40, 5), rect(16, 23, 28, 5));
    if (v === "numbers") for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) marks.push(circle(10 + i * 20, 10 + j * 20, 2.2, 0.3));
    const [b, ...m] = fitArt([base, ...marks], 40);
    return [{ d: b, fill: true }, ...m.map((d) => ({ d })), ...(v === "none" ? fitArt([base, [[20, 0], [20, 40]], [[40, 0], [40, 40]], [[0, 20], [60, 20]]], 40, [false, true, true, true]).slice(1).map((d) => ({ d })) : [])];
  }
  return [];
}

function scalePuzzle(p: PuzzleParams, s: number): PuzzleParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    shape: { ...p.shape, width: k(p.shape.width), height: k(p.shape.height), corner: k(p.shape.corner) },
    frame: { ...p.frame, border: k(p.frame.border), corner: k(p.frame.corner) },
    engrave: { ...p.engrave, size: k(p.engrave.size), numberSize: Math.max(2, k(p.engrave.numberSize)) },
  };
}

export const PUZZLE: GeneratorDef<PuzzleParams> = {
  id: "puzzle",
  name: "Puzzle",
  version: 1,
  defaults: () => mergePuzzle({}),
  merge: mergePuzzle,
  sections,
  presets: PUZZLE_PRESETS,
  build: buildPuzzle,
  check: (p, out) => checkPuzzle(p, out as PuzzleOutput),
  pro: (_p, out) => {
    const n = (out as PuzzleOutput).info?.pieces ?? 0;
    return n > FREE_PIECES ? `Puzzles with more than ${FREE_PIECES} pieces need Pro (this one has ${n}).` : null;
  },
  fonts: (p) => (p.engrave.kind === "text" && p.engrave.text.trim()) || p.engrave.kind === "numbers" ? [p.engrave.fontId] : [],
  scale: scalePuzzle,
  art,
  batch: (p) => (p.engrave.kind === "text" ? "engrave.text" : null),
  fileName: (p) => namedFile("puzzle", p.name, `${Math.round(p.shape.width)}mm`),
  summary: (p) => {
    const size = p.shape.kind === "circle" ? `${p.shape.width} mm` : `${p.shape.width} × ${p.shape.height} mm`;
    const n = p.pieces.auto ? `${p.pieces.count} pieces` : `${p.pieces.cols} × ${p.pieces.rows} pieces`;
    return `${size} ${SHAPE_NAMES[p.shape.kind].toLowerCase()}, ${n}, ${STYLE_NAMES[p.tabs.style]}`;
  },
  help: {
    intro: [
      "The Puzzle generator cuts a jigsaw from a rectangle, circle, oval, heart, hexagon, cloud, house, arch, shield or any closed outline, with classic, kids, wavy or straight cuts, an optional frame or tray, and a picture, text or piece numbers engraved on top.",
      "Every edge between two pieces is drawn once, as a single line joined along each row and column, so the laser never cuts the same line twice. The cuts run half a millimetre past the outline (plus half the kerf), so no piece stays attached.",
      `Free accounts export puzzles of up to ${FREE_PIECES} pieces; larger puzzles need Pro.`,
    ],
    tips: [
      "3 mm plywood or MDF works well; keep pieces at least 15 mm across and tab necks wider than the material is thick.",
      "Engrave the picture first and cut without moving the sheet, so the picture lines up with the pieces.",
      "For a photo, raise the contrast before you load it; engraving flattens mid-greys.",
      "Change the layout number until the edge pieces look right, especially on a heart or circle.",
      "Small children need large pieces: use the Kids style with 4 to 12 pieces, and a tray to keep them together.",
    ],
    keywords: ["puzzle", "jigsaw", "pieces", "tabs", "kids puzzle", "photo puzzle"],
  },
};

export { PUZZLE_DEFAULTS };
