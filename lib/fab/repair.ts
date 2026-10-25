/**
 * Clean-up of the cut paths that changes nothing the laser makes: repeated points (segments under
 * SPECK), closed shapes with no area, and a contour repeated exactly within a part (cut twice).
 * Every change is counted so the checks and the file note can say what was done.
 */
import type { CutPart } from "@/lib/generators/output";
import type { Layout } from "@/lib/hinge/types";
import { polyArea } from "./model";
import { EMPTY_AREA, SPECK } from "./validate";

type Pt = [number, number];
type Contour = Pt[];

export interface RepairCount { points: number; empty: number; repeated: number }
export const NO_REPAIRS: RepairCount = { points: 0, empty: 0, repeated: 0 };
export const repairTotal = (r: RepairCount) => r.points + r.empty + r.repeated;

function dropSpecks(c: Contour, closed: boolean, n: RepairCount): Contour {
  if (c.length < 2) return c;
  const out: Contour = [c[0]];
  for (let i = 1; i < c.length; i++) {
    const p = out[out.length - 1];
    if (Math.hypot(c[i][0] - p[0], c[i][1] - p[1]) < SPECK) { n.points++; continue; }
    out.push(c[i]);
  }
  if (closed && out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < SPECK) { out.pop(); n.points++; }
  }
  return out;
}

/** A contour's key whatever its start and direction (points to 0.001 mm). */
function key(c: Contour, closed: boolean): string {
  const s = c.map(([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`);
  if (!closed) { const f = s.join(" "), r = [...s].reverse().join(" "); return f < r ? f : r; }
  let best = "";
  for (const seq of [s, [...s].reverse()]) {
    let k = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[k]) k = i;
    const t = [...seq.slice(k), ...seq.slice(0, k)].join(" ");
    if (!best || t < best) best = t;
  }
  return best;
}

function clean(cs: Contour[], closed: boolean, n: RepairCount, seen: Set<string>): Contour[] {
  const out: Contour[] = [];
  for (const c0 of cs) {
    const c = dropSpecks(c0, closed, n);
    if (closed && (c.length < 3 || Math.abs(polyArea(c)) < EMPTY_AREA)) { n.empty++; continue; }
    const k = (closed ? "c:" : "o:") + key(c, closed);
    if (seen.has(k)) { n.repeated++; continue; }
    seen.add(k);
    out.push(c);
  }
  return out;
}

export function repairCutPart(pt: CutPart, n: RepairCount): CutPart {
  const seen = new Set<string>();
  const outline = clean(pt.outline, true, n, seen);
  const inner = clean(pt.inner, true, n, seen);
  const cuts = clean(pt.cuts, false, n, seen);
  return { ...pt, outline, inner, cuts };
}

/** The layout with every part cleaned up, and what changed. */
export function repairLayout(lay: Layout<CutPart>): { lay: Layout<CutPart>; count: RepairCount } {
  const n: RepairCount = { ...NO_REPAIRS };
  const items = lay.items.map((it) => (it.i < 0 ? it : { ...it, pt: repairCutPart(it.pt, n) }));
  return { lay: { ...lay, items }, count: n };
}

export function repairNote(r: RepairCount): string {
  const bits = [r.points && `${r.points} repeated point${r.points === 1 ? "" : "s"}`, r.empty && `${r.empty} empty shape${r.empty === 1 ? "" : "s"}`, r.repeated && `${r.repeated} line${r.repeated === 1 ? "" : "s"} cut twice`].filter(Boolean);
  return bits.length ? `Cleaned up: removed ${bits.join(", ")}.` : "";
}
