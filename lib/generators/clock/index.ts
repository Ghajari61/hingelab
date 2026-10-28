import { letterMarkField, noWeldField } from "../textOps";
import { circle, transform } from "../geom";
import { HEART_PATH as HEART, fitArt as fit, namedFile } from "../util";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { buildClock, faceOutline, handOutline } from "./build";
import { checkClock } from "./check";
import { CLOCK_DEFAULTS, MOVEMENTS, mergeClock, type ClockParams, type MovementId } from "./params";
import { CLOCK_PRESETS } from "./presets";
import { byId, withPattern } from "../pattern";

const r1 = (v: number) => Math.round(v * 10) / 10;
const pointed = (p: ClockParams) => ["sunburst", "gear", "scallop", "flower"].includes(p.face.shape);
const hasNumerals = (p: ClockParams) => p.markers.style === "numerals" || p.markers.style === "mixed";
const hasInscription = (p: ClockParams) => !!p.inscription.text.trim();
const hasTicks = (p: ClockParams) => p.markers.style === "ticks" || p.markers.style === "mixed" || p.markers.minutes;

const SHAPE_NAMES: Record<ClockParams["face"]["shape"], string> = {
  round: "Round", square: "Square", polygon: "Polygon", sunburst: "Sunburst", gear: "Gear", scallop: "Scalloped", flower: "Flower", heart: "Heart", cloud: "Cloud", custom: "Custom",
};
const MARKER_NAMES: Record<ClockParams["markers"]["style"], string> = {
  numerals: "Numerals", mixed: "Numerals and ticks", ticks: "Ticks", dots: "Dots", none: "No markers",
};

const sections: SectionSpec<ClockParams>[] = [
  {
    id: "face", title: "Face", open: true,
    help: "The clock's outline and how many layers it is cut from.",
    fields: [
      {
        kind: "choice", key: "face.shape", shuffle: true, label: "Face shape", rail: true,
        help: "The outline of the clock face; Custom takes the path data of any closed outline.",
        options: [
          { v: "round", text: "Round" }, { v: "square", text: "Square" }, { v: "polygon", text: "Polygon" },
          { v: "sunburst", text: "Sunburst" }, { v: "gear", text: "Gear" }, { v: "scallop", text: "Scalloped" },
          { v: "flower", text: "Flower" }, { v: "heart", text: "Heart" }, { v: "cloud", text: "Cloud" }, { v: "custom", text: "Custom", input: "text" },
        ],
      },
      { kind: "number", key: "face.size", label: "Size", unit: "mm", min: 80, max: 1200, step: 5, help: "Width of the face across its widest point (corners or ray tips)." },
      { kind: "number", key: "face.sides", label: "Sides", unit: "", min: 3, max: 24, step: 1, int: true, show: (p) => p.face.shape === "polygon", help: "Number of sides of the polygon face." },
      { kind: "number", key: "face.corner", label: "Corner radius", unit: "mm", min: 0, max: 120, step: 1, show: (p) => ["square", "polygon", "sunburst"].includes(p.face.shape), help: "Rounds the corners of the face; 0 keeps them sharp." },
      { kind: "number", key: "face.rays", shuffle: true, label: "Rays", unit: "", min: 6, max: 72, step: 1, int: true, show: pointed, help: "Number of rays, teeth, scallops or petals around the edge." },
      { kind: "number", key: "face.depth", label: "Ray depth", unit: "mm", min: 2, max: 200, step: 1, show: pointed, help: "How far the rays, teeth or scallops reach in from the outer edge; for a flower, the petal radius." },
      { kind: "text", key: "face.path", label: "Custom outline", multiline: true, placeholder: "M 0 0 C …", show: (p) => p.face.shape === "custom", help: "SVG path data (the d attribute) of a closed outline; it is scaled to the face size." },
      {
        kind: "choice", key: "face.layers", shuffle: true, label: "Layers", rail: true,
        help: "Single cuts the face from one sheet; Ring adds a raised ring on a back plate; Stack adds a centre disc as well.",
        options: [{ v: "single", text: "Single" }, { v: "ring", text: "Ring on back" }, { v: "stack", text: "Ring and centre" }],
      },
      { kind: "number", key: "face.ring", label: "Ring width", unit: "mm", min: 5, max: 200, step: 1, show: (p) => p.face.layers !== "single", help: "Width of the raised ring, measured in from the outer edge." },
      { kind: "number", key: "face.centre", label: "Centre disc", unit: "mm", min: 20, max: 400, step: 1, show: (p) => p.face.layers === "stack", help: "Diameter of the raised disc in the middle of the face." },
    ],
  },
  {
    id: "markers", title: "Markers",
    help: "The hour marks: ticks, dots or numerals, engraved or cut through.",
    fields: [
      {
        kind: "choice", key: "markers.style", shuffle: true, label: "Markers", rail: true,
        help: "What marks the hours: numerals, ticks, dots, or numerals at 12, 3, 6 and 9 with ticks between.",
        options: [
          { v: "numerals", text: "Numerals" }, { v: "mixed", text: "Numerals + ticks" }, { v: "ticks", text: "Ticks" },
          { v: "dots", text: "Dots" }, { v: "none", text: "None" },
        ],
      },
      {
        kind: "choice", key: "markers.numerals", shuffle: true, label: "Numerals", show: hasNumerals,
        help: "Arabic (1–12) or Roman (I–XII, with the clockmaker's IIII or the modern IV) numerals.",
        options: [{ v: "roman", text: "Roman (IIII)" }, { v: "roman-iv", text: "Roman (IV)" }, { v: "arabic", text: "Arabic" }],
      },
      { kind: "toggle", key: "markers.quarters", shuffle: true, label: "Only 12, 3, 6 and 9", show: (p) => p.markers.style === "numerals", help: "Shows four numerals and ticks for the other hours." },
      { kind: "font", key: "markers.fontId", shuffle: true, label: "Font", show: hasNumerals, sample: (p) => (p.markers.numerals.startsWith("roman") ? "XIIV" : "123456789"), help: "The typeface of the numerals (the same fonts as Letters)." },
      { kind: "number", key: "markers.size", label: "Numeral height", unit: "mm", min: 4, max: 200, step: 1, show: hasNumerals, help: "Cap height of the numerals." },
      { kind: "number", key: "markers.inset", label: "Edge gap", unit: "mm", min: 0, max: 200, step: 1, show: (p) => p.markers.style !== "none" || p.markers.minutes, help: "Gap between the edge of the face and the outer end of the markers." },
      { kind: "number", key: "markers.tickLength", label: "Tick length", unit: "mm", min: 2, max: 100, step: 1, show: hasTicks, help: "Length of the hour ticks; minute ticks are a little under half as long." },
      { kind: "number", key: "markers.tickWidth", label: "Tick width", unit: "mm", min: 0.5, max: 30, step: 0.5, show: hasTicks, help: "Width of the hour ticks; the ticks at 12, 3, 6 and 9 are wider." },
      { kind: "number", key: "markers.dot", label: "Dot size", unit: "mm", min: 2, max: 60, step: 0.5, show: (p) => p.markers.style === "dots", help: "Diameter of the hour dots; the dots at 12, 3, 6 and 9 are larger." },
      { kind: "toggle", key: "markers.minutes", shuffle: true, label: "Minute ticks", help: "Adds a short tick for every minute between the hours." },
      { kind: "toggle", key: "markers.cut", label: "Cut through", show: (p) => p.markers.style !== "none" || p.markers.minutes, help: "Cuts the markers out instead of engraving them, so the layer behind shows through." },
      letterMarkField<ClockParams>("markers.mark", "Mark", (p) => (p.markers.style !== "none" || p.markers.minutes) && (p.markers.style === "numerals" || p.markers.style === "mixed" || !p.markers.cut)),
      { kind: "toggle", key: "markers.follow", shuffle: true, label: "Follow the dial", show: hasNumerals, help: "Turns each numeral so its top points outward, as on classic dials, instead of standing upright." },
    ],
  },
  {
    id: "inscription", title: "Text on the dial",
    help: "A line of text bent along the dial inside the markers, such as a name, a date or a motto.",
    fields: [
      { kind: "text", key: "inscription.text", label: "Text", maxLength: 60, placeholder: "Since 2026", help: "The words bent along the dial; leave empty for none." },
      {
        kind: "choice", key: "inscription.at", label: "Position", show: hasInscription,
        help: "Along the top the text reads clockwise with the letters standing outward; along the bottom it reads the other way, so both read left to right.",
        options: [{ v: "top", text: "Top" }, { v: "bottom", text: "Bottom" }],
      },
      { kind: "font", key: "inscription.fontId", shuffle: true, label: "Font", show: hasInscription, sample: (p) => p.inscription.text || "Aa", help: "Typeface of the text (the same fonts as Letters)." },
      { kind: "number", key: "inscription.size", label: "Text height", unit: "mm", min: 3, max: 80, step: 0.5, show: hasInscription, help: "Cap height of the text." },
      { kind: "number", key: "inscription.gap", label: "Gap to markers", unit: "mm", min: 0, max: 100, step: 0.5, show: hasInscription, help: "Space between the markers and the text; a larger gap moves the text toward the centre." },
      letterMarkField<ClockParams>("inscription.mark", "Mark", hasInscription),
      noWeldField<ClockParams>("inscription.noWeld", (p) => hasInscription(p) && p.inscription.mark === "score", "inscription", ["score"]),
    ],
  },
  {
    id: "hands", title: "Hands",
    help: "The hour and minute hands, cut with holes that press onto the movement.",
    fields: [
      {
        kind: "choice", key: "hands.style", shuffle: true, label: "Hands", rail: true,
        help: "The hand shape; None leaves them out if you use the hands that came with the movement.",
        options: [
          { v: "spade", text: "Spade" }, { v: "baton", text: "Baton" }, { v: "classic", text: "Pointer" },
          { v: "leaf", text: "Leaf" }, { v: "arrow", text: "Arrow" }, { v: "none", text: "None" },
        ],
      },
      { kind: "number", key: "hands.minute", label: "Minute hand", unit: "mm", min: 20, max: 400, step: 1, show: (p) => p.hands.style !== "none", help: "Length from the centre of the shaft to the tip of the minute hand." },
      { kind: "number", key: "hands.hour", label: "Hour hand", unit: "mm", min: 15, max: 300, step: 1, show: (p) => p.hands.style !== "none", help: "Length from the centre of the shaft to the tip of the hour hand." },
      { kind: "number", key: "hands.width", label: "Width", unit: "mm", min: 2, max: 60, step: 0.5, show: (p) => p.hands.style !== "none", help: "Widest part of the minute hand; the hour hand is a quarter wider." },
      { kind: "number", key: "hands.tail", label: "Tail", unit: "mm", min: 0, max: 120, step: 1, show: (p) => p.hands.style !== "none", help: "Counterweight behind the centre, which helps the movement turn long hands." },
    ],
  },
  {
    id: "movement", title: "Movement",
    help: "The quartz clock movement the face and hands are cut for.",
    fields: [
      {
        kind: "choice", key: "movement.id", label: "Movement",
        help: "Standard quartz movements differ in shaft length, which limits how thick the face can be at the centre.",
        options: [
          ...MOVEMENTS.map((m) => ({ v: m.id, text: m.name })),
          { v: "custom", text: "Custom sizes" },
        ],
        apply: (p, v) => {
          const m = MOVEMENTS.find((q) => q.id === v);
          return { ...p, movement: m ? { ...m } : { ...p.movement, id: v as MovementId, name: "Custom" } };
        },
      },
      { kind: "number", key: "movement.shaft", label: "Shaft hole", unit: "mm", min: 3, max: 20, step: 0.1, show: (p) => p.movement.id === "custom", help: "Hole through the face for the movement's threaded shaft." },
      { kind: "number", key: "movement.hourHole", label: "Hour hand hole", unit: "mm", min: 2, max: 12, step: 0.1, show: (p) => p.movement.id === "custom", help: "Round hole in the hour hand; measure the movement's hour pipe." },
      { kind: "number", key: "movement.minuteW", label: "Minute hole width", unit: "mm", min: 1, max: 10, step: 0.1, show: (p) => p.movement.id === "custom", help: "Minute hand hole, measured across its round sides." },
      { kind: "number", key: "movement.minuteH", label: "Minute hole flats", unit: "mm", min: 1, max: 10, step: 0.1, show: (p) => p.movement.id === "custom", help: "Minute hand hole, measured across its two flat sides." },
      { kind: "number", key: "movement.maxDial", label: "Thickest face", unit: "mm", min: 1, max: 30, step: 0.5, show: (p) => p.movement.id === "custom", help: "The thickest face the shaft's thread can clamp." },
    ],
  },
  {
    id: "hanging", title: "Hanging",
    help: "How the clock hangs on the wall or stands on a desk.",
    fields: [
      {
        kind: "choice", key: "hanger", label: "Hanger",
        help: "A keyhole slot on the back plate, a small hole near the top, or none (most movements have a hook).",
        options: [{ v: "keyhole", text: "Keyhole" }, { v: "hole", text: "Hole at the top" }, { v: "none", text: "None" }],
      },
      { kind: "toggle", key: "stand", label: "Desk stand", help: "Adds a base with a slot; a tab under the face pushes into it." },
    ],
  },
];

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "face.shape") {
    const p = mergeClock({ face: { shape: v, size: 100, sides: 6, rays: v === "gear" ? 12 : v === "scallop" ? 10 : v === "flower" ? 8 : 16, depth: v === "sunburst" ? 14 : v === "flower" ? 16 : 8, corner: v === "square" ? 14 : 6, path: v === "custom" ? HEART : "" } });
    const o = faceOutline(p);
    return o ? [{ d: fit([o])[0], fill: true }] : [];
  }
  if (key === "face.layers") {
    const cs = [circle(0, 0, 50), ...(v !== "single" ? [circle(0, 0, 36)] : []), ...(v === "stack" ? [circle(0, 0, 14)] : [])];
    return fit(cs).map((d, i) => ({ d, fill: i === 0 }));
  }
  if (key === "markers.style") {
    const face = circle(0, 0, 50), marks: Contour[] = [];
    for (let h = 0; h < 12; h++) {
      const a = h * 30, q = h % 3 === 0;
      const num = v === "numerals" || (v === "mixed" && q);
      if (v === "none") break;
      if (num) marks.push(transform([[-4, -44], [4, -44], [4, -34], [-4, -34]], { rot: a }));
      else if (v === "dots") marks.push(transform(circle(0, -41, q ? 4 : 2.6, 0.2), { rot: a }));
      else marks.push(transform([[-1.5, -45], [1.5, -45], [1.5, -36], [-1.5, -36]], { rot: a }));
    }
    const [f, ...m] = fit([face, ...marks]);
    return [{ d: f, fill: true }, ...m.map((d) => ({ d, fill: false }))];
  }
  if (key === "hands.style") {
    if (v === "none") return fit([circle(0, 0, 50), circle(0, 0, 3)]).map((d, i) => ({ d, fill: i === 0 }));
    const hour = transform(handOutline(v as ClockParams["hands"]["style"], 30, 9, 6, 3), { rot: 300 });
    const minute = transform(handOutline(v as ClockParams["hands"]["style"], 44, 7, 8, 3), { rot: 60 });
    const [f, a, b] = fit([circle(0, 0, 50), hour, minute]);
    return [{ d: f, fill: true }, { d: a }, { d: b }];
  }
  return [];
}

function scaleClock(p: ClockParams, s: number): ClockParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    face: { ...p.face, size: k(p.face.size), corner: k(p.face.corner), depth: k(p.face.depth), ring: k(p.face.ring), centre: k(p.face.centre) },
    markers: { ...p.markers, size: k(p.markers.size), inset: k(p.markers.inset), tickLength: k(p.markers.tickLength), tickWidth: k(p.markers.tickWidth), dot: k(p.markers.dot) },
    hands: { ...p.hands, hour: k(p.hands.hour), minute: k(p.hands.minute), width: k(p.hands.width), tail: k(p.hands.tail) },
    inscription: { ...p.inscription, size: k(p.inscription.size), gap: k(p.inscription.gap) },
  };
}


const CLOCK_BASE: GeneratorDef<ClockParams> = {
  id: "clock",
  name: "Clock",
  version: 1,
  defaults: () => mergeClock({}),
  merge: mergeClock,
  sections,
  presets: CLOCK_PRESETS,
  build: buildClock,
  check: checkClock,
  fonts: (p) => [...new Set([...(hasNumerals(p) ? [p.markers.fontId] : []), ...(hasInscription(p) ? [p.inscription.fontId] : [])])],
  scale: scaleClock,
  art,
  batch: () => "inscription.text",
  fileName: (p) => namedFile("clock", p.name, `${Math.round(p.face.size)}mm`),

  summary: (p) => `${p.face.size} mm ${SHAPE_NAMES[p.face.shape].toLowerCase()} face, ${MARKER_NAMES[p.markers.style].toLowerCase()}`,
  help: {
    intro: [
      "The Clock generator draws a wall or desk clock to fit a standard quartz movement: the face, hour markers, hands with the right holes, a hanger and an optional stand. Faces come round, square, polygonal, sunburst, gear, scalloped, flower, heart, cloud or any outline you paste.",
      "Buy the movement first and check its shaft length: the face must be no thicker at the centre than the thread can clamp. Measure the hand holes if your movement's hands are not the usual size and enter them under Movement → Custom sizes.",
    ],
    tips: [
      "Numerals and engraved ticks or dots can be scored instead of engraved (Markers › Mark), and so can the inscription, with No Weld for each glyph's own outline.",
      "Ring layers give depth: glue the ring onto the back plate, and cut the markers through the ring so the back plate shows behind them.",
      "Cut the hands from thin material (1.5–3 mm) and keep them light; long, heavy hands stall a standard movement.",
      "Engrave the markers before cutting the outline, so the part does not move between jobs.",
      "Text on the dial looks best short and in capitals; the generator warns when it would wrap more than half way round.",
    ],
    keywords: ["clock", "wall clock", "quartz", "movement", "numerals", "hands", "dial"],
  },
};

export { CLOCK_DEFAULTS };

/** The generator with the cut-out pattern (lib/generators/pattern.ts). */
export const CLOCK: GeneratorDef<ClockParams> = withPattern(CLOCK_BASE, [
  { v: "face", text: "Face", match: byId("face") },
  { v: "back", text: "Back plate", match: byId("back") },
  { v: "ring", text: "Ring", match: byId("ring") },
  { v: "base", text: "Stand base", match: byId("base") },
], { edge: (p) => Math.max(4, ((p as { pattern?: { bar: number } }).pattern?.bar ?? 3) + 3), help: "A decorative pattern cut through the face (round the numerals and the hands' hole), the back plate, the ring or the stand's base, or engraved or scored." });
