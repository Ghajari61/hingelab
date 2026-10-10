import { circle, pathD, transform } from "../geom";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { buildClock, faceOutline, handOutline } from "./build";
import { checkClock } from "./check";
import { CLOCK_DEFAULTS, MOVEMENTS, mergeClock, type ClockParams, type MovementId } from "./params";
import { CLOCK_PRESETS } from "./presets";

const r1 = (v: number) => Math.round(v * 10) / 10;
const pointed = (p: ClockParams) => ["sunburst", "gear", "scallop"].includes(p.face.shape);
const hasNumerals = (p: ClockParams) => p.markers.style === "numerals" || p.markers.style === "mixed";
const hasTicks = (p: ClockParams) => p.markers.style === "ticks" || p.markers.style === "mixed" || p.markers.minutes;

const SHAPE_NAMES: Record<ClockParams["face"]["shape"], string> = {
  round: "Round", square: "Square", polygon: "Polygon", sunburst: "Sunburst", gear: "Gear", scallop: "Scalloped", custom: "Custom",
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
        kind: "choice", key: "face.shape", label: "Face shape", rail: true,
        help: "The outline of the clock face; Custom takes the path data of any closed outline.",
        options: [
          { v: "round", text: "Round" }, { v: "square", text: "Square" }, { v: "polygon", text: "Polygon" },
          { v: "sunburst", text: "Sunburst" }, { v: "gear", text: "Gear" }, { v: "scallop", text: "Scalloped" },
          { v: "custom", text: "Custom" },
        ],
      },
      { kind: "number", key: "face.size", label: "Size", unit: "mm", min: 80, max: 1200, step: 5, help: "Width of the face across its widest point (corners or ray tips)." },
      { kind: "number", key: "face.sides", label: "Sides", unit: "", min: 3, max: 24, step: 1, int: true, show: (p) => p.face.shape === "polygon", help: "Number of sides of the polygon face." },
      { kind: "number", key: "face.corner", label: "Corner radius", unit: "mm", min: 0, max: 120, step: 1, show: (p) => ["square", "polygon", "sunburst"].includes(p.face.shape), help: "Rounds the corners of the face; 0 keeps them sharp." },
      { kind: "number", key: "face.rays", label: "Rays", unit: "", min: 6, max: 72, step: 1, int: true, show: pointed, help: "Number of rays, teeth or scallops around the edge." },
      { kind: "number", key: "face.depth", label: "Ray depth", unit: "mm", min: 2, max: 200, step: 1, show: pointed, help: "How far the rays, teeth or scallops reach in from the outer edge." },
      { kind: "text", key: "face.path", label: "Custom outline", multiline: true, placeholder: "M 0 0 C …", show: (p) => p.face.shape === "custom", help: "SVG path data (the d attribute) of a closed outline; it is scaled to the face size." },
      {
        kind: "choice", key: "face.layers", label: "Layers", rail: true,
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
        kind: "choice", key: "markers.style", label: "Markers", rail: true,
        help: "What marks the hours: numerals, ticks, dots, or numerals at 12, 3, 6 and 9 with ticks between.",
        options: [
          { v: "numerals", text: "Numerals" }, { v: "mixed", text: "Numerals + ticks" }, { v: "ticks", text: "Ticks" },
          { v: "dots", text: "Dots" }, { v: "none", text: "None" },
        ],
      },
      {
        kind: "choice", key: "markers.numerals", label: "Numerals", show: hasNumerals,
        help: "Arabic (1–12), Roman (I–XII, with the clockmaker's IIII) or Persian (۱–۱۲) numerals.",
        options: [{ v: "roman", text: "Roman" }, { v: "arabic", text: "Arabic" }, { v: "persian", text: "Persian" }],
      },
      { kind: "toggle", key: "markers.quarters", label: "Only 12, 3, 6 and 9", show: (p) => p.markers.style === "numerals", help: "Shows four numerals and ticks for the other hours." },
      { kind: "font", key: "markers.fontId", label: "Font", show: hasNumerals, sample: (p) => (p.markers.numerals === "persian" ? "۱۲۳۴۵۶۷۸۹" : p.markers.numerals === "roman" ? "XIIV" : "123456789"), help: "The typeface of the numerals (the same fonts as Letters)." },
      { kind: "number", key: "markers.size", label: "Numeral height", unit: "mm", min: 4, max: 200, step: 1, show: hasNumerals, help: "Cap height of the numerals." },
      { kind: "number", key: "markers.inset", label: "Edge gap", unit: "mm", min: 0, max: 200, step: 1, show: (p) => p.markers.style !== "none" || p.markers.minutes, help: "Gap between the edge of the face and the outer end of the markers." },
      { kind: "number", key: "markers.tickLength", label: "Tick length", unit: "mm", min: 2, max: 100, step: 1, show: hasTicks, help: "Length of the hour ticks; minute ticks are a little under half as long." },
      { kind: "number", key: "markers.tickWidth", label: "Tick width", unit: "mm", min: 0.5, max: 30, step: 0.5, show: hasTicks, help: "Width of the hour ticks; the ticks at 12, 3, 6 and 9 are wider." },
      { kind: "number", key: "markers.dot", label: "Dot size", unit: "mm", min: 2, max: 60, step: 0.5, show: (p) => p.markers.style === "dots", help: "Diameter of the hour dots; the dots at 12, 3, 6 and 9 are larger." },
      { kind: "toggle", key: "markers.minutes", label: "Minute ticks", help: "Adds a short tick for every minute between the hours." },
      { kind: "toggle", key: "markers.cut", label: "Cut through", show: (p) => p.markers.style !== "none" || p.markers.minutes, help: "Cuts the markers out instead of engraving them, so the layer behind shows through." },
    ],
  },
  {
    id: "hands", title: "Hands",
    help: "The hour and minute hands, cut with holes that press onto the movement.",
    fields: [
      {
        kind: "choice", key: "hands.style", label: "Hands", rail: true,
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

/** Picture cards for the rail: drawn from the real geometry, scaled into 64 × 44. */
function fit(cs: Contour[], box = 38): string[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = box / Math.max(x1 - x0, y1 - y0, 1);
  return cs.map((c) => pathD(transform(c, { x: 32 - ((x0 + x1) / 2) * s, y: 22 - ((y0 + y1) / 2) * s, sx: s, sy: s }), true));
}

const HEART = "M 50 90 C 20 70 0 50 0 28 C 0 10 14 0 27 0 C 38 0 46 7 50 16 C 54 7 62 0 73 0 C 86 0 100 10 100 28 C 100 50 80 70 50 90 Z";

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "face.shape") {
    const p = mergeClock({ face: { shape: v, size: 100, sides: 6, rays: v === "gear" ? 12 : v === "scallop" ? 10 : 16, depth: v === "sunburst" ? 14 : 8, corner: v === "square" ? 14 : 6, path: v === "custom" ? HEART : "" } });
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
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "clock";

export const CLOCK: GeneratorDef<ClockParams> = {
  id: "clock",
  name: "Clock",
  version: 1,
  defaults: () => mergeClock({}),
  merge: mergeClock,
  sections,
  presets: CLOCK_PRESETS,
  build: buildClock,
  check: checkClock,
  fonts: (p) => (p.markers.style === "numerals" || p.markers.style === "mixed" ? [p.markers.fontId] : []),
  scale: scaleClock,
  art,
  fileName: (p) => {
    const s = slug(p.name);
    return `${/(^|-)clock(-|$)/.test(s) ? s : `clock-${s}`}-${Math.round(p.face.size)}mm`;
  },
  summary: (p) => `${p.face.size} mm ${SHAPE_NAMES[p.face.shape].toLowerCase()} face, ${MARKER_NAMES[p.markers.style].toLowerCase()}`,
  help: {
    intro: [
      "The Clock generator draws a wall or desk clock to fit a standard quartz movement: the face, hour markers, hands with the right holes, a hanger and an optional stand.",
      "Buy the movement first and check its shaft length: the face must be no thicker at the centre than the thread can clamp. Measure the hand holes if your movement's hands are not the usual size and enter them under Movement → Custom sizes.",
    ],
    tips: [
      "Ring layers give depth: glue the ring onto the back plate, and cut the markers through the ring so the back plate shows behind them.",
      "Cut the hands from thin material (1.5–3 mm) and keep them light; long, heavy hands stall a standard movement.",
      "Engrave the markers before cutting the outline, so the part does not move between jobs.",
      "Persian numerals need a font with Persian digits, such as Vazirmatn or Lalezar.",
    ],
    keywords: ["clock", "wall clock", "quartz", "movement", "numerals", "hands", "dial"],
  },
};

export { CLOCK_DEFAULTS };
