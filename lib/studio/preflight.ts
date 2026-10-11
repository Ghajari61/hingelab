/**
 * Pre-flight after path operations: finds results a laser would handle badly — open outlines (no
 * inside, so they can't be filled or cut out as a part) and lines lying on top of other lines (the laser
 * cuts them twice, scorching the edge). Pure; the editor shows the report as a toast.
 */
import { flatten, mul, nodePaths, transformSubpaths } from "./geom";
import { locate, walk, type Located } from "./scene";
import type { Document, Vec } from "./types";

export interface PreflightReport {
  /** Paths with at least one open subpath. */
  open: string[];
  /** Objects with a line that runs along a line of another object (or another part of the same one). */
  duplicates: string[];
}

export interface PreflightOptions {
  /** Report open paths (off for operations whose results are meant to be open, like Cut Path). */
  open?: boolean;
  /** Two lines closer than this (mm) count as one on top of the other. */
  tol?: number;
  /** Shortest shared length (mm) worth reporting. */
  minOverlap?: number;
}

interface Seg { a: Vec; b: Vec; owner: number; part: number; theta: number; rho: number; s0: number; s1: number }

const ANGLE_STEP = 0.01;
const BUCKETS = Math.round(Math.PI / ANGLE_STEP);

/** Leaf objects among `ids` (groups opened, hidden objects skipped) with their world matrices. */
function leaves(d: Document, ids: string[]): Located[] {
  const out: Located[] = [];
  const seen = new Set<string>();
  const add = (l: Located) => {
    if (l.node.hidden || seen.has(l.node.id)) return;
    seen.add(l.node.id);
    if (l.node.type === "group") {
      const pw = l.parentWorld;
      walk(l.node, (c) => {
        if (c.node.hidden) return "skip";
        if (c.node.type !== "group" && !seen.has(c.node.id)) { seen.add(c.node.id); out.push({ ...c, world: mul(pw, c.world), parentWorld: mul(pw, c.parentWorld) }); }
      });
      return;
    }
    out.push(l);
  };
  for (const id of ids) { const l = locate(d.root, id); if (l) add(l); }
  return out;
}

export function preflightPaths(d: Document, ids: string[], o: PreflightOptions = {}): PreflightReport {
  const tol = o.tol ?? 0.05, minOverlap = o.minOverlap ?? 0.5;
  const items = leaves(d, ids).filter((l) => l.node.type === "path" || l.node.type === "shape" || l.node.type === "text");
  const open = o.open === false ? [] : items
    .filter((l) => l.node.type === "path" && l.node.subpaths.some((s) => !s.closed && s.nodes.length > 1))
    .map((l) => l.node.id);

  // Lines that overlap are parallel and on the same infinite line, so bucket every flattened segment by
  // its direction θ ∈ [0, π) and signed distance ρ from the origin; only neighbouring buckets can match.
  const buckets = new Map<string, Seg[]>();
  const segs: Seg[] = [];
  let part = 0;
  items.forEach((l, owner) => {
    for (const s of transformSubpaths(nodePaths(l.node), l.world)) {
      const pts = flatten(s, 0.02);
      if (s.closed && pts.length > 1) pts.push(pts[0]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        let dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        dx /= len; dy /= len;
        if (dy < 0 || (dy === 0 && dx < 0)) { dx = -dx; dy = -dy; }
        let theta = Math.atan2(dy, dx);
        // Just below π rounds into bucket 0: use the opposite direction (θ just below 0) there.
        if (Math.round(theta / ANGLE_STEP) >= BUCKETS) { dx = -dx; dy = -dy; theta -= Math.PI; }
        const rho = a.x * -dy + a.y * dx;
        const sa = a.x * dx + a.y * dy, sb = b.x * dx + b.y * dy;
        const seg: Seg = { a, b, owner, part, theta, rho, s0: Math.min(sa, sb), s1: Math.max(sa, sb) };
        segs.push(seg);
        const key = `${Math.round(theta / ANGLE_STEP)}|${Math.round(rho / (tol * 2))}`;
        const list = buckets.get(key);
        if (list) list.push(seg); else buckets.set(key, [seg]);
      }
      part++;
    }
  });

  const shared = new Map<string, number>();
  const distToLine = (p: Vec, s: Seg) => {
    const dx = Math.cos(s.theta), dy = Math.sin(s.theta);
    return Math.abs(p.x * -dy + p.y * dx - s.rho);
  };
  for (const s of segs) {
    const ti = Math.round(s.theta / ANGLE_STEP), ri = Math.round(s.rho / (tol * 2));
    for (let dt = -1; dt <= 1; dt++) {
      // Directions wrap at π, where the same line has the opposite sign of ρ.
      let t = ti + dt, flip = false;
      if (t < 0) { t += BUCKETS; flip = true; } else if (t >= BUCKETS) { t -= BUCKETS; flip = true; }
      for (let dr = -1; dr <= 1; dr++) {
        const list = buckets.get(`${t}|${(flip ? -ri : ri) + dr}`);
        if (!list) continue;
        for (const q of list) {
          if (q === s || q.part === s.part || q.owner < s.owner || (q.owner === s.owner && q.part < s.part)) continue;
          if (distToLine(q.a, s) > tol || distToLine(q.b, s) > tol) continue;
          const dx = Math.cos(s.theta), dy = Math.sin(s.theta);
          const qa = q.a.x * dx + q.a.y * dy, qb = q.b.x * dx + q.b.y * dy;
          const overlap = Math.min(s.s1, Math.max(qa, qb)) - Math.max(s.s0, Math.min(qa, qb));
          if (overlap <= tol) continue;
          const key = `${s.owner}|${q.owner}`;
          shared.set(key, (shared.get(key) ?? 0) + overlap);
        }
      }
    }
  }
  const dup = new Set<number>();
  for (const [key, len] of shared) {
    if (len < minOverlap) continue;
    const [x, y] = key.split("|").map(Number);
    dup.add(x); dup.add(y);
  }
  return { open, duplicates: [...dup].sort((a, b) => a - b).map((k) => items[k].node.id) };
}

/** The toast text for a report, or null when there is nothing to say. */
export function preflightMessage(r: PreflightReport, label: string): string | null {
  const parts: string[] = [];
  if (r.open.length) parts.push(`${r.open.length} open path${r.open.length === 1 ? "" : "s"}`);
  if (r.duplicates.length) parts.push(`${r.duplicates.length} object${r.duplicates.length === 1 ? "" : "s"} with lines on top of each other (cut twice)`);
  return parts.length ? `${label}: ${parts.join(" and ")}` : null;
}
