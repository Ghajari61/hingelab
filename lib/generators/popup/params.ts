/**
 * Pop-up settings: one flat sheet cut into rings or a spiral that lifts into a bowl, basket, tree,
 * lampshade or ornament. The sheet's outline, how it is cut, the 3D form (depth and a profile curve),
 * what holds it open (slotted arms, cords or an angled scroll-saw cut), extras and engraving.
 */
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { clamp } from "../common";
import { isMotifId, type MotifId } from "../motifs";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";

/** What the sheet becomes; each mode picks sensible defaults, every setting stays editable. */
export type PopMode = "bowl" | "tower" | "hanging" | "sleeve" | "tiered";
export type PopShape = "circle" | "ellipse" | "rounded" | "polygon" | "star" | "heart" | "flower" | "leaf" | "pumpkin" | "snowflake" | "custom";
export type PopCut = "rings" | "spiral";
/** Rings that repeat the outline, or round rings inside any outline (only the rim follows it). */
export type RingStyle = "follow" | "round";
export type EdgeStyle = "plain" | "wave" | "scallop" | "zigzag";
export type Profile = "straight" | "round" | "soft" | "bell" | "flat" | "stepped" | "custom";
/** What holds the form open: slotted arms underneath, cords with knots, or an angled scroll-saw cut. */
export type Support = "ribs" | "cords" | "saw";
export type LampHole = "none" | "e14" | "e27" | "custom";
export type Finial = "none" | "star" | "ball" | "point";

export const MODES: PopMode[] = ["bowl", "tower", "hanging", "sleeve", "tiered"];
export const SHAPES: PopShape[] = ["circle", "ellipse", "rounded", "polygon", "star", "heart", "flower", "leaf", "pumpkin", "snowflake", "custom"];
export const PROFILES: Profile[] = ["straight", "round", "soft", "bell", "flat", "stepped", "custom"];
export const EDGES: EdgeStyle[] = ["plain", "wave", "scallop", "zigzag"];

export interface PopupParams extends GenBase {
  mode: PopMode;
  shape: {
    kind: PopShape;
    /** Overall width, mm. */
    size: number;
    /** Overall height on the sheet (ellipse, rounded rectangle, heart, leaf, custom), mm. */
    height: number;
    sides: number;
    corner: number;
    points: number;
    /** Star: inner radius as a share of the outer, %. */
    inner: number;
    petals: number;
    /** Flower, pumpkin and snowflake: how deep the petals, lobes or arms cut in, %. */
    depth: number;
    path: string;
  };
  cut: {
    pattern: PopCut;
    /** Rings (or turns of the spiral) between the centre and the rim. */
    rings: number;
    /** Width of the solid centre, mm (a sleeve's centre is a hole sized from the object instead). */
    centre: number;
    style: RingStyle;
    /** Spiral arms cut side by side (1 is a single spiral). */
    starts: number;
    edge: EdgeStyle;
    /** Height of the edge waves, mm. */
    amp: number;
    /** Waves round each ring. */
    waves: number;
    /** Radial cuts split every ring into petals, one on each arm. */
    petals: boolean;
    /** Rings narrow where the form is steep, so every ring's slope is the same length. */
    even: boolean;
  };
  form: {
    /** How far the form rises (or drops) from the centre to the rim, mm. */
    depth: number;
    profile: Profile;
    /** Flat-bottom profile: the flat share of the radius, %. */
    flat: number;
    /** Stepped profile: number of levels. */
    tiers: number;
    /** Custom profile: points "across:up" in % from the centre to the rim. */
    curve: string;
    /** Turns the form over: a bowl becomes a dome, a tower a bowl. */
    invert: boolean;
  };
  support: {
    kind: Support;
    arms: number;
    /** Turns the arms (and the petals, bridges and cord holes) round the centre, degrees. */
    turn: number;
    /** Height of the lowest ring above the table, mm. */
    base: number;
    /** Length of each arm's tab, mm. */
    tab: number;
    /** Clearance in every slot, mm. */
    fit: number;
    handles: boolean;
    handleH: number;
    /** Small uncut bridges keep the rings in the sheet while cutting and for shipping flat. */
    hold: boolean;
    holdW: number;
    cords: number;
    cordHole: number;
    /** Scroll saw: blade kerf, mm. */
    blade: number;
  };
  extras: {
    lamp: LampHole;
    lampD: number;
    tealight: boolean;
    loop: boolean;
    finial: Finial;
    finialSize: number;
    /** Sleeve: the object's diameter, mm (the centre hole is this plus the clearance). */
    object: number;
    clear: number;
    /** A set of the same design in smaller sizes. */
    sizes: number;
    /** Each smaller size, % of the one before. */
    step: number;
  };
  engrave: {
    text: string;
    fontId: string;
    size: number;
    rim: string;
    rimSize: number;
    motif: "none" | MotifId;
    motifSize: number;
  };
}

/** Lamp-holder rings: the hole a shade ring clamps through, mm. */
export const LAMP_HOLES: Record<Exclude<LampHole, "none" | "custom">, number> = { e14: 29, e27: 41 };
export const TEALIGHT_HOLE = 40;
export const MAX_RINGS = 40;

export const POPUP_DEFAULTS: PopupParams = {
  name: "Pop-up bowl",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  mode: "bowl",
  shape: { kind: "circle", size: 240, height: 180, sides: 6, corner: 8, points: 5, inner: 55, petals: 8, depth: 22, path: "" },
  cut: { pattern: "rings", rings: 9, centre: 70, style: "follow", starts: 1, edge: "plain", amp: 2, waves: 12, petals: false, even: false },
  form: { depth: 60, profile: "round", flat: 35, tiers: 3, curve: "0:0, 40:15, 100:100", invert: false },
  support: { kind: "ribs", arms: 4, turn: 45, base: 8, tab: 6, fit: 0.1, handles: false, handleH: 40, hold: true, holdW: 0.6, cords: 3, cordHole: 3, blade: 0.5 },
  extras: { lamp: "none", lampD: 41, tealight: false, loop: false, finial: "none", finialSize: 50, object: 80, clear: 3, sizes: 1, step: 80 },
  engrave: { text: "", fontId: "fredoka", size: 12, rim: "", rimSize: 7, motif: "none", motifSize: 30 },
};

const ONE_OF = <T extends string>(v: string, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(v) ? (v as T) : fallback);
const int = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : d);

export function mergePopup(raw: unknown): PopupParams {
  const p = mergeInto(clone(POPUP_DEFAULTS), raw);
  const d = POPUP_DEFAULTS;
  p.mode = ONE_OF(p.mode, MODES, d.mode);
  p.shape.kind = ONE_OF(p.shape.kind, SHAPES, d.shape.kind);
  p.cut.pattern = ONE_OF(p.cut.pattern, ["rings", "spiral"], d.cut.pattern);
  p.cut.style = ONE_OF(p.cut.style, ["follow", "round"], d.cut.style);
  p.cut.edge = ONE_OF(p.cut.edge, EDGES, d.cut.edge);
  p.form.profile = ONE_OF(p.form.profile, PROFILES, d.form.profile);
  p.support.kind = ONE_OF(p.support.kind, ["ribs", "cords", "saw"], d.support.kind);
  p.extras.lamp = ONE_OF(p.extras.lamp, ["none", "e14", "e27", "custom"], d.extras.lamp);
  p.extras.finial = ONE_OF(p.extras.finial, ["none", "star", "ball", "point"], d.extras.finial);
  if (p.engrave.motif !== "none" && !isMotifId(p.engrave.motif)) p.engrave.motif = "none";
  // Counts the geometry loops over: whole numbers in range, whatever a save or request holds.
  p.cut.rings = int(p.cut.rings, 2, MAX_RINGS, d.cut.rings);
  p.cut.starts = int(p.cut.starts, 1, 4, d.cut.starts);
  p.cut.waves = int(p.cut.waves, 2, 60, d.cut.waves);
  p.shape.sides = int(p.shape.sides, 3, 12, d.shape.sides);
  p.shape.points = int(p.shape.points, 4, 12, d.shape.points);
  p.shape.petals = int(p.shape.petals, 3, 12, d.shape.petals);
  p.form.tiers = int(p.form.tiers, 2, 8, d.form.tiers);
  p.support.arms = int(p.support.arms, 3, 8, d.support.arms);
  p.support.cords = int(p.support.cords, 3, 8, d.support.cords);
  p.extras.sizes = int(p.extras.sizes, 1, 5, d.extras.sizes);
  return p;
}

/** What picking a mode sets: the form's direction, its profile and what holds it open. */
export function applyMode(p: PopupParams, mode: PopMode): PopupParams {
  const q: PopupParams = { ...p, mode, form: { ...p.form, invert: false }, support: { ...p.support }, cut: { ...p.cut }, extras: { ...p.extras } };
  switch (mode) {
    case "bowl": q.form.profile = "round"; q.support.kind = "ribs"; break;
    case "tower": q.form.profile = "straight"; q.support.kind = "ribs"; q.form.depth = Math.max(q.form.depth, Math.round(q.shape.size * 0.8)); break;
    case "hanging": q.form.profile = "bell"; q.support.kind = "cords"; q.support.handles = false; break;
    case "sleeve": q.form.profile = "straight"; q.support.kind = "ribs"; q.cut.style = "round"; q.cut.pattern = "rings"; break;
    case "tiered": q.form.profile = "stepped"; q.support.kind = "ribs"; q.form.tiers = Math.max(2, q.form.tiers); q.cut.pattern = "rings"; break;
  }
  return q;
}
