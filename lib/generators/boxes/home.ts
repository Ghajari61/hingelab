/**
 * Home pieces on the box engine: the napkin holder (two plates tabbed into a base, like the desk
 * sign) and the tissue box cover (a finger-jointed box turned upside down: the bottom becomes a top
 * with an opening, and the open side drops over the tissue box).
 *
 * Plan coordinates as in build.ts: x to the right, y from the back (0) to the front, z up.
 */
import { makeShape, offsetShapes, unionShapes } from "@/lib/letters/polygon";
import { circle, ellipse, rect, roundedRect, stadium } from "../geom";
import type { BuildContext, Contour, GenPart, Pt } from "../types";
import { boxPanels, fingerCount } from "./joints";
import { engraveOn, flat, hasArt, lidArt, markLid, r1, wall, type V2Output } from "./more";
import type { BoxesParams, NapkinShape } from "./params";

const biggest = <S extends { area: number }>(s: S[]) => s.reduce((a, b) => (b.area > a.area ? b : a), s[0]);
/** A contour flipped top to bottom in a frame of height h (winding kept). */
const flipV = (c: Contour, h: number): Contour => c.map(([x, y]) => [x, h - y] as Pt).reverse();

/** Tabs under a plate W wide: centres and width (the desk sign's spacing). */
export const napkinTabs = (W: number) => ({ w: Math.min(40, Math.max(15, W * 0.15)), us: [W * 0.25, W * 0.75] });

/**
 * How far the plate's top edge drops below its highest point at x (0..W), for a plate H tall.
 * Arch: the sides are lower and the middle highest; grip dip: a round dip in the middle to reach in;
 * wave: two soft waves; rounded: level.
 */
export function napkinDrop(shape: NapkinShape, W: number, H: number): (x: number) => number {
  switch (shape) {
    case "arch": { const d = Math.min(H * 0.35, W * 0.3); return (x) => d * (1 - Math.sqrt(Math.max(0, 1 - (2 * x / W - 1) ** 2))); }
    case "dip": { const d = Math.min(H * 0.4, 45), r = W * 0.24; return (x) => d * Math.sqrt(Math.max(0, 1 - ((x - W / 2) / r) ** 2)); }
    case "wave": { const d = Math.min(H * 0.2, 18); return (x) => (d * (1 - Math.cos((4 * Math.PI * x) / W))) / 2; }
    default: return () => 0;
  }
}

/** The plate's outline (v down from its top), corners rounded by r, without tabs. */
function plateBody(shape: NapkinShape, W: number, H: number, r: number): Contour {
  const drop = napkinDrop(shape, W, H), n = Math.max(24, Math.ceil(W / 2));
  const top: Pt[] = Array.from({ length: n + 1 }, (_, i) => { const x = (W * i) / n; return [x, drop(x)] as Pt; });
  const pts: Pt[] = [...top, [W, H], [0, H]];
  if (r <= 0.2) return pts;
  // Round the convex corners only: shrink, then grow back by the radius.
  const s = offsetShapes(offsetShapes([makeShape(pts, [])], -r), r);
  return s.length ? biggest(s).outer : pts;
}

/** The napkin holder: two plates standing in a base, the napkins held upright between them. */
export function buildNapkin(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, n = p.napkin;
  const W = n.width, H = n.height, gap = n.gap, m = n.margin;
  const r = Math.min(n.corner, W / 4, H / 4);
  const tabs = napkinTabs(W);
  const body = plateBody(n.shape, W, H, r);
  const plate = biggest(unionShapes([body, ...tabs.us.map((u) => rect(u - tabs.w / 2, H - 1, tabs.w, T + 1))], [], false, true)).outer;
  const Db = gap + 2 * T + 2 * m, Wb = W + 2 * m;
  const yb = m, yf = m + T + gap;
  const slots = (y: number) => tabs.us.map((u) => rect(m + u - tabs.w / 2, y, tabs.w, T));
  const parts: GenPart[] = [
    { id: "back", name: "Back plate", outer: plate, holes: [], place: wall(0, T + H, yb) },
    { id: "front", name: "Front plate", outer: plate, holes: [], place: wall(0, T + H, yf) },
    { id: "base", name: "Base", outer: roundedRect(0, 0, Wb, Db, Math.min(8, Db / 4, m)), holes: [...slots(yb), ...slots(yf)], place: flat(-m, 0, 0) },
  ];
  // The art sits on the front plate below the lowest point of its top edge.
  const drop = napkinDrop(n.shape, W, H);
  let low = 0;
  for (let i = 0; i <= 40; i++) low = Math.max(low, drop((W * i) / 40));
  let sizes = {}, loading = false, missing: string[] = [];
  if (hasArt(p)) {
    const art = lidArt(p, ctx);
    const room = H - low;
    markLid(parts[1], p, engraveOn(p, art, body, W / 2, low + room / 2));
    loading = art.loading; missing = art.missing;
    sizes = { textWidth: art.w, textRoom: W - 2 * Math.max(10, r), artHeight: art.h, artRoom: room - 2 * Math.max(6, p.engrave.border + 3) };
  }
  return {
    parts,
    stats: [
      { label: "Plates", value: `${r1(W)} × ${r1(H)} mm` },
      { label: "Napkin room", value: `${r1(gap)} mm between the plates` },
      { label: "Base", value: `${r1(Wb)} × ${r1(Db)} mm` },
    ],
    assembly: [
      "Engrave the front plate, then cut. Push each plate's two tabs into the base slots, art facing out, and glue them.",
      `Folded paper napkins up to ${Math.floor(W - 6)} mm wide stand between the plates; a stack ${r1(gap)} mm thick holds about ${Math.round(gap * 4)} napkins.`,
    ],
    notice: loading ? "Loading the font." : undefined,
    missing,
    info: { size: [Wb, Db, H + T], ...sizes, napkinBase: Db },
  };
}

/** The opening in the top of a tissue box cover, centred on (cx, cy). */
export function tissueOpening(p: BoxesParams, cx: number, cy: number): Contour {
  const t = p.tissue, L = t.openL, w = Math.min(t.openW, L);
  switch (t.opening) {
    case "round": return circle(cx, cy, L / 2);
    case "oval": return ellipse(cx, cy, L / 2, w / 2, 96);
    default: return stadium(cx - (L - w) / 2, cy, cx + (L - w) / 2, cy, w);
  }
}

/** Wood kept round the tissue opening, past the fingers of the top, mm. */
export const TISSUE_RIM = 8;

/** A tissue box cover: an open box upside down, its bottom now the top with the opening. */
export function buildTissue(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, f = p.joint.finger, t = p.tissue;
  const W = p.joint.outside ? t.width : t.width + 2 * T, D = p.joint.outside ? t.depth : t.depth + 2 * T;
  const H = p.joint.outside ? t.height : t.height + T;
  const k = boxPanels(W, D, H, T, f, false);
  const face = flipV(k.face, H), side = flipV(k.side, H);
  const top: GenPart = { id: "top", name: "Top", outer: k.bottom, holes: [tissueOpening(p, W / 2, D / 2)], place: flat(0, 0, H - T) };
  const parts: GenPart[] = [
    { id: "front", name: "Front", outer: face, holes: [], place: wall(0, H, D - T) },
    { id: "back", name: "Back", outer: face, holes: [], place: wall(0, H, 0) },
    { id: "left", name: "Left side", outer: side, holes: [], place: wall(T, H, 0, 90) },
    { id: "right", name: "Right side", outer: side, holes: [], place: wall(W, H, 0, 90) },
    top,
  ];
  let sizes = {}, loading = false, missing: string[] = [];
  if (hasArt(p)) {
    const art = lidArt(p, ctx);
    markLid(parts[0], p, engraveOn(p, art, face, W / 2, H / 2));
    loading = art.loading; missing = art.missing;
    sizes = { textWidth: art.w, textRoom: W - 4 * T, artHeight: art.h, artRoom: H - 4 * T };
  }
  const round = t.opening === "round";
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W)} × ${r1(D)} × ${r1(H)} mm` },
      { label: "Fits a tissue box up to", value: `${r1(W - 2 * T)} × ${r1(D - 2 * T)} × ${r1(H - T)} mm` },
      { label: "Opening", value: round ? `${r1(t.openL)} mm round` : `${r1(t.openL)} × ${r1(Math.min(t.openW, t.openL))} mm` },
      { label: "Fingers", value: `${fingerCount(W - 2 * T, f)} × ${fingerCount(D - 2 * T, f)} × ${fingerCount(H - 2 * T, f)}` },
    ],
    assembly: [
      "Glue the four walls round the top, its opening up; every finger has one mate. The cover stays open underneath.",
      "Pull the first tissue through the opening and drop the cover over the tissue box.",
    ],
    notice: loading ? "Loading the font." : undefined,
    missing,
    info: {
      size: [W, D, H], minEdge: Math.min(W, D, H) - 2 * T, ...sizes,
      openRoomL: (round ? Math.min(W, D) : W) - 2 * T - 2 * TISSUE_RIM, openRoomW: D - 2 * T - 2 * TISSUE_RIM,
    },
  };
}
