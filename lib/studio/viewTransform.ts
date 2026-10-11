/**
 * The one screen ↔ document transform of the canvas. screen = R·F·(zoom·p) + (x, y): F flips the
 * document axes, R turns the view; the translation is in screen pixels, so panning stays a plain
 * shift. Rotation and flips only change the view — the document is never touched.
 */
import type { Box } from "./geom";
import type { Mat, Vec } from "./types";

export interface View { zoom: number; x: number; y: number; rotation?: number; flipX?: boolean; flipY?: boolean }

export const MIN_ZOOM = 0.02, MAX_ZOOM = 64;
/** Screen pixels per millimetre at 1:1 (CSS 96 dpi). */
export const PX_PER_MM = 96 / 25.4;
const RAD = Math.PI / 180;

/** Degrees in (−180, 180]. */
export const normDeg = (d: number) => { const r = ((d % 360) + 360) % 360; return r > 180 ? r - 360 : r; };

/** The view is rotated or flipped (rulers and other axis-aligned aids don't apply). */
export const isTurned = (v: View) => !!(v.flipX || v.flipY) || Math.abs(normDeg(v.rotation ?? 0)) > 1e-9;

function cosSin(deg: number): [number, number] {
  const q = normDeg(deg) / 90;
  if (Number.isInteger(q)) return ([[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][])[((q % 4) + 4) % 4];
  return [Math.cos(deg * RAD), Math.sin(deg * RAD)];
}

/** Rotation · flip, without zoom: [a, b, c, d]. */
function linear(v: View): [number, number, number, number] {
  const [c, s] = cosSin(v.rotation ?? 0);
  const fx = v.flipX ? -1 : 1, fy = v.flipY ? -1 : 1;
  return [c * fx, s * fx, -s * fy, c * fy];
}

export function viewMatrix(v: View): Mat {
  const [a, b, c, d] = linear(v), z = v.zoom;
  return [a * z, b * z, c * z, d * z, v.x, v.y];
}

export function toScreen(v: View, p: Vec): Vec {
  const [a, b, c, d] = linear(v), z = v.zoom;
  return { x: (a * p.x + c * p.y) * z + v.x, y: (b * p.x + d * p.y) * z + v.y };
}

export function toDocument(v: View, s: Vec): Vec {
  const [a, b, c, d] = linear(v), z = v.zoom;
  const det = a * d - b * c;
  const x = (s.x - v.x) / z, y = (s.y - v.y) / z;
  return { x: (d * x - c * y) / det, y: (-b * x + a * y) / det };
}

/** `v` moved so that document point `q` lands on screen point `s`. */
export function place(v: View, q: Vec, s: Vec): View {
  const o = toScreen({ ...v, x: 0, y: 0 }, q);
  return { ...v, x: s.x - o.x, y: s.y - o.y };
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zooms by `factor`, keeping the document point under screen point `s` in place. */
export function zoomAround(v: View, factor: number, s: Vec): View {
  return place({ ...v, zoom: clampZoom(v.zoom * factor) }, toDocument(v, s), s);
}

/** Sets the zoom, keeping the document point under `s` in place. */
export function zoomTo(v: View, zoom: number, s: Vec): View {
  return place({ ...v, zoom: clampZoom(zoom) }, toDocument(v, s), s);
}

/** Turns the view by `deg` (clockwise on screen) around screen point `s`. */
export function rotateView(v: View, deg: number, s: Vec): View {
  return setRotation(v, (v.rotation ?? 0) + deg, s);
}

export function setRotation(v: View, deg: number, s: Vec): View {
  return place({ ...v, rotation: normDeg(deg) }, toDocument(v, s), s);
}

/**
 * Mirrors the view left–right ("h") or top–bottom ("v") on screen, around screen point `s`.
 * A screen mirror after a turn by θ equals a turn by −θ after the mirror, so the angle flips sign.
 */
export function flipView(v: View, axis: "h" | "v", s: Vec): View {
  const next: View = { ...v, rotation: normDeg(-(v.rotation ?? 0)), ...(axis === "h" ? { flipX: !v.flipX } : { flipY: !v.flipY }) };
  return place(next, toDocument(v, s), s);
}

/** Zoom and position that show box `b` centred in a w × h stage with `pad` pixels around it, at the view's rotation. */
export function fitView(v: View, b: Box, w: number, h: number, pad: number): View {
  const [a, bb] = linear(v);
  const c = Math.abs(a), s = Math.abs(bb);
  const bw = Math.max(b.maxX - b.minX, 1), bh = Math.max(b.maxY - b.minY, 1);
  const ew = c * bw + s * bh, eh = s * bw + c * bh;
  const z = clampZoom(Math.min((w - pad * 2) / ew, (h - pad * 2) / eh));
  return place({ ...v, zoom: z }, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, { x: w / 2, y: h / 2 });
}

/** The document box that covers a w × h stage (all four corners, so it works rotated). */
export function visibleBox(v: View, w: number, h: number): Box {
  const pts = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map((p) => toDocument(v, p));
  return {
    minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** Screen-space angle (degrees) of a document direction, e.g. for chevrons and cursors. */
export function screenAngle(v: View, dx: number, dy: number): number {
  const [a, b, c, d] = linear(v);
  return Math.atan2(b * dx + d * dy, a * dx + c * dy) / RAD;
}

// ---------- zoom history (back / forward) ----------

export interface ZoomHistory { back: View[]; fwd: View[] }
export const emptyZoomHistory = (): ZoomHistory => ({ back: [], fwd: [] });
const ZOOM_HISTORY_LIMIT = 50;

const sameView = (a: View, b: View) => Math.abs(a.zoom - b.zoom) < 1e-9 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
  && normDeg(a.rotation ?? 0) === normDeg(b.rotation ?? 0) && !!a.flipX === !!b.flipX && !!a.flipY === !!b.flipY;

/** Remembers `v` (the view before a zoom) and drops the forward list, like a browser's history. */
export function recordZoom(h: ZoomHistory, v: View): ZoomHistory {
  if (h.back.length && sameView(h.back[h.back.length - 1], v)) return { back: h.back, fwd: [] };
  return { back: [...h.back, { ...v }].slice(-ZOOM_HISTORY_LIMIT), fwd: [] };
}

export function zoomBack(h: ZoomHistory, cur: View): { h: ZoomHistory; v: View } | null {
  if (!h.back.length) return null;
  const v = h.back[h.back.length - 1];
  return { h: { back: h.back.slice(0, -1), fwd: [...h.fwd, { ...cur }] }, v };
}

export function zoomForward(h: ZoomHistory, cur: View): { h: ZoomHistory; v: View } | null {
  if (!h.fwd.length) return null;
  const v = h.fwd[h.fwd.length - 1];
  return { h: { back: [...h.back, { ...cur }], fwd: h.fwd.slice(0, -1) }, v };
}
