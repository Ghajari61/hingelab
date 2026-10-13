/**
 * The parts a Studio document cuts: every outermost closed cut is a part, closed cuts inside it are
 * its holes (even-odd, so an island inside a hole is a part of its own), and closed engraving inside
 * it is its engraving. Coordinates are document mm, y down. Each ring remembers the path it came from
 * so the fixes can move the drawing's own anchors.
 */
import { flatten, transformSubpaths, nodePaths, segments } from "../geom";
import { walk } from "../scene";
import type { CutLayer, Document, Sheet } from "../types";

export type P = [number, number];

export interface RingSource {
  node: string;
  sub: number;
  /** Straight segments only, on a plain path: vertex i is anchor i. */
  exact: boolean;
}

export interface Ring {
  pts: P[];
  src: RingSource;
}

export interface RawPart {
  /** "nodeId:subpath" of the outline. */
  key: string;
  name: string;
  outer: Ring;
  holes: Ring[];
  engrave: P[][];
  /** Every node with a ring in this part. */
  nodes: string[];
  sheet: Sheet | null;
  area: number;
}

export interface OpenCut {
  node: string;
  sub: number;
  /** Distance between the ends, mm. */
  gap: number;
  exact: boolean;
}

export interface CollectedParts {
  parts: RawPart[];
  open: OpenCut[];
  /** Too much geometry: the rest was left out. */
  truncated: boolean;
}

const MAX_RINGS = 4000;
const MAX_POINTS = 400_000;

export function signedArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
}

export function pointInRing(p: P, pts: P[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (pts: P[]): Box => {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of pts) { if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; }
  return b;
};
const boxIn = (a: Box, b: Box) => a.x0 >= b.x0 - 1e-6 && a.y0 >= b.y0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.y1 <= b.y1 + 1e-6;

/** A point just inside the ring: the midpoint of an edge nudged towards the inside. */
function probe(pts: P[]): P {
  const ccw = signedArea(pts) > 0;
  let best = 0, len = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > len) { len = l; best = i; }
  }
  const a = pts[best], b = pts[(best + 1) % pts.length];
  const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
  const k = (ccw ? 1 : -1) * Math.min(0.01, len / 10);
  return [(a[0] + b[0]) / 2 + nx * k, (a[1] + b[1]) / 2 + ny * k];
}

const layerOf = (doc: Document, index: number): CutLayer | undefined => doc.cutLayers[index]?.index === index ? doc.cutLayers[index] : doc.cutLayers.find((l) => l.index === index);

const NAMES: Record<string, string> = { path: "Path", shape: "Shape", text: "Text", clone: "Clone" };

export function collectParts(doc: Document): CollectedParts {
  const cuts: (Ring & { area: number; box: Box; name: string })[] = [];
  const fills: P[][] = [];
  const open: OpenCut[] = [];
  let points = 0, truncated = false;
  const names = new Map<string, number>();

  walk(doc.root, (l) => {
    const n = l.node;
    if (n.hidden) return "skip";
    if (n.type === "group" || truncated) return;
    if (n.type !== "path" && n.type !== "shape" && n.type !== "text" && n.type !== "clone") return;
    const layer = layerOf(doc, n.layer);
    if (!layer || layer.output === false || (layer.mode !== "cut" && layer.mode !== "fill")) return;
    const plain = n.type === "path" && !n.effects?.some((e) => e.enabled);
    const subs = transformSubpaths(nodePaths(n), l.world);
    const label = n.name?.trim() || NAMES[n.type];
    subs.forEach((s, sub) => {
      if (truncated || s.nodes.length < 2) return;
      const pts = flatten(s, 0.1).map((q) => [q.x, q.y] as P);
      points += pts.length;
      if (points > MAX_POINTS || cuts.length > MAX_RINGS) { truncated = true; return; }
      const exact = plain && segments(s).every((g) => g.line);
      if (layer.mode === "fill") { if (s.closed && pts.length > 2) fills.push(pts); return; }
      if (!s.closed) {
        const a = pts[0], b = pts[pts.length - 1];
        open.push({ node: n.id, sub, gap: Math.hypot(b[0] - a[0], b[1] - a[1]), exact: plain });
        return;
      }
      const area = signedArea(pts);
      if (pts.length < 3 || Math.abs(area) < 0.01) return;
      cuts.push({ pts, src: { node: n.id, sub, exact }, area: Math.abs(area), box: boxOf(pts), name: label });
    });
  });

  // Containment: each ring's parent is the smallest larger ring around it.
  const order = cuts.map((_, i) => i).sort((a, b) => cuts[b].area - cuts[a].area);
  const parent = new Array<number>(cuts.length).fill(-1);
  const depth = new Array<number>(cuts.length).fill(0);
  order.forEach((i, oi) => {
    const r = cuts[i], p = probe(r.pts);
    for (let oj = oi - 1; oj >= 0; oj--) {
      const j = order[oj];
      if (cuts[j].area <= r.area || !boxIn(r.box, cuts[j].box)) continue;
      if (pointInRing(p, cuts[j].pts)) { parent[i] = j; depth[i] = depth[j] + 1; break; }
    }
  });

  const partOf = new Map<number, RawPart>();
  const parts: RawPart[] = [];
  const outers = order.filter((i) => !(depth[i] % 2));
  for (const i of outers) names.set(cuts[i].name, (names.get(cuts[i].name) ?? 0) + 1);
  const counts = new Map<string, number>();
  for (const i of outers) {
    const r = cuts[i];
    const k = (counts.get(r.name) ?? 0) + 1;
    counts.set(r.name, k);
    const part: RawPart = {
      key: `${r.src.node}:${r.src.sub}`, name: (names.get(r.name) ?? 1) > 1 ? `${r.name} ${k}` : r.name,
      outer: { pts: r.pts, src: r.src }, holes: [], engrave: [], nodes: [r.src.node], sheet: sheetOf(doc.sheets, r.box), area: r.area,
    };
    partOf.set(i, part);
    parts.push(part);
  }
  for (const i of order) {
    if (!(depth[i] % 2)) continue;
    const owner = partOf.get(parent[i]);
    if (!owner) continue;
    owner.holes.push({ pts: cuts[i].pts, src: cuts[i].src });
    if (!owner.nodes.includes(cuts[i].src.node)) owner.nodes.push(cuts[i].src.node);
  }
  // Engraving belongs to the innermost ring around it, when that ring is a part's outline.
  for (const f of fills) {
    const p = f[0], b = boxOf(f);
    let best = -1;
    for (let i = 0; i < cuts.length; i++) {
      if (!boxIn(b, cuts[i].box) || !pointInRing(p, cuts[i].pts)) continue;
      if (best < 0 || cuts[i].area < cuts[best].area) best = i;
    }
    const owner = best >= 0 ? partOf.get(best) : undefined;
    if (owner) owner.engrave.push(f);
  }
  return { parts, open, truncated };
}

function sheetOf(sheets: Sheet[], b: Box): Sheet | null {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  let best: Sheet | null = null, dist = Infinity;
  for (const s of sheets) {
    const dx = Math.max(s.x - cx, 0, cx - (s.x + s.w)), dy = Math.max(s.y - cy, 0, cy - (s.y + s.h));
    const d = Math.hypot(dx, dy);
    if (d < dist) { dist = d; best = s; }
  }
  return best;
}
