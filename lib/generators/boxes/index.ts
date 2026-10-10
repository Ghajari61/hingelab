import { circle, rect, roundedRect } from "../geom";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildBoxes, type BoxesOutput } from "./build";
import { checkBoxes } from "./check";
import { fingerPanel } from "./joints";
import { BOXES_DEFAULTS, DESIGN_NAMES, mergeBoxes, type BoxesParams, type Design } from "./params";
import { BOXES_PRESETS } from "./presets";

const is = (...d: Design[]) => (p: BoxesParams) => d.includes(p.design);
/** Names a design switch may replace: the user has not named the piece yet. */
const BUILT_IN_NAMES = new Set<string>([BOXES_DEFAULTS.name, ...Object.values(DESIGN_NAMES), ...BOXES_PRESETS.map((p) => p.params.name ?? "")]);

const sections: SectionSpec<BoxesParams>[] = [
  {
    id: "design", title: "Design", open: true,
    help: "What to make: a finger-jointed box, a tray with dividers, a desk sign, a photo frame, a phone stand, a key holder or a bird house.",
    fields: [
      {
        kind: "choice", key: "design", label: "Design", rail: true,
        help: "The kind of piece; each one has its own sizes below and its own presets.",
        options: (Object.keys(DESIGN_NAMES) as Design[]).map((v) => ({ v, text: DESIGN_NAMES[v] })),
        apply: (p, v) => ({ ...p, design: v as Design, name: BUILT_IN_NAMES.has(p.name) ? DESIGN_NAMES[v as Design] : p.name }),
      },
    ],
  },
  {
    id: "joint", title: "Finger joints", open: true, show: is("box", "tray", "bird"),
    help: "How the panels lock together at the corners.",
    fields: [
      { kind: "number", key: "joint.finger", label: "Finger width", unit: "mm", min: 3, max: 40, step: 0.5, help: "Target width of each finger; it is adjusted so every edge gets an odd number of equal fingers." },
      { kind: "toggle", key: "joint.outside", label: "Outside sizes", help: "Turn on to enter the outside size; otherwise the sizes are inside, so things you measured will fit." },
    ],
  },
  {
    id: "box", title: "Box", open: true, show: is("box"),
    help: "Size of the box and the kind of lid.",
    fields: [
      { kind: "number", key: "box.width", label: "Width", unit: "mm", min: 20, max: 1000, step: 1, help: "Size from left to right." },
      { kind: "number", key: "box.depth", label: "Depth", unit: "mm", min: 20, max: 1000, step: 1, help: "Size from front to back." },
      { kind: "number", key: "box.height", label: "Height", unit: "mm", min: 15, max: 1000, step: 1, help: "Height of the walls, without a lift-off lid." },
      {
        kind: "choice", key: "box.lid", label: "Lid",
        help: "Closed adds a jointed top, Open leaves it off, and Lift-off adds a loose lid with a lip that drops inside the walls.",
        options: [{ v: "closed", text: "Closed" }, { v: "open", text: "Open" }, { v: "liftoff", text: "Lift-off" }],
      },
      { kind: "number", key: "box.clearance", label: "Lid clearance", unit: "mm", min: 0, max: 2, step: 0.05, show: (p) => p.box.lid === "liftoff", help: "Gap between the lip and the walls, each side, so the lid lifts off easily." },
    ],
  },
  {
    id: "tray", title: "Tray", open: true, show: is("tray"),
    help: "An open box split into compartments by half-lap dividers.",
    fields: [
      { kind: "number", key: "tray.width", label: "Width", unit: "mm", min: 40, max: 1000, step: 1, help: "Size from left to right." },
      { kind: "number", key: "tray.depth", label: "Depth", unit: "mm", min: 40, max: 1000, step: 1, help: "Size from front to back." },
      { kind: "number", key: "tray.height", label: "Height", unit: "mm", min: 15, max: 400, step: 1, help: "Height of the walls." },
      { kind: "number", key: "tray.cols", label: "Columns", unit: "", min: 1, max: 12, step: 1, int: true, help: "Compartments from left to right." },
      { kind: "number", key: "tray.rows", label: "Rows", unit: "", min: 1, max: 12, step: 1, int: true, help: "Compartments from front to back." },
      { kind: "number", key: "tray.dividers", label: "Divider height", unit: "%", min: 30, max: 100, step: 1, help: "Height of the dividers as a share of the inside height; lower dividers make things easier to pick out." },
    ],
  },
  {
    id: "sign", title: "Sign", open: true, show: is("sign"),
    help: "An engraved sign that stands in a slotted base.",
    fields: [
      { kind: "text", key: "sign.text", label: "Text", multiline: true, maxLength: 80, placeholder: "Hello", help: "The words engraved on the sign; each line is centred." },
      { kind: "font", key: "sign.fontId", label: "Font", sample: (p) => p.sign.text || "Aa", help: "Typeface of the text (the same fonts as Letters)." },
      { kind: "number", key: "sign.size", label: "Text height", unit: "mm", min: 4, max: 150, step: 0.5, help: "Cap height of the text." },
      { kind: "number", key: "sign.width", label: "Width", unit: "mm", min: 60, max: 600, step: 1, help: "Width of the sign." },
      { kind: "number", key: "sign.height", label: "Height", unit: "mm", min: 30, max: 300, step: 1, help: "Height of the sign above the base." },
      { kind: "number", key: "sign.corner", label: "Corner radius", unit: "mm", min: 0, max: 40, step: 0.5, help: "Rounds the sign's corners." },
      { kind: "number", key: "sign.base", label: "Base depth", unit: "mm", min: 30, max: 150, step: 1, help: "Front-to-back size of the base; deeper bases keep tall signs steady." },
    ],
  },
  {
    id: "frame", title: "Photo frame", open: true, show: is("frame"),
    help: "A three-layer frame: a front with a window, a middle layer the photo slides into, and a back.",
    fields: [
      { kind: "number", key: "frame.photoW", label: "Photo width", unit: "mm", min: 30, max: 600, step: 1, help: "Width of the print; 10 × 15 cm photos are 100 × 150 mm." },
      { kind: "number", key: "frame.photoH", label: "Photo height", unit: "mm", min: 30, max: 600, step: 1, help: "Height of the print." },
      { kind: "number", key: "frame.border", label: "Border", unit: "mm", min: 8, max: 100, step: 1, help: "Width of the frame around the photo." },
      { kind: "number", key: "frame.overlap", label: "Overlap", unit: "mm", min: 0, max: 20, step: 0.5, help: "How far the front covers the edge of the photo, which holds it in place." },
      { kind: "number", key: "frame.corner", label: "Corner radius", unit: "mm", min: 0, max: 40, step: 0.5, help: "Rounds the frame's outside corners." },
      { kind: "choice", key: "frame.mount", label: "Mount", help: "Stand puts the frame in a slotted base; Hang adds a keyhole on the back for a nail.", options: [{ v: "stand", text: "Stand" }, { v: "hang", text: "Hang" }] },
    ],
  },
  {
    id: "stand", title: "Phone stand", open: true, show: is("stand"),
    help: "Two side profiles joined by a ledge, a brace and a back rest, all with tabs.",
    fields: [
      { kind: "number", key: "stand.width", label: "Width", unit: "mm", min: 40, max: 300, step: 1, help: "Width between the two sides." },
      { kind: "number", key: "stand.angle", label: "Lean", unit: "deg", min: 45, max: 80, step: 1, help: "Angle of the back rest from the desk; 60 to 70 degrees suits reading and video calls." },
      { kind: "number", key: "stand.slot", label: "Slot", unit: "mm", min: 6, max: 30, step: 0.5, help: "Room for the phone's thickness, including its case." },
      { kind: "number", key: "stand.lip", label: "Lip height", unit: "mm", min: 4, max: 30, step: 0.5, help: "Height of the lip in front of the phone; keep it low enough to clear a charging cable." },
      { kind: "number", key: "stand.height", label: "Height", unit: "mm", min: 60, max: 250, step: 1, help: "Height of the stand; taller stands support bigger phones and tablets." },
    ],
  },
  {
    id: "keys", title: "Key holder", open: true, show: is("keys"),
    help: "A wall board with hooks pushed through it and a name engraved above.",
    fields: [
      { kind: "text", key: "keys.text", label: "Text", maxLength: 40, placeholder: "KEYS", help: "The words engraved above the hooks; leave empty for none." },
      { kind: "font", key: "keys.fontId", label: "Font", show: (p) => !!p.keys.text.trim(), sample: (p) => p.keys.text || "Aa", help: "Typeface of the text (the same fonts as Letters)." },
      { kind: "number", key: "keys.size", label: "Text height", unit: "mm", min: 4, max: 60, step: 0.5, show: (p) => !!p.keys.text.trim(), help: "Cap height of the text." },
      { kind: "number", key: "keys.hooks", label: "Hooks", unit: "", min: 1, max: 12, step: 1, int: true, help: "Number of hooks, spaced evenly across the board." },
      { kind: "number", key: "keys.reach", label: "Hook reach", unit: "mm", min: 15, max: 80, step: 1, help: "How far the hooks stand out from the wall." },
      { kind: "number", key: "keys.width", label: "Width", unit: "mm", min: 60, max: 600, step: 1, help: "Width of the board." },
      { kind: "number", key: "keys.height", label: "Height", unit: "mm", min: 50, max: 300, step: 1, help: "Height of the board." },
      { kind: "number", key: "keys.corner", label: "Corner radius", unit: "mm", min: 0, max: 40, step: 0.5, help: "Rounds the board's corners." },
    ],
  },
  {
    id: "bird", title: "Bird house", open: true, show: is("bird"),
    help: "A finger-jointed nest box with a pitched roof, entrance, vents and drain holes.",
    fields: [
      { kind: "number", key: "bird.width", label: "Width", unit: "mm", min: 80, max: 400, step: 1, help: "Size from left to right." },
      { kind: "number", key: "bird.depth", label: "Depth", unit: "mm", min: 80, max: 400, step: 1, help: "Size from front to back." },
      { kind: "number", key: "bird.height", label: "Wall height", unit: "mm", min: 80, max: 500, step: 1, help: "Height of the walls up to the eaves." },
      { kind: "number", key: "bird.pitch", label: "Roof pitch", unit: "deg", min: 20, max: 60, step: 1, help: "Slope of the roof; steeper roofs shed rain faster." },
      { kind: "number", key: "bird.hole", label: "Entrance", unit: "mm", min: 20, max: 80, step: 1, help: "Diameter of the entrance; 25 to 28 mm suits blue tits, 32 mm great tits and sparrows." },
      { kind: "toggle", key: "bird.perch", label: "Perch hole", help: "Adds a hole for an 8 mm dowel below the entrance; nest-box guides advise against perches, since they help predators." },
      { kind: "number", key: "bird.overhang", label: "Roof overhang", unit: "mm", min: 0, max: 60, step: 1, help: "How far the roof reaches past the walls at the front, back and sides." },
    ],
  },
];

/** Rail pictures, drawn from the same shapes the build uses. */
function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key !== "design") return [];
  const open = (cs: Contour[], o: boolean[] = []) => fitArt(cs, 36, o).map((d) => ({ d }));
  const E = { mate: true, ends: true };
  switch (v as Design) {
    case "box": {
      const p = fingerPanel(48, 30, 3, 6, [E, E, E, E], [true, true, true, true]);
      return [{ d: fitArt([p], 38)[0], fill: true }];
    }
    case "tray":
      return open([rect(0, 0, 48, 32), [[16, 0], [16, 32]], [[32, 0], [32, 32]], [[0, 16], [48, 16]]], [false, true, true, true]);
    case "sign":
      return [{ d: fitArt([roundedRect(4, 0, 40, 22, 3), roundedRect(0, 22, 48, 6, 2)], 40).join(" "), fill: true }];
    case "frame":
      return [{ d: fitArt([roundedRect(0, 0, 30, 40, 2), rect(6, 6, 18, 28)], 38).join(" "), fill: true }];
    case "stand":
      return [{ d: fitArt([[[0, 40], [36, 40], [26, 0], [20, 0], [8, 30], [4, 30], [4, 26], [0, 26]]], 38)[0], fill: true }];
    case "keys":
      return open([roundedRect(0, 0, 48, 22, 3), [[10, 14], [10, 28], [14, 28]], [[24, 14], [24, 28], [28, 28]], [[38, 14], [38, 28], [42, 28]]], [false, true, true, true]);
    case "bird":
      return [{ d: fitArt([[[0, 14], [18, 0], [36, 14], [36, 44], [0, 44]], circle(18, 24, 5)], 38).join(" "), fill: true }];
  }
  return [];
}

function size(p: BoxesParams): string {
  const o = (v: number) => (p.joint.outside ? v : v + 2 * p.T);
  switch (p.design) {
    case "box": return `${o(p.box.width)} × ${o(p.box.depth)} × ${o(p.box.height)} mm`;
    case "tray": return `${p.tray.cols} × ${p.tray.rows}, ${o(p.tray.width)} × ${o(p.tray.depth)} mm`;
    case "sign": return `${p.sign.width} × ${p.sign.height} mm`;
    case "frame": return `${p.frame.photoW} × ${p.frame.photoH} mm photo`;
    case "stand": return `${p.stand.width} mm wide, ${p.stand.angle}°`;
    case "keys": return `${Math.round(p.keys.hooks)} hooks`;
    case "bird": return `${p.bird.hole} mm entrance`;
  }
}

function fileTail(p: BoxesParams): string {
  const o = (v: number) => Math.round(p.joint.outside ? v : v + 2 * p.T);
  switch (p.design) {
    case "box": return `${o(p.box.width)}x${o(p.box.depth)}x${o(p.box.height)}mm`;
    case "tray": return `${Math.round(p.tray.cols)}x${Math.round(p.tray.rows)}`;
    case "sign": return `${Math.round(p.sign.width)}x${Math.round(p.sign.height)}mm`;
    case "frame": return `${Math.round(p.frame.photoW)}x${Math.round(p.frame.photoH)}mm`;
    case "stand": return `${Math.round(p.stand.angle)}deg`;
    case "keys": return `${Math.round(p.keys.hooks)}-hooks`;
    case "bird": return `${Math.round(p.bird.hole)}mm`;
  }
}

export const BOXES: GeneratorDef<BoxesParams> = {
  id: "boxes",
  name: "Boxes",
  version: 1,
  defaults: () => mergeBoxes({}),
  merge: mergeBoxes,
  sections,
  presets: BOXES_PRESETS,
  build: buildBoxes,
  check: (p, out) => checkBoxes(p, out as BoxesOutput),
  fonts: (p) => (p.design === "sign" && p.sign.text.trim() ? [p.sign.fontId] : p.design === "keys" && p.keys.text.trim() ? [p.keys.fontId] : []),
  art,
  fileName: (p) => namedFile(p.design === "bird" ? "birdhouse" : p.design, p.name, fileTail(p)),
  summary: (p) => `${DESIGN_NAMES[p.design]}, ${size(p)}`,
  help: {
    intro: [
      "The Boxes generator makes classic laser-cut pieces that slot together: finger-jointed boxes with a closed, open or lift-off lid, trays with half-lap dividers, desk signs, three-layer photo frames, phone and tablet stands, key holders and bird houses.",
      "Finger joints are worked out per edge: each edge gets an odd number of equal fingers, and every finger belongs to exactly one panel, so the panels always mate. Enter inside sizes for things you have measured, or outside sizes to fit a space.",
      "The kerf setting tightens every finger, tab and slot by the same amount; cut a small box from scrap first, then adjust the kerf until the joints press together by hand.",
    ],
    tips: [
      "Fingers about two to three times the material thickness look right and stay strong.",
      "Measure the material with calipers; 3 mm plywood is often 2.7 to 3.2 mm, and the joints depend on it.",
      "Dry-fit everything before gluing, and glue with a thin bead; squeeze-out is hard to clean between fingers.",
      "Open the 3D view to check how the parts go together before cutting.",
    ],
    keywords: ["box", "finger joint", "tray", "organiser", "divider", "sign", "photo frame", "phone stand", "key holder", "bird house", "boxes.py"],
  },
};

export { BOXES_DEFAULTS };
