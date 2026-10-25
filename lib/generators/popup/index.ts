import { HEART_PATH, fitArt, namedFile } from "../util";
import { parsePathData } from "../geom";
import { MOTIF_IDS, MOTIF_NAMES } from "../motifs";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { buildPopup, scalePopup, type PopupOutput } from "./build";
import { checkPopup } from "./check";
import { outlineOf } from "./outline";
import { POPUP_DEFAULTS, applyMode, mergePopup, type PopMode, type PopShape, type Profile, type PopupParams } from "./params";
import { POPUP_PRESETS } from "./presets";
import { riseFn } from "./profile";

const MODE_NAMES: Record<PopMode, string> = { bowl: "Bowl", tower: "Tower", hanging: "Hanging", sleeve: "Sleeve", tiered: "Tiered stand" };
const SHAPE_NAMES: Record<PopShape, string> = {
  circle: "Circle", ellipse: "Oval", rounded: "Rounded rectangle", polygon: "Polygon", star: "Star", heart: "Heart",
  flower: "Flower", leaf: "Leaf", pumpkin: "Pumpkin", snowflake: "Snowflake", custom: "Your outline",
};
const PROFILE_NAMES: Record<Profile, string> = { straight: "Cone", round: "Dome", soft: "Soft", bell: "Bell", flat: "Flat bottom", stepped: "Stepped", custom: "Your curve" };
/** Free outlines and profiles; the rest need Pro to export. */
const FREE_SHAPES: PopShape[] = ["circle", "rounded"];
const FREE_PROFILES: Profile[] = ["straight", "round"];

const ribs = (p: PopupParams) => p.support.kind === "ribs";
const spiral = (p: PopupParams) => p.cut.pattern === "spiral";
const tall = (k: PopShape) => k === "ellipse" || k === "rounded" || k === "heart" || k === "leaf" || k === "custom";
const centreLowMode = (p: PopupParams) => (p.mode === "bowl" || p.mode === "sleeve") !== p.form.invert;

const sections: SectionSpec<PopupParams>[] = [
  {
    id: "form", title: "What it becomes", open: true,
    help: "What the flat sheet lifts into, how deep or tall it gets and the curve of its sides.",
    fields: [
      {
        kind: "choice", key: "mode", label: "Form", rail: true, shuffle: true,
        help: "A bowl drops in the middle, a tower rises to a point, a hanging shade drops from its centre, a sleeve rises round a jar and a tiered stand has flat levels.",
        options: (Object.keys(MODE_NAMES) as PopMode[]).map((v) => ({ v, text: MODE_NAMES[v] })),
        apply: (p, v) => applyMode(p, v as PopMode),
      },
      { kind: "number", key: "form.depth", label: "Depth or height", unit: "mm", min: 5, max: 600, step: 1, shuffle: [30, 160], help: "How far the rim sits below the centre (a bowl) or the centre above the rim (a tower or shade)." },
      {
        kind: "choice", key: "form.profile", label: "Side curve", rail: true, shuffle: true,
        help: "The curve the rings follow from the centre to the rim: a straight cone, a round dome, a soft or bell curve, a flat bottom, flat steps or your own curve.",
        options: (Object.keys(PROFILE_NAMES) as Profile[]).map((v) => ({ v, text: PROFILE_NAMES[v], pro: !FREE_PROFILES.includes(v) })),
      },
      { kind: "number", key: "form.flat", label: "Flat bottom", unit: "%", min: 5, max: 90, step: 1, show: (p) => p.form.profile === "flat", help: "The share of the radius that stays flat before the sides rise." },
      { kind: "number", key: "form.tiers", label: "Levels", unit: "", min: 2, max: 8, step: 1, int: true, show: (p) => p.form.profile === "stepped", help: "Flat levels from the centre to the rim." },
      { kind: "text", key: "form.curve", label: "Your curve", maxLength: 300, placeholder: "e.g. 0:0, 50:30, 100:100", show: (p) => p.form.profile === "custom", help: "Points across:up in percent from the centre to the rim, joined by a smooth curve." },
      { kind: "toggle", key: "form.invert", label: "Turn over", help: "Flips the form: a bowl becomes a dome, a shade a hanging basket." },
    ],
  },
  {
    id: "outline", title: "Outline", open: true,
    help: "The flat sheet's shape and size; the rings follow it.",
    fields: [
      { kind: "choice", key: "shape.kind", label: "Outline", rail: true, shuffle: true, help: "The shape of the flat sheet.", options: (Object.keys(SHAPE_NAMES) as PopShape[]).map((v) => ({ v, text: SHAPE_NAMES[v], pro: !FREE_SHAPES.includes(v), ...(v === "custom" ? { input: "text" as const } : {}) })) },
      { kind: "number", key: "shape.size", label: "Width", unit: "mm", min: 60, max: 1000, step: 5, help: "Width of the flat sheet." },
      { kind: "number", key: "shape.height", label: "Height", unit: "mm", min: 60, max: 1000, step: 5, show: (p) => tall(p.shape.kind), help: "Height of the flat sheet." },
      { kind: "number", key: "shape.sides", label: "Sides", unit: "", min: 3, max: 12, step: 1, int: true, show: (p) => p.shape.kind === "polygon", help: "Sides of the polygon." },
      { kind: "number", key: "shape.points", label: "Points", unit: "", min: 4, max: 12, step: 1, int: true, show: (p) => p.shape.kind === "star", help: "Points of the star." },
      { kind: "number", key: "shape.inner", label: "Star depth", unit: "%", min: 25, max: 85, step: 1, show: (p) => p.shape.kind === "star", help: "The star's inner corners as a share of its outer radius; higher is rounder." },
      { kind: "number", key: "shape.petals", label: "Petals or lobes", unit: "", min: 3, max: 12, step: 1, int: true, show: (p) => p.shape.kind === "flower" || p.shape.kind === "pumpkin", help: "Petals of the flower or lobes of the pumpkin." },
      { kind: "number", key: "shape.depth", label: "Lobe depth", unit: "%", min: 2, max: 60, step: 1, show: (p) => p.shape.kind === "flower" || p.shape.kind === "pumpkin" || p.shape.kind === "snowflake", help: "How far the petals, lobes or arms cut in." },
      { kind: "number", key: "shape.corner", label: "Corner radius", unit: "mm", min: 0, max: 100, step: 1, show: (p) => p.shape.kind === "rounded" || p.shape.kind === "polygon" || p.shape.kind === "star", help: "Rounds the outline's corners." },
      { kind: "text", key: "shape.path", label: "Outline path", multiline: true, maxLength: 20000, placeholder: "SVG path data, e.g. M 0 0 L 100 0 L 50 90 Z", show: (p) => p.shape.kind === "custom", help: "SVG path data of one closed shape; it is scaled to the width and height." },
    ],
  },
  {
    id: "cut", title: "Rings", open: true,
    help: "How the sheet is cut: rings or a spiral, how many, and their edges.",
    fields: [
      { kind: "choice", key: "cut.pattern", label: "Cut", shuffle: true, help: "Separate rings, or one continuous spiral that lifts into a smooth form.", options: [{ v: "rings", text: "Rings" }, { v: "spiral", text: "Spiral", pro: true }] },
      { kind: "number", key: "cut.rings", label: "Rings", unit: "", min: 2, max: 40, step: 1, int: true, shuffle: [5, 12], help: "Rings between the centre and the rim (turns of a spiral); fewer rings are wider and stronger." },
      { kind: "number", key: "cut.starts", label: "Spiral arms", unit: "", min: 1, max: 4, step: 1, int: true, show: spiral, help: "Spirals cut side by side, for a twisting look." },
      { kind: "number", key: "cut.centre", label: "Centre", unit: "mm", min: 10, max: 400, step: 1, show: (p) => p.mode !== "sleeve", help: "Width of the solid centre the rings start from." },
      { kind: "choice", key: "cut.style", label: "Ring shape", help: "Rings that repeat the outline, or round rings inside any outline (only the rim follows it).", options: [{ v: "follow", text: "Follow the outline" }, { v: "round", text: "Round" }] },
      { kind: "choice", key: "cut.edge", label: "Ring edges", shuffle: true, help: "Plain cuts, or waves, scallops or zigzags along every ring.", options: [{ v: "plain", text: "Plain" }, { v: "wave", text: "Waves", pro: true }, { v: "scallop", text: "Scallops", pro: true }, { v: "zigzag", text: "Zigzag", pro: true }] },
      { kind: "number", key: "cut.amp", label: "Edge height", unit: "mm", min: 0.3, max: 10, step: 0.1, show: (p) => p.cut.edge !== "plain", help: "How far the edge pattern moves in and out." },
      { kind: "number", key: "cut.waves", label: "Edge repeats", unit: "", min: 2, max: 60, step: 1, int: true, show: (p) => p.cut.edge !== "plain", help: "How many times the edge pattern goes round." },
      { kind: "toggle", key: "cut.petals", label: "Split into petals", show: ribs, help: "Radial cuts split every ring into petals, one on each arm, for an open flower look." },
      { kind: "toggle", key: "cut.even", label: "Even slopes", help: "Narrows the rings where the form is steep, so each ring's slope is about as long." },
    ],
  },
  {
    id: "support", title: "What holds it open", open: true,
    help: "Slotted arms under the rings, cords for a hanging shade, or an angled scroll-saw cut.",
    fields: [
      {
        kind: "choice", key: "support.kind", label: "Held by",
        help: "Slotted arms stand under the rings with a step for each ring; cords with knots hold a hanging form; an angled scroll-saw cut lets each ring wedge on the next (thick boards only).",
        options: [{ v: "ribs", text: "Slotted arms" }, { v: "cords", text: "Cords", pro: true }, { v: "saw", text: "Scroll saw", pro: true, title: "Angled cut, no laser" }],
        apply: (p, v) => ({ ...p, support: { ...p.support, kind: v as PopupParams["support"]["kind"], hold: v === "saw" ? false : p.support.hold } }),
      },
      { kind: "number", key: "support.arms", label: "Arms", unit: "", min: 3, max: 8, step: 1, int: true, show: ribs, help: "Arms under the form, evenly round the centre." },
      { kind: "number", key: "support.turn", label: "Turn", unit: "deg", min: 0, max: 360, step: 1, help: "Turns the arms, petals, bridges and cord holes round the centre." },
      { kind: "number", key: "support.base", label: "Lift", unit: "mm", min: 0, max: 100, step: 1, show: ribs, help: "Height of the lowest ring above the table." },
      { kind: "number", key: "support.tab", label: "Tab length", unit: "mm", min: 2, max: 30, step: 0.5, show: ribs, help: "Length of the tab on each step that goes up through its ring's slot." },
      { kind: "number", key: "support.fit", label: "Slot clearance", unit: "mm", min: 0, max: 1, step: 0.05, show: ribs, help: "Extra room in every slot; raise it if tabs are too tight to push in." },
      { kind: "toggle", key: "support.handles", label: "Handles", show: (p) => ribs(p) && centreLowMode(p), help: "Two opposite arms rise above the rim as handles with finger holes." },
      { kind: "number", key: "support.handleH", label: "Handle height", unit: "mm", min: 20, max: 200, step: 1, show: (p) => ribs(p) && p.support.handles, help: "How far the handles stand above the rim." },
      { kind: "number", key: "support.cords", label: "Cords", unit: "", min: 3, max: 8, step: 1, int: true, show: (p) => p.support.kind === "cords", help: "Cords from the centre to the rim, each through a line of holes." },
      { kind: "number", key: "support.cordHole", label: "Cord hole", unit: "mm", min: 1, max: 10, step: 0.5, show: (p) => p.support.kind === "cords", help: "Diameter of the cord holes." },
      { kind: "number", key: "support.blade", label: "Saw kerf", unit: "mm", min: 0.1, max: 2, step: 0.05, show: (p) => p.support.kind === "saw", help: "Width of the scroll-saw blade's cut; it sets the table tilt." },
      { kind: "toggle", key: "support.hold", label: "Bridges", show: (p) => p.support.kind !== "saw", help: "Small uncut bridges keep the rings in the sheet while cutting and posting; snap them before lifting." },
      { kind: "number", key: "support.holdW", label: "Bridge width", unit: "mm", min: 0.1, max: 3, step: 0.05, show: (p) => p.support.kind !== "saw" && p.support.hold, help: "Width of each bridge." },
    ],
  },
  {
    id: "extras", title: "Extras", open: false,
    help: "A lamp ring or tealight hole, a hanging hole, a finial, a sleeve's object and a set of sizes.",
    fields: [
      { kind: "choice", key: "extras.lamp", label: "Lamp holder", help: "A hole in the centre for a lamp holder's ring: E14, E27 or your own size.", options: [{ v: "none", text: "None" }, { v: "e14", text: "E14 (29 mm)" }, { v: "e27", text: "E27 (41 mm)" }, { v: "custom", text: "Custom" }] },
      { kind: "number", key: "extras.lampD", label: "Lamp hole", unit: "mm", min: 10, max: 120, step: 0.5, show: (p) => p.extras.lamp === "custom", help: "Diameter of the lamp holder's hole." },
      { kind: "toggle", key: "extras.tealight", label: "Tealight hole", show: (p) => p.extras.lamp === "none", help: "A 40 mm hole in the centre for a tealight (an LED tealight in wood)." },
      { kind: "toggle", key: "extras.loop", label: "Hanging hole", show: (p) => p.extras.lamp === "none" && !p.extras.tealight, help: "A small hole in the centre to hang it by." },
      { kind: "choice", key: "extras.finial", label: "Top", show: (p) => !centreLowMode(p) && p.mode !== "sleeve", help: "A star, ball or point that slots into the top of a tower.", options: [{ v: "none", text: "None" }, { v: "star", text: "Star" }, { v: "ball", text: "Ball" }, { v: "point", text: "Point" }] },
      { kind: "number", key: "extras.finialSize", label: "Top size", unit: "mm", min: 20, max: 200, step: 1, show: (p) => p.extras.finial !== "none" && !centreLowMode(p), help: "Height of the top." },
      { kind: "number", key: "extras.object", label: "Object diameter", unit: "mm", min: 10, max: 400, step: 1, show: (p) => p.mode === "sleeve", help: "Diameter of the jar, vase or pot the sleeve goes round." },
      { kind: "number", key: "extras.clear", label: "Clearance", unit: "mm", min: 0, max: 20, step: 0.5, show: (p) => p.mode === "sleeve", help: "Extra room round the object." },
      { kind: "number", key: "extras.sizes", label: "Sizes in the set", unit: "", min: 1, max: 5, step: 1, int: true, help: "Adds smaller copies of the design, for a nesting set." },
      { kind: "number", key: "extras.step", label: "Each smaller size", unit: "%", min: 40, max: 95, step: 1, show: (p) => p.extras.sizes > 1, help: "Each size as a share of the one before." },
    ],
  },
  {
    id: "engrave", title: "Engraving", open: false,
    help: "Text and a motif engraved on the centre, and a line of text round the rim.",
    fields: [
      { kind: "text", key: "engrave.text", label: "Centre text", multiline: true, maxLength: 60, placeholder: "e.g. a name or initial", help: "Engraved on the centre; press Enter for a new line." },
      { kind: "font", key: "engrave.fontId", label: "Font", shuffle: true, sample: (p) => `${p.engrave.text}${p.engrave.rim}` || "Aa", help: "The typeface of both texts." },
      { kind: "number", key: "engrave.size", label: "Centre letter height", unit: "mm", min: 3, max: 120, step: 0.5, help: "Cap height of the centre text." },
      { kind: "text", key: "engrave.rim", label: "Rim text", maxLength: 80, placeholder: "e.g. Happy Holidays", help: "Engraved along the bottom of the rim, reading left to right." },
      { kind: "number", key: "engrave.rimSize", label: "Rim letter height", unit: "mm", min: 2, max: 60, step: 0.5, help: "Cap height of the rim text." },
      { kind: "choice", key: "engrave.motif", label: "Motif", shuffle: true, help: "A picture engraved on the centre, above any text.", options: [{ v: "none", text: "None" }, ...MOTIF_IDS.map((v) => ({ v, text: MOTIF_NAMES[v] }))] },
      { kind: "number", key: "engrave.motifSize", label: "Motif size", unit: "mm", min: 8, max: 300, step: 1, show: (p) => p.engrave.motif !== "none", help: "The motif's larger side." },
    ],
  },
];

/** Line art for the form cards: the side view of each form. */
const MODE_ART: Record<PopMode, { cs: Contour[]; open: boolean[] }> = {
  bowl: { cs: [[[0, 0], [8, 14], [20, 22], [40, 22], [52, 14], [60, 0]], [[0, 0], [60, 0]]], open: [true, true] },
  tower: { cs: [[[0, 40], [30, 0], [60, 40]], [[0, 40], [60, 40]], [[26, 0], [30, -6], [34, 0]]], open: [true, true, true] },
  hanging: { cs: [[[30, -14], [30, 0]], [[10, 34], [18, 10], [30, 0], [42, 10], [50, 34]], [[10, 34], [50, 34]]], open: [true, true, true] },
  sleeve: { cs: [[[8, 0], [16, 34], [44, 34], [52, 0]], [[22, -6], [22, 34]], [[38, -6], [38, 34]]], open: [true, true, true] },
  tiered: { cs: [[[0, 40], [0, 30], [12, 30], [12, 18], [24, 18], [24, 6], [36, 6], [36, 18], [48, 18], [48, 30], [60, 30], [60, 40], [0, 40]]], open: [false] },
};

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "shape.kind") {
    if (v === "custom") {
      const heart = parsePathData(HEART_PATH).contours[0];
      return fitArt([heart], 34).map((d) => ({ d, fill: true }));
    }
    const c = outlineOf(mergePopup({ shape: { kind: v as PopShape, size: 100, height: 70 } }));
    return c ? [{ d: fitArt([c], 36)[0], fill: true }] : [];
  }
  if (key === "mode") {
    const a = MODE_ART[v as PopMode];
    if (!a) return [];
    return fitArt(a.cs, 36, a.open).map((d, i) => ({ d, fill: !a.open[i] }));
  }
  if (key === "form.profile") {
    const f = riseFn({ ...POPUP_DEFAULTS.form, profile: v as Profile, tiers: 3 });
    const pts: Contour = Array.from({ length: 41 }, (_, i) => [i, 24 - 24 * f(i / 40)]);
    const mirror: Contour = pts.map(([x, y]): [number, number] => [-x, y]).reverse();
    return fitArt([[...mirror, ...pts], [[-40, 26], [40, 26]]], 40, [true, true]).map((d) => ({ d }));
  }
  return [];
}

const SUPPORT_NAMES = { ribs: "arms", cords: "cords", saw: "scroll saw" } as const;

export const POPUP: GeneratorDef<PopupParams> = {
  id: "popup",
  name: "Pop-up",
  version: 1,
  defaults: () => mergePopup({}),
  merge: mergePopup,
  sections,
  presets: POPUP_PRESETS,
  build: buildPopup,
  check: (p, out) => checkPopup(p, out as PopupOutput),
  pro: (p) => {
    const why: string[] = [];
    if (!FREE_SHAPES.includes(p.shape.kind)) why.push(`the ${SHAPE_NAMES[p.shape.kind].toLowerCase()} outline`);
    if (p.cut.pattern === "spiral") why.push("a spiral cut");
    if (p.cut.edge !== "plain") why.push("patterned ring edges");
    if (p.cut.petals) why.push("petals");
    if (!FREE_PROFILES.includes(p.form.profile)) why.push(`the ${PROFILE_NAMES[p.form.profile].toLowerCase()} curve`);
    if (p.support.kind !== "ribs") why.push(p.support.kind === "cords" ? "cords" : "the scroll-saw cut");
    if (p.engrave.text.trim() || p.engrave.rim.trim() || p.engrave.motif !== "none") why.push("engraving");
    if (p.extras.sizes > 1) why.push("a set of sizes");
    return why.length ? `Pop-up designs with ${why.join(", ")} need Pro.` : null;
  },
  fonts: (p) => (p.engrave.text.trim() || p.engrave.rim.trim() ? [p.engrave.fontId] : []),
  scale: (p, s) => scalePopup(p, s),
  art,
  // Rail cards: five plain rings show the form at a glance and keep the pictures small.
  railPreview: (_key, p) => ({ ...p, cut: { ...p.cut, rings: 5, edge: "plain", pattern: "rings", petals: false }, support: { ...p.support, hold: false }, engrave: { ...p.engrave, text: "", rim: "", motif: "none" } }),
  batch: () => "engrave.text",
  fileName: (p) => namedFile("pop-up", p.name, `${Math.round(p.shape.size)}mm`),
  summary: (p) => `${MODE_NAMES[p.mode]} · ${SHAPE_NAMES[p.shape.kind]} ${p.shape.size} mm · ${p.cut.pattern === "spiral" ? "spiral" : `${p.cut.rings} rings`} · ${SUPPORT_NAMES[p.support.kind]}`,
  help: {
    intro: [
      "The Pop-up generator turns one flat sheet into a 3D form: a bowl, a basket, a Christmas tree, a lampshade, an ornament, a sleeve round a jar or a tiered stand. The sheet is cut into rings or a spiral that stay in place with tiny bridges, so it cuts, stores and posts flat.",
      "Pick the form and the curve of its sides, the outline (circle, oval, polygon, star, heart, flower, leaf, pumpkin, snowflake or your own) and how many rings. Slotted arms stand underneath with a step for every ring and a tab that goes up through it, so the form sets exactly to the curve; hanging shades are held by knotted cords instead, and thick boards can be cut with an angled scroll-saw cut that wedges every ring on the next.",
    ],
    tips: [
      "Keep every ring at least one and a half times as wide as the material is thick; fewer, wider rings are stronger.",
      "Test the slot fit on a scrap first: the tabs should push in by hand and stay put.",
      "Snap the bridges with a craft knife from the back so their stubs stay out of sight.",
      "In a lampshade use an LED bulb of 7 W or less and keep it clear of the rings.",
      "Use the Open slider in 3D to see the form between flat and fully open.",
    ],
    keywords: ["pop-up", "collapsible basket", "spiral bowl", "trivet bowl", "pop-up christmas tree", "spiral lampshade", "spiral ornament", "laser cut basket svg", "flat pack bowl", "collapsible bowl"],
  },
};

export { POPUP_DEFAULTS };
