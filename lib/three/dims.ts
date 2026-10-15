/**
 * Overall size of a model drawn over a 3D view, like the dimensions on a drawing: one line per
 * axis (width, height, depth) along an outline edge of the model's bounding box, set off outside
 * it, with extension lines, arrowheads and the length. An axis seen end-on is left out, so a top
 * view shows width and depth and a front view width and height.
 *
 * Orthographic views set each line off on screen. Perspective views place it in the model's own
 * space, as on an isometric drawing: an outline edge (lower and nearer first) moved straight out
 * from one of the two faces it borders, so the extension lines run along the model's axes and
 * follow the perspective.
 */
import * as THREE from "three";

type XY = [number, number];
type XYZ = [number, number, number];

export interface DimLine {
  axis: 0 | 1 | 2;
  /** Length along the axis, mm. */
  mm: number;
  /** The measured edge's ends on screen, px. */
  from: [XY, XY];
  /** The dimension line's ends, px: the edge set off outward. */
  to: [XY, XY];
  /** Outward unit normal on screen. */
  n: XY;
  /** Perspective views: the measured edge in world space (mm) and the world axis it is set off along. */
  world?: { edge: [XYZ, XYZ]; dir: XYZ };
}

/** Edges shorter than this on screen get no dimension. */
const MIN_PX = 28;
/** Labels closer than this (px, centre to centre) would overlap. */
const LABEL_CLEAR = 40;
/** The model's up axis (y). */
const UP = 1;

/**
 * Dimension lines for `box` (world space, mm) seen by `camera` in a `w` × `h` px view, `gap` px
 * outside the box's outline. `camera` must have up-to-date matrices.
 */
export function dimLines(box: THREE.Box3, camera: THREE.Camera, w: number, h: number, gap = 22): DimLine[] {
  if (box.isEmpty() || w < 2 || h < 2) return [];
  const screen = (p: THREE.Vector3): XY | null => {
    const q = p.clone().project(camera);
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || q.z < -1 || q.z > 1) return null;
    return [((q.x + 1) / 2) * w, ((1 - q.y) / 2) * h];
  };
  const pts: XY[] = [];
  for (let i = 0; i < 8; i++) {
    const s = screen(corner(box, i));
    if (!s) return [];
    pts.push(s);
  }
  return (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? worldDims(box, camera, pts, screen, w, h, gap) : outlineDims(box, pts, gap);
}

const corner = (box: THREE.Box3, i: number) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);

/** Orthographic: per axis, the edge farthest out on screen, set off past the whole outline. */
function outlineDims(box: THREE.Box3, pts: XY[], gap: number): DimLine[] {
  const cx = pts.reduce((a, p) => a + p[0], 0) / 8, cy = pts.reduce((a, p) => a + p[1], 0) / 8;
  const out: DimLine[] = [];
  for (const axis of [0, 1, 2] as const) {
    const bit = 1 << axis;
    let best: { s0: XY; s1: XY; n: XY; score: number } | null = null;
    for (let i = 0; i < 8; i++) {
      if (i & bit) continue;
      const s0 = pts[i], s1 = pts[i | bit];
      const dx = s1[0] - s0[0], dy = s1[1] - s0[1], len = Math.hypot(dx, dy);
      if (len < MIN_PX) continue;
      let n: XY = [-dy / len, dx / len];
      const mx = (s0[0] + s1[0]) / 2 - cx, my = (s0[1] + s1[1]) / 2 - cy;
      let away = n[0] * mx + n[1] * my;
      if (away < 0) { n = [-n[0], -n[1]]; away = -away; }
      // Ties (the edges of an end-on face) go below or to the right, as on a drawing.
      const score = away + 0.5 * (n[1] > 0.3 ? 1 : 0) + 0.25 * (n[0] > 0.3 ? 1 : 0);
      if (!best || score > best.score + 1e-6) best = { s0, s1, n, score };
    }
    if (!best) continue;
    const { s0, s1, n } = best;
    // Clear the whole outline, not just this edge.
    let reach = 0;
    for (const p of pts) reach = Math.max(reach, (p[0] - s0[0]) * n[0] + (p[1] - s0[1]) * n[1]);
    const off = reach + gap;
    out.push({
      axis,
      mm: box.max.getComponent(axis) - box.min.getComponent(axis),
      from: [s0, s1],
      to: [[s0[0] + n[0] * off, s0[1] + n[1] * off], [s1[0] + n[0] * off, s1[1] + n[1] * off]],
      n,
    });
  }
  return out;
}

/** The convex outline of points (screen space), counter-clockwise in screen coordinates. */
function hull(points: XY[]): XY[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XY[] = [], upper: XY[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Inside the outline, or within `pad` px of it. */
function inside(poly: XY[], q: XY, pad = 0): boolean {
  if (poly.length < 3) return false;
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
    // Positive inside (counter-clockwise in a y-down frame).
    min = Math.min(min, ((q[0] - a[0]) * ey - (q[1] - a[1]) * ex) / -len);
  }
  return min > -pad;
}

/** Perspective: per axis, the best outline edge set off along a face normal, in world space. */
function worldDims(box: THREE.Box3, camera: THREE.Camera, pts: XY[], screen: (p: THREE.Vector3) => XY | null, w: number, h: number, gap: number): DimLine[] {
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const lo = box.min, hi = box.max;
  const outline = hull(pts);
  const cx = pts.reduce((a, p) => a + p[0], 0) / 8, cy = pts.reduce((a, p) => a + p[1], 0) / 8;
  const dist = Array.from({ length: 8 }, (_, i) => corner(box, i).distanceTo(eye));
  const dMin = Math.min(...dist), dSpan = Math.max(...dist) - dMin || 1;
  const probe = box.getSize(new THREE.Vector3()).length() * 0.05 + 1;
  /** The face on side `s` (0 min, 1 max) of `axis` faces the camera. */
  const faces = (axis: number, s: number) => (s ? eye.getComponent(axis) > hi.getComponent(axis) + 1e-6 : eye.getComponent(axis) < lo.getComponent(axis) - 1e-6);

  type Cand = { score: number; p0: THREE.Vector3; p1: THREE.Vector3; s0: XY; s1: XY; d: THREE.Vector3; pxPerMm: number; side: XY };
  const out: DimLine[] = [];
  const labels: XY[] = [];
  for (const axis of [0, 1, 2] as const) {
    const [b, c] = [0, 1, 2].filter((k) => k !== axis);
    const cands: Cand[] = [];
    for (const sb of [0, 1]) {
      for (const sc of [0, 1]) {
        const vb = faces(b, sb), vc = faces(c, sc);
        if (!vb && !vc) continue;
        const p0 = new THREE.Vector3();
        p0.setComponent(axis, lo.getComponent(axis));
        p0.setComponent(b, sb ? hi.getComponent(b) : lo.getComponent(b));
        p0.setComponent(c, sc ? hi.getComponent(c) : lo.getComponent(c));
        const p1 = p0.clone().setComponent(axis, hi.getComponent(axis));
        const s0 = screen(p0), s1 = screen(p1);
        if (!s0 || !s1) continue;
        const len = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
        if (len < MIN_PX) continue;
        const ux = (s1[0] - s0[0]) / len, uy = (s1[1] - s0[1]) / len;
        const mid = p0.clone().lerp(p1, 0.5);
        const sm = screen(mid);
        if (!sm) continue;
        const near = 1 - (mid.distanceTo(eye) - dMin) / dSpan;
        const lower = axis !== UP && ((b === UP && sb === 0) || (c === UP && sc === 0));
        const silhouette = vb !== vc;
        for (const [k, s, other] of [[b, sb, vc], [c, sc, vb]] as const) {
          const d = new THREE.Vector3().setComponent(k, s ? 1 : -1);
          const sp = screen(mid.clone().addScaledVector(d, probe));
          if (!sp) continue;
          const px = Math.hypot(sp[0] - sm[0], sp[1] - sm[1]);
          if (px < 2) continue;
          const dx = (sp[0] - sm[0]) / px, dy = (sp[1] - sm[1]) / px;
          const perp = Math.abs(dx * uy - dy * ux);
          if (perp < 0.3) continue;
          const ox = sm[0] - cx, oy = sm[1] - cy, ol = Math.hypot(ox, oy) || 1;
          const outward = (dx * ox + dy * oy) / ol;
          if (outward < 0) continue;
          // The line lies in the plane of the other face: on a face the camera sees, it reads as drawn on it.
          const score = 4 * (silhouette ? 1 : 0) + 2 * (lower ? 1 : 0) + 3 * near + (other ? 1 : 0) + outward + 0.5 * perp;
          cands.push({ score, p0, p1, s0, s1, d, pxPerMm: px / probe, side: [dx, dy] });
        }
      }
    }
    cands.sort((x, y) => y.score - x.score);
    let pick: DimLine | null = null, pickLabel: XY | null = null;
    for (const cand of cands) {
      let placed: { line: DimLine; label: XY; onScreen: boolean } | null = null;
      for (let step = 0; step < 10; step++) {
        const off = (gap + step * 12) / cand.pxPerMm;
        const t0 = screen(cand.p0.clone().addScaledVector(cand.d, off)), t1 = screen(cand.p1.clone().addScaledVector(cand.d, off));
        if (!t0 || !t1) break;
        const lx = t1[0] - t0[0], ly = t1[1] - t0[1], ll = Math.hypot(lx, ly) || 1;
        let n: XY = [-ly / ll, lx / ll];
        if (n[0] * cand.side[0] + n[1] * cand.side[1] < 0) n = [-n[0], -n[1]];
        const label: XY = [(t0[0] + t1[0]) / 2 + n[0] * 9, (t0[1] + t1[1]) / 2 + n[1] * 9];
        const mid: XY = [(t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2];
        const clear = !inside(outline, t0, 2) && !inside(outline, t1, 2) && !inside(outline, mid, 2) && !inside(outline, label, 8)
          && labels.every((q) => Math.hypot(q[0] - label[0], q[1] - label[1]) > LABEL_CLEAR);
        const onScreen = label[0] > 10 && label[0] < w - 10 && label[1] > 10 && label[1] < h - 10;
        placed = {
          line: {
            axis, mm: hi.getComponent(axis) - lo.getComponent(axis), from: [cand.s0, cand.s1], to: [t0, t1], n,
            world: { edge: [cand.p0.toArray() as XYZ, cand.p1.toArray() as XYZ], dir: cand.d.toArray() as XYZ },
          },
          label, onScreen,
        };
        if (clear) break;
      }
      if (!placed) continue;
      if (!pick) { pick = placed.line; pickLabel = placed.label; }
      if (placed.onScreen) { pick = placed.line; pickLabel = placed.label; break; }
    }
    if (pick && pickLabel) { out.push(pick); labels.push(pickLabel); }
  }
  return out;
}

/**
 * The box around a model's solid parts as shown: meshes only, so cut lines drawn just off a
 * surface do not count, nor do skins and overlays marked `userData.noMeasure` (engraving, the cut
 * lines painted over parts lying flat).
 */
export function modelBox(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || m.userData.noMeasure) return;
    const pos = m.geometry?.getAttribute("position");
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  return box;
}

/**
 * Within this of a whole millimetre a size reads as the whole millimetre: cut outlines are grown
 * by half the kerf and curves are faceted, so a 140 mm box measures 140.15 mm as modelled.
 */
const SNAP_MM = 0.2;

export function fmtDim(mm: number, units: "mm" | "in" = "mm"): string {
  const whole = Math.round(mm);
  const v = Math.abs(mm - whole) <= SNAP_MM ? whole : mm;
  return units === "in" ? `${(v / 25.4).toFixed(2)} in` : `${v.toFixed(1)} mm`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** SVG markup for the lines (no user text, safe as innerHTML). Styled through `.dim-*` classes. */
export function dimSVG(lines: DimLine[], units: "mm" | "in" = "mm"): string {
  let s = "";
  for (const d of lines) {
    const [[ax, ay], [bx, by]] = d.to;
    const [nx, ny] = d.n;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    for (const [[fx, fy], [tx, ty]] of [[d.from[0], d.to[0]], [d.from[1], d.to[1]]] as const) {
      // Each extension line runs from its edge end to the dimension line (in perspective the two are not parallel).
      const el = Math.hypot(tx - fx, ty - fy);
      const [ex, ey] = el > 1 ? [(tx - fx) / el, (ty - fy) / el] : [nx, ny];
      s += `<line class="dim-ext" x1="${r1(fx + ex * 4)}" y1="${r1(fy + ey * 4)}" x2="${r1(tx + ex * 5)}" y2="${r1(ty + ey * 5)}"/>`;
    }
    s += `<line class="dim-line" x1="${r1(ax)}" y1="${r1(ay)}" x2="${r1(bx)}" y2="${r1(by)}"/>`;
    const A = 7, W = 2.6;
    for (const [px, py, k] of [[ax, ay, 1], [bx, by, -1]] as const) {
      const tx = px + ux * A * k, ty = py + uy * A * k;
      s += `<path class="dim-arrow" d="M${r1(px)} ${r1(py)}L${r1(tx - uy * W)} ${r1(ty + ux * W)}L${r1(tx + uy * W)} ${r1(ty - ux * W)}Z"/>`;
    }
    let deg = (Math.atan2(uy, ux) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    else if (deg <= -90) deg += 180;
    const mx = (ax + bx) / 2 + nx * 9, my = (ay + by) / 2 + ny * 9;
    s += `<text class="dim-text" x="${r1(mx)}" y="${r1(my)}" transform="rotate(${r1(deg)} ${r1(mx)} ${r1(my)})" text-anchor="middle" dominant-baseline="middle">${fmtDim(d.mm, units)}</text>`;
  }
  return s;
}
