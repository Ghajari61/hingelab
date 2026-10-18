/**
 * Inside dividers: flat strips standing on the base, cut to the inside of the wall wherever they
 * stand. Strips across the width (`divX`) run front to back, strips across the depth (`divY`) run
 * left to right, and where two cross they lock with half-lap slots: front-to-back strips are
 * slotted from the top, left-to-right ones from the bottom. Tabs on the bottom edge go into slots
 * in the base, so the grid stays put; over a support ring the strip's ends step up onto it.
 */
import type { DividerPlace, Edge, Issue, Params, Point, WallPart } from "./types";
import { bboxOf, offsetRect, offsetRectXY, simplify } from "./polygon";
import { kerfY } from "./hinge";
import { kerfAcross } from "@/lib/materials/axes";
import { coreDistance } from "./lidSlot";
import { r3 } from "./util";

export const MAX_DIVIDERS = 8;
/** Smallest compartment, mm: a narrower one is not worth a strip. */
const MIN_CELL = 12;

export const dividerCount = (n: number | undefined) => Math.max(0, Math.min(MAX_DIVIDERS, Math.round(n ?? 0)));
export const hasDividers = (p: Params) => dividerCount(p.divX) + dividerCount(p.divY) > 0;

/** The tallest a divider can stand: under a lid lip, or just under a fixed lid. */
export function dividerMaxH(p: Params, hBody: number): number {
  if (p.lid === "removable" && p.lidLip !== false) return hBody - p.T - 1;
  return p.lid === "open" ? hBody : hBody - 0.5;
}

/** Where the line through `at` along `axis` leaves the region within r of the core: [from, to]. */
function chord(edges: Edge[], r: number, axis: "x" | "y", at: number): [number, number] | null {
  const pt = (s: number): Point => (axis === "x" ? [at, s] : [s, at]);
  if (coreDistance(edges, pt(0)) > r) return null;
  const reach = (dir: 1 | -1) => {
    let lo = 0, hi = 1;
    while (coreDistance(edges, pt(dir * hi)) <= r && hi < 1e5) { lo = hi; hi *= 2; }
    for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (coreDistance(edges, pt(dir * m)) <= r) lo = m; else hi = m; }
    return dir * lo;
  };
  return [reach(-1), reach(1)];
}

/** Centres of n strips of thickness t that split [a, b] into equal compartments. */
function centres(a: number, b: number, n: number, t: number): number[] {
  const cell = (b - a - n * t) / (n + 1);
  return Array.from({ length: n }, (_, i) => a + (i + 1) * cell + i * t + t / 2);
}

export interface DividerBuild { parts: WallPart[]; places: DividerPlace[]; baseSlots: Point[][]; issues: Issue[] }

/**
 * The divider strips, where they stand, and the slots their tabs need in the base.
 * `ri` is the wall's inside radius; `ringIn` the support ring's inner radius when there is a ring.
 */
export function buildDividers(p: Params, edges: Edge[], ri: number, hBody: number, ringIn: number | null): DividerBuild {
  const out: DividerBuild = { parts: [], places: [], baseSlots: [], issues: [] };
  const nx = dividerCount(p.divX), ny = dividerCount(p.divY);
  if (!nx && !ny) return out;
  const t = p.T, k = p.K, ky = kerfY(p), clr = Math.max(0.2, p.slotClr), gap = t + Math.max(0, p.slotClr);
  const maxH = dividerMaxH(p, hBody);
  const h = Math.min(maxH, p.divH && p.divH > 0 ? p.divH : maxH);
  if (h < 10) { out.issues.push({ lvl: "warn", msg: "The box is too short inside for dividers, so they were left out. Make it taller." }); return out; }
  if (p.divH && p.divH > maxH + 1e-6) out.issues.push({ lvl: "info", msg: `Dividers are ${r3(maxH)} mm tall at most here, so they stand under the lid.` });

  const across = chord(edges, ri, "y", 0), down = chord(edges, ri, "x", 0);
  if (!across || !down) return out;
  const fit = (n: number, [a, b]: [number, number]) => {
    let m = n;
    while (m > 0 && (b - a - m * t) / (m + 1) < MIN_CELL) m--;
    return m;
  };
  const mx = fit(nx, across), my = fit(ny, down);
  if (mx < nx || my < ny) out.issues.push({ lvl: "warn", msg: `Only ${mx + my} divider${mx + my === 1 ? "" : "s"} fit with compartments at least ${MIN_CELL} mm wide, so the rest were left out.` });
  const xs = centres(across[0], across[1], mx, t), ys = centres(down[0], down[1], my, t);

  const strips: { axis: "x" | "y"; at: number; cross: number[]; name: string }[] = [
    ...xs.map((at, i) => ({ axis: "x" as const, at, cross: ys, name: `DIVIDER ${String.fromCharCode(65 + i)}` })),
    ...ys.map((at, i) => ({ axis: "y" as const, at, cross: xs, name: `DIVIDER ${i + 1}` })),
  ];
  for (const s of strips) {
    const c = chord(edges, ri, s.axis, s.at);
    if (!c) continue;
    const from = c[0] + clr, to = c[1] - clr, L = to - from;
    if (L < MIN_CELL) continue;
    // Crossings and the support ring, measured along the strip from its start.
    const cuts = s.cross.map((q) => q - from).filter((u) => u > gap && u < L - gap);
    const ring = ringIn != null ? chord(edges, ringIn, s.axis, s.at) : null;
    const [ra, rb] = ring ? [Math.max(0, ring[0] - from), Math.min(L, ring[1] - from)] : [0, L];
    const raised = ring != null && rb - ra > 0;
    const bottomAt = (u: number) => (raised && (u < ra || u > rb) ? h - t : h);
    // Tabs: one in the middle of each stretch between crossings that has room, on the base (not the ring).
    const stops = [ra, ...cuts.flatMap((u) => [u - gap / 2, u + gap / 2]), rb].sort((a, b) => a - b);
    const tabs: number[] = [];
    for (let i = 0; i + 1 < stops.length; i += 2) {
      const a = stops[i], b = stops[i + 1];
      if (b - a >= p.tabW + 4) tabs.push((a + b) / 2);
    }
    if (!tabs.length) out.issues.push({ lvl: "info", msg: `${s.name} is too short for a tab, so glue it in place.` });

    const top = s.axis === "x" ? cuts : [], bottom = s.axis === "y" ? cuts : [];
    const pts: Point[] = [[0, 0]];
    for (const u of top) pts.push([u - gap / 2, 0], [u - gap / 2, h / 2], [u + gap / 2, h / 2], [u + gap / 2, 0]);
    pts.push([L, 0], [L, bottomAt(L)]);
    type Ev = { u: number; kind: "tab" | "notch" | "ringIn" | "ringOut" };
    const ev: Ev[] = [
      ...tabs.map((u) => ({ u, kind: "tab" as const })),
      ...bottom.map((u) => ({ u, kind: "notch" as const })),
      ...(raised ? [{ u: rb, kind: "ringOut" as const }, { u: ra, kind: "ringIn" as const }] : []),
    ].sort((a, b) => b.u - a.u);
    for (const e of ev) {
      const a = p.tabW / 2, y = bottomAt(e.u);
      if (e.kind === "tab") pts.push([e.u + a, h], [e.u + a, h + t], [e.u - a, h + t], [e.u - a, h]);
      else if (e.kind === "notch") pts.push([e.u + gap / 2, y], [e.u + gap / 2, h / 2], [e.u - gap / 2, h / 2], [e.u - gap / 2, y]);
      else if (e.kind === "ringOut") pts.push([e.u, h - t], [e.u, h]);
      else pts.push([e.u, h], [e.u, h - t]);
    }
    pts.push([0, bottomAt(0)]);
    const clean = simplify(pts);
    const outline = ky === k ? offsetRect(clean, k / 2) : offsetRectXY(clean, k / 2, ky / 2);
    // The label goes in the longest stretch with no slot.
    const marks = [0, ...cuts, L];
    let lx = L / 2, best = 0;
    for (let i = 0; i + 1 < marks.length; i++) if (marks[i + 1] - marks[i] > best) { best = marks[i + 1] - marks[i]; lx = (marks[i] + marks[i + 1]) / 2; }
    out.parts.push({ kind: "wall", name: s.name, outline, caps: [], cols: [], hBody: h, w: L, label: best > 30 ? { x: lx, y: h / 2 } : null, bbox: bboxOf(outline), divider: true });
    out.places.push({ axis: s.axis, at: s.at, from, to, h, name: s.name });

    // Base slots under the tabs, sized like the wall's tab slots.
    const along: Point = s.axis === "x" ? [0, 1] : [1, 0], side: Point = s.axis === "x" ? [1, 0] : [0, 1];
    const aniso = ky !== k;
    const sa = aniso ? (p.tabW + p.slotClr) / 2 - kerfAcross(along, k, ky) : (p.tabW + p.slotClr - k) / 2;
    const sb = aniso ? (t + p.slotClr) / 2 - kerfAcross(side, k, ky) : (t + p.slotClr - k) / 2;
    for (const u of tabs) {
      const cx = s.axis === "x" ? s.at : from + u, cy = s.axis === "x" ? from + u : s.at;
      out.baseSlots.push([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + along[0] * sa * i + side[0] * sb * j, cy + along[1] * sa * i + side[1] * sb * j] as Point));
    }
  }
  return out;
}
