/**
 * Selection gestures: select under (Alt+click cycles through the objects stacked under the pointer),
 * touch selection (a freehand stroke selects every object whose outline it crosses or grazes) and
 * selecting by cut layer (the swatch bar's Shift+click).
 */
import { flatten, hitPaths, isEmptyBox, nodeBox, nodePaths, transformSubpaths, type Box } from "./geom";
import { walk } from "./scene";
import type { Document, Vec } from "./types";

/** Top-level objects under a point, topmost first (outline within `tol`, inside a closed area, or inside an image/text box). */
export function hitStack(doc: Document, p: Vec, tol: number): string[] {
  const hits = new Set<string>();
  let top = "";
  walk(doc.root, (l) => {
    if (l.depth === 0) top = l.node.id;
    if (l.node.hidden || l.node.locked) return "skip";
    if (l.node.type === "group" || hits.has(top)) return;
    const box = nodeBox(l.node, l.world);
    if (isEmptyBox(box) || p.x < box.minX - tol || p.x > box.maxX + tol || p.y < box.minY - tol || p.y > box.maxY + tol) return;
    if (l.node.type === "image" || l.node.type === "text") { hits.add(top); return; }
    const h = hitPaths(p, transformSubpaths(nodePaths(l.node), l.world), tol);
    if (h.stroke <= tol || h.inside) hits.add(top);
  });
  return doc.root.children.map((n) => n.id).filter((id) => hits.has(id)).reverse();
}

/**
 * The object an Alt+click selects: the one just below the lowest selected object in `stack`
 * (topmost first), wrapping to the top; the topmost when nothing under the pointer is selected.
 */
export function selectUnder(stack: string[], selection: string[]): string | null {
  if (!stack.length) return null;
  const sel = new Set(selection);
  let lowest = -1;
  stack.forEach((id, k) => { if (sel.has(id)) lowest = k; });
  return stack[(lowest + 1) % stack.length];
}

function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Distance between segments ab and cd (0 when they cross). */
export function segmentsDistance(a: Vec, b: Vec, c: Vec, d: Vec): number {
  const o = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDist(c, a, b), segDist(d, a, b), segDist(a, c, d), segDist(b, c, d));
}

/** Top-level visible, unlocked objects whose outline the stroke `pts` crosses or passes within `tol` of. */
export function touchHits(doc: Document, pts: Vec[], tol: number): string[] {
  if (!pts.length) return [];
  const stroke = pts.length === 1 ? [pts[0], pts[0]] : pts;
  const sb = { minX: Math.min(...stroke.map((q) => q.x)) - tol, minY: Math.min(...stroke.map((q) => q.y)) - tol, maxX: Math.max(...stroke.map((q) => q.x)) + tol, maxY: Math.max(...stroke.map((q) => q.y)) + tol };
  const hits = new Set<string>();
  let top = "";
  walk(doc.root, (l) => {
    if (l.depth === 0) top = l.node.id;
    if (l.node.hidden || l.node.locked) return "skip";
    if (l.node.type === "group" || hits.has(top)) return;
    const box = nodeBox(l.node, l.world);
    if (isEmptyBox(box) || box.maxX < sb.minX || box.minX > sb.maxX || box.maxY < sb.minY || box.minY > sb.maxY) return;
    for (const sp of transformSubpaths(nodePaths(l.node), l.world)) {
      const ring = flatten(sp, Math.max(tol / 4, 0.01));
      const loop = sp.closed && ring.length > 1 ? [...ring, ring[0]] : ring.length === 1 ? [ring[0], ring[0]] : ring;
      for (let i = 1; i < loop.length; i++) {
        for (let j = 1; j < stroke.length; j++) {
          if (segmentsDistance(loop[i - 1], loop[i], stroke[j - 1], stroke[j]) <= tol) { hits.add(top); return; }
        }
      }
    }
  });
  return doc.root.children.map((n) => n.id).filter((id) => hits.has(id));
}

/** Point inside a convex quadrilateral (either winding), edges included. */
export function inQuad(p: Vec, q: Vec[]): boolean {
  let sign = 0;
  for (let k = 0; k < q.length; k++) {
    const a = q[k], b = q[(k + 1) % q.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-12) continue;
    if (sign && Math.sign(c) !== sign) return false;
    sign = Math.sign(c);
  }
  return true;
}

/** An axis-aligned box and a convex quadrilateral overlap (separating-axis test). */
export function boxTouchesQuad(b: Box, q: Vec[]): boolean {
  const corners = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }];
  const axes: Vec[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let k = 0; k < q.length; k++) { const a = q[k], c = q[(k + 1) % q.length]; axes.push({ x: c.y - a.y, y: a.x - c.x }); }
  for (const ax of axes) {
    if (!ax.x && !ax.y) continue;
    const pa = corners.map((p) => p.x * ax.x + p.y * ax.y), pb = q.map((p) => p.x * ax.x + p.y * ax.y);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

/** Top-level visible, unlocked objects with anything on cut layer `layer`, in stacking order. */
export function objectsOnLayer(doc: Document, layer: number): string[] {
  const hits = new Set<string>();
  let top = "";
  walk(doc.root, (l) => {
    if (l.depth === 0) top = l.node.id;
    if (l.node.hidden || l.node.locked) return "skip";
    if (l.node.type !== "group" && l.node.layer === layer) hits.add(top);
  });
  return doc.root.children.map((n) => n.id).filter((id) => hits.has(id));
}
