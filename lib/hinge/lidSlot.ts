import type { Edge, Params, Point } from "./types";

/** A long slot in the lid: pulls tissues out (tissue) or takes coins (coin). */
export const isLidSlot = (h: string | undefined): h is "tissue" | "coin" => h === "tissue" || h === "coin";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The box's long and short outside sizes, mm. */
function sides(p: Params): [number, number] {
  if (p.shape === "cyl") return [p.dia, p.dia];
  if (p.shape === "poly") return [p.W, p.W];
  return [Math.max(p.W, p.D), Math.min(p.W, p.D)];
}

/** Slot length and width: the user's, or sized to the box (a tissue slot about half the lid long). */
export function lidSlotSize(p: Params): { len: number; w: number } {
  const [long, short] = sides(p);
  if (p.lidHole === "coin") return { len: p.lidHoleD ?? 32, w: p.lidHoleW ?? 4 };
  return { len: p.lidHoleD ?? Math.round(clamp(long * 0.55, 50, 160)), w: p.lidHoleW ?? Math.round(clamp(short * 0.26, 16, 40)) };
}

/** An open top's rim, mm from the lid's edge: room for the tab slots and a band to hold. */
export const defaultRimWidth = (t: number) => Math.max(8, Math.round(3 * t + 4));

/** The slot runs along the box's longer side. */
export const slotAlongY = (p: Params) => (p.shape === "rect" || p.shape === "pill") && p.D > p.W;

/**
 * The slot's cut, centred: straight sides with round ends, shrunk by the kerf (kx across vertical
 * edges, ky across horizontal ones) so the hole comes out at its size.
 */
export function slotOutline(len: number, w: number, alongY: boolean, kx: number, ky: number): Point[] {
  const [ka, kb] = alongY ? [ky, kx] : [kx, ky];
  const hx = (len - ka) / 2, hy = (w - kb) / 2, rx = Math.min(hx, (w - ka) / 2), s = hx - rx;
  const out: Point[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; out.push([s + rx * Math.cos(a), hy * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI * i) / n; out.push([-s + rx * Math.cos(a), hy * Math.sin(a)]); }
  return alongY ? out.map(([x, y]) => [y, x] as Point) : out;
}

/** Distance from q to the convex core polygon (0 inside it). */
export function coreDistance(edges: Edge[], q: Point): number {
  if (edges.every((e) => (q[0] - e.c[0]) * e.n[0] + (q[1] - e.c[1]) * e.n[1] <= 1e-9)) return 0;
  let best = Infinity;
  for (const e of edges) {
    const dx = e.p1[0] - e.p0[0], dy = e.p1[1] - e.p0[1], L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? clamp(((q[0] - e.p0[0]) * dx + (q[1] - e.p0[1]) * dy) / L2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(q[0] - e.p0[0] - u * dx, q[1] - e.p0[1] - u * dy));
  }
  return best;
}
