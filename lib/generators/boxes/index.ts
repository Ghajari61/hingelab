import { circle, rect, regularPolygon, roundedRect } from "../geom";
import { MOTIF_OPTIONS, isMotifId } from "../motifs";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildBoxes, type BoxesOutput } from "./build";
import { checkBoxes } from "./check";
import { fingerPanel } from "./joints";
import { hasArt } from "./more";
import { BOXES_DEFAULTS, BOXES_VERSION, DESIGN_NAMES, LID_NAMES, migrateBoxes, mergeBoxes, type BoxesParams, type Design, type LidKind } from "./params";
import { BOXES_PRESETS } from "./presets";

const is = (...d: Design[]) => (p: BoxesParams) => d.includes(p.design);
/** Designs with an engraved face: a lid, the cabinet top, or the money box's front. */
const engraved = (p: BoxesParams) =>
  (p.design === "box" && p.box.lid !== "open") || (p.design === "tray" && p.tray.lid !== "none") || p.design === "drawer" || (p.design === "hex" && p.hex.lid === "liftoff") || p.design === "money" || (p.design === "stack" && p.stack.lid);
/** Names a design switch may replace: the user has not named the piece yet. */
const BUILT_IN_NAMES = new Set<string>([BOXES_DEFAULTS.name, ...Object.values(DESIGN_NAMES), ...BOXES_PRESETS.map((p) => p.params.name ?? "")]);

const sections: SectionSpec<BoxesParams>[] = [
  {
    id: "design", title: "Design", open: true,
    help: "What to make: a finger-jointed box, a tray with dividers, a drawer box, a hexagon box, a divider insert, a money box, stacking trays, a desk sign, a photo frame, a phone stand, a key holder or a bird house.",
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
    id: "joint", title: "Joints", open: true, show: is("box", "tray", "bird", "drawer", "money", "stack"),
    help: "How the panels lock together at the corners.",
    fields: [
      {
        kind: "choice", key: "joint.style", label: "Joint style", show: is("box", "tray", "money"),
        help: "Fingers joins every edge with interlocking fingers; Tab and slot stands the walls on a bottom that overhangs them, with tabs through slots, and keeps fingers at the corners.",
        options: [{ v: "fingers", text: "Fingers" }, { v: "tabs", text: "Tab and slot" }],
      },
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
      { kind: "number", key: "box.height", label: "Height", unit: "mm", min: 15, max: 1000, step: 1, help: "Height inside, from the bottom to the underside of the lid (the outside height with Outside sizes)." },
      {
        kind: "choice", key: "box.lid", label: "Lid", rail: true,
        help: "Closed adds a jointed top and Open leaves it off. Lift-off drops a lip inside the walls, Sliding runs in a groove built on the walls, Pin hinge turns on two pins, and Inset sits flush inside the walls with a knob.",
        options: (Object.keys(LID_NAMES) as LidKind[]).map((v) => ({ v, text: LID_NAMES[v] })),
      },
      { kind: "number", key: "box.clearance", label: "Lid clearance", unit: "mm", min: 0, max: 2, step: 0.05, show: (p) => p.box.lid !== "closed" && p.box.lid !== "open", help: "Gap between the lid and the walls, each side, so the lid moves easily." },
      { kind: "number", key: "box.pin", label: "Pin diameter", unit: "mm", min: 1.5, max: 8, step: 0.1, show: (p) => p.box.lid === "pin" || (p.design === "tray" && p.tray.lid === "pin"), help: "Diameter of the hinge pins: a dowel, a nail, or 1.75 mm or 3 mm printer filament." },
      { kind: "toggle", key: "box.notch", label: "Finger notch", show: (p) => p.box.lid === "open" || p.box.lid === "sliding" || p.box.lid === "pin", help: "Cuts a half-round notch for a finger: in the front wall of an open or hinged box, or in the front of a sliding lid." },
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
      {
        kind: "choice", key: "tray.lid", label: "Lid",
        help: "A lid turns the tray into a tea, card or jewellery box; the dividers stay below the lid and its fittings.",
        options: [{ v: "none", text: "None" }, { v: "liftoff", text: "Lift-off" }, { v: "sliding", text: "Sliding" }, { v: "pin", text: "Pin hinge" }, { v: "inset", text: "Inset with knob" }],
      },
    ],
  },
  {
    id: "drawer", title: "Drawer box", open: true, show: is("drawer"),
    help: "A finger-jointed cabinet, open at the front, with drawers stacked inside.",
    fields: [
      { kind: "number", key: "drawer.width", label: "Width", unit: "mm", min: 60, max: 600, step: 1, help: "Size of the cabinet from left to right." },
      { kind: "number", key: "drawer.depth", label: "Depth", unit: "mm", min: 50, max: 600, step: 1, help: "Size of the cabinet from front to back." },
      { kind: "number", key: "drawer.height", label: "Height", unit: "mm", min: 30, max: 600, step: 1, help: "Height of the cabinet; it is shared by the drawers." },
      { kind: "number", key: "drawer.drawers", label: "Drawers", unit: "", min: 1, max: 4, step: 1, int: true, help: "Drawers stacked in the cabinet, each the same height." },
      { kind: "choice", key: "drawer.pull", label: "Pull", help: "How to open a drawer: a finger hole in the front, a half-round notch at the top, or a round knob.", options: [{ v: "hole", text: "Finger hole" }, { v: "notch", text: "Notch" }, { v: "knob", text: "Knob" }] },
      { kind: "number", key: "drawer.clearance", label: "Drawer clearance", unit: "mm", min: 0.1, max: 3, step: 0.1, help: "Gap around each drawer so it slides; raise it for plywood that is not flat." },
    ],
  },
  {
    id: "hex", title: "Hexagon box", open: true, show: is("hex"),
    help: "Six walls with tabs through a hexagonal bottom, with or without a lift-off lid.",
    fields: [
      { kind: "number", key: "hex.width", label: "Width", unit: "mm", min: 40, max: 500, step: 1, help: "Size across the flat sides, inside the walls." },
      { kind: "number", key: "hex.height", label: "Height", unit: "mm", min: 15, max: 400, step: 1, help: "Height inside, from the bottom to the top of the walls." },
      { kind: "choice", key: "hex.lid", label: "Lid", help: "Lift-off adds a hexagonal lid with a lip that drops inside the walls.", options: [{ v: "liftoff", text: "Lift-off" }, { v: "open", text: "Open" }] },
      { kind: "number", key: "hex.clearance", label: "Lid clearance", unit: "mm", min: 0, max: 2, step: 0.05, show: (p) => p.hex.lid === "liftoff", help: "Gap between the lip and the walls, each side." },
    ],
  },
  {
    id: "insert", title: "Divider insert", open: true, show: is("insert"),
    help: "A grid of half-lap dividers that drops into a box or drawer you already have.",
    fields: [
      { kind: "number", key: "insert.width", label: "Inside width", unit: "mm", min: 30, max: 1000, step: 1, help: "Inside width of the box the insert goes into." },
      { kind: "number", key: "insert.depth", label: "Inside depth", unit: "mm", min: 30, max: 1000, step: 1, help: "Inside depth of the box the insert goes into." },
      { kind: "number", key: "insert.height", label: "Divider height", unit: "mm", min: 10, max: 400, step: 1, help: "Height of the dividers; keep it below the lid." },
      { kind: "number", key: "insert.cols", label: "Columns", unit: "", min: 1, max: 12, step: 1, int: true, help: "Compartments from left to right." },
      { kind: "number", key: "insert.rows", label: "Rows", unit: "", min: 1, max: 12, step: 1, int: true, help: "Compartments from front to back." },
      { kind: "number", key: "insert.clearance", label: "Clearance", unit: "mm", min: 0, max: 3, step: 0.1, help: "Gap left at each wall so the grid drops in." },
    ],
  },
  {
    id: "money", title: "Money box", open: true, show: is("money"),
    help: "A closed box with a coin slot in the top and a plug in the bottom to empty it.",
    fields: [
      { kind: "number", key: "money.width", label: "Width", unit: "mm", min: 50, max: 400, step: 1, help: "Size from left to right." },
      { kind: "number", key: "money.depth", label: "Depth", unit: "mm", min: 50, max: 400, step: 1, help: "Size from front to back." },
      { kind: "number", key: "money.height", label: "Height", unit: "mm", min: 50, max: 400, step: 1, help: "Height inside." },
      { kind: "number", key: "money.slot", label: "Coin slot", unit: "mm", min: 15, max: 90, step: 1, help: "Length of the slot; 32 mm takes every euro, pound and dollar coin, 70 mm folded notes." },
      { kind: "number", key: "money.plug", label: "Plug", unit: "mm", min: 20, max: 120, step: 1, help: "Diameter of the plug in the bottom; make it wide enough for a hand or at least for the coins." },
    ],
  },
  {
    id: "stack", title: "Stacking trays", open: true, show: is("stack"),
    help: "Open trays of the same size; a ring under each one keeps the stack in line.",
    fields: [
      { kind: "number", key: "stack.width", label: "Width", unit: "mm", min: 50, max: 600, step: 1, help: "Size from left to right." },
      { kind: "number", key: "stack.depth", label: "Depth", unit: "mm", min: 50, max: 600, step: 1, help: "Size from front to back." },
      { kind: "number", key: "stack.height", label: "Tray height", unit: "mm", min: 15, max: 200, step: 1, help: "Height inside each tray." },
      { kind: "number", key: "stack.trays", label: "Trays", unit: "", min: 1, max: 5, step: 1, int: true, help: "Number of trays in the stack." },
      { kind: "toggle", key: "stack.lid", label: "Lid", help: "Adds a lid with a ring, which closes the top tray." },
      { kind: "number", key: "stack.clearance", label: "Ring clearance", unit: "mm", min: 0, max: 2, step: 0.05, help: "Gap between each ring and the walls of the tray below." },
    ],
  },
  {
    id: "engrave", title: "Engraving", open: false, show: engraved,
    help: "Text, a motif and a border engraved on the lid (the cabinet top of a drawer box, the front of a money box).",
    fields: [
      { kind: "text", key: "engrave.text", label: "Text", multiline: true, maxLength: 80, placeholder: "Tea", help: "Words engraved on the lid; each line is centred." },
      { kind: "font", key: "engrave.fontId", label: "Font", show: (p) => !!p.engrave.text.trim(), sample: (p) => p.engrave.text || "Aa", help: "Typeface of the text (the same fonts as Letters)." },
      { kind: "number", key: "engrave.size", label: "Text height", unit: "mm", min: 4, max: 80, step: 0.5, show: (p) => !!p.engrave.text.trim(), help: "Cap height of the text." },
      { kind: "choice", key: "engrave.motif", label: "Motif", help: "A picture engraved above the text.", options: MOTIF_OPTIONS },
      { kind: "number", key: "engrave.motifSize", label: "Motif size", unit: "mm", min: 8, max: 200, step: 1, show: (p) => isMotifId(p.engrave.motif), help: "Larger side of the motif." },
      { kind: "number", key: "engrave.border", label: "Border inset", unit: "mm", min: 0, max: 40, step: 0.5, help: "Engraves a line this far in from the edge; 0 leaves it off." },
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
      { kind: "number", key: "sign.border", label: "Border inset", unit: "mm", min: 0, max: 40, step: 0.5, help: "Engraves a border line this far in from the edge, following the outline; 0 leaves it off." },
      { kind: "number", key: "sign.borderWidth", label: "Border width", unit: "mm", min: 0.3, max: 10, step: 0.1, show: (p) => p.sign.border > 0, help: "Width of the engraved border line." },
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
  const open = (cs: Contour[], o: boolean[] = []) => fitArt(cs, 36, o).map((d) => ({ d }));
  const solid = (cs: Contour[], box = 38) => [{ d: fitArt(cs, box).join(" "), fill: true }];
  if (key === "box.lid") {
    // The box from the side, with its lid.
    const body = rect(0, 10, 48, 26);
    switch (v as LidKind) {
      case "closed": return solid([rect(0, 6, 48, 30)]);
      case "open": return open([[[0, 6], [0, 36], [48, 36], [48, 6]]], [true]);
      case "liftoff": return solid([body, rect(0, 4, 48, 4), rect(4, 8, 40, 2)]);
      case "sliding": return [...solid([body, rect(0, 4, 40, 3), rect(0, 0, 48, 3)]), { d: fitArt([[[40, 5.5], [52, 5.5]], [[48, 3.5], [52, 5.5], [48, 7.5]]], 38, [true, true]).join(" ") }];
      case "pin": return solid([body, [[0, 8], [48, 8], [48, 10], [10, 10], [4, 2], [6, 0]], circle(44, 12, 1.5)]);
      case "inset": return solid([rect(0, 6, 48, 30), rect(20, 1, 8, 2), rect(16, -2, 16, 3)]);
    }
    return [];
  }
  if (key !== "design") return [];
  const E = { mate: true, ends: true };
  switch (v as Design) {
    case "drawer":
      return [{ d: fitArt([rect(0, 0, 44, 40), rect(4, 4, 36, 15), rect(4, 21, 36, 15), circle(22, 11.5, 2.5), circle(22, 28.5, 2.5)], 38).join(" "), fill: true }];
    case "hex":
      return [{ d: fitArt([regularPolygon(6, 22, 90), regularPolygon(6, 16, 90)], 38).join(" "), fill: true }];
    case "insert":
      return open([[[0, 14], [48, 14]], [[0, 28], [48, 28]], [[12, 0], [12, 42]], [[24, 0], [24, 42]], [[36, 0], [36, 42]]], [true, true, true, true, true]);
    case "money":
      return [{ d: fitArt([rect(0, 6, 40, 34), rect(14, 0, 12, 3), circle(20, 23, 6)], 38).join(" "), fill: true }];
    case "stack":
      return [{ d: fitArt([rect(0, 0, 48, 11), rect(0, 14, 48, 11), rect(0, 28, 48, 11)], 38).join(" "), fill: true }];
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
    case "drawer": return `${Math.round(p.drawer.drawers)} drawers, ${o(p.drawer.width)} × ${o(p.drawer.height)} mm`;
    case "hex": return `${p.hex.width} mm across, ${p.hex.height} mm deep`;
    case "insert": return `${Math.round(p.insert.cols)} × ${Math.round(p.insert.rows)} for ${p.insert.width} × ${p.insert.depth} mm`;
    case "money": return `${o(p.money.width)} × ${o(p.money.depth)} × ${o(p.money.height)} mm`;
    case "stack": return `${Math.round(p.stack.trays)} trays, ${o(p.stack.width)} × ${o(p.stack.depth)} mm`;
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
    case "drawer": return `${Math.round(p.drawer.drawers)}-drawers`;
    case "hex": return `${Math.round(p.hex.width)}mm`;
    case "insert": return `${Math.round(p.insert.cols)}x${Math.round(p.insert.rows)}`;
    case "money": return `${o(p.money.width)}x${o(p.money.depth)}x${o(p.money.height)}mm`;
    case "stack": return `${Math.round(p.stack.trays)}-trays`;
  }
}

export const BOXES: GeneratorDef<BoxesParams> = {
  id: "boxes",
  name: "Boxes",
  version: BOXES_VERSION,
  defaults: () => mergeBoxes({}),
  merge: mergeBoxes,
  migrate: migrateBoxes,
  sections,
  presets: BOXES_PRESETS,
  build: buildBoxes,
  check: (p, out) => checkBoxes(p, out as BoxesOutput),
  fonts: (p) => (p.design === "sign" && p.sign.text.trim() ? [p.sign.fontId] : p.design === "keys" && p.keys.text.trim() ? [p.keys.fontId] : engraved(p) && hasArt(p) && p.engrave.text.trim() ? [p.engrave.fontId] : []),
  art,
  fileName: (p) => namedFile(p.design === "bird" ? "birdhouse" : p.design, p.name, fileTail(p)),
  summary: (p) => `${DESIGN_NAMES[p.design]}, ${size(p)}`,
  help: {
    intro: [
      "The Boxes generator makes classic laser-cut pieces that slot together: finger-jointed boxes with a closed, open, lift-off, sliding, pin-hinged or inset lid, trays with half-lap dividers (with a lid they make tea and card boxes), drawer boxes with up to four drawers, hexagon boxes, divider inserts for boxes you already have, money boxes, stacking trays, desk signs, three-layer photo frames, phone and tablet stands, key holders and bird houses.",
      "Boxes can use tab-and-slot joints instead of fingers on the bottom and top, and lids can carry engraved text, a motif and a border.",
      "Finger joints are worked out per edge: each edge gets an odd number of equal fingers, and every finger belongs to exactly one panel, so the panels always mate. Enter inside sizes for things you have measured, or outside sizes to fit a space.",
      "The kerf setting tightens every finger, tab and slot by the same amount; cut a small box from scrap first, then adjust the kerf until the joints press together by hand.",
    ],
    tips: [
      "Fingers about two to three times the material thickness look right and stay strong.",
      "Measure the material with calipers; 3 mm plywood is often 2.7 to 3.2 mm, and the joints depend on it.",
      "Dry-fit everything before gluing, and glue with a thin bead; squeeze-out is hard to clean between fingers.",
      "Open the 3D view to check how the parts go together before cutting.",
    ],
    keywords: ["box", "finger joint", "tab and slot", "sliding lid", "hinged lid", "drawer", "hexagon box", "insert", "money box", "piggy bank", "pencil box", "tea box", "wine box", "stacking trays", "tray", "organiser", "divider", "sign", "photo frame", "phone stand", "key holder", "bird house", "boxes.py"],
  },
};

export { BOXES_DEFAULTS };
