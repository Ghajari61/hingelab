/**
 * Overall size of a model drawn over a 3D view, like the dimensions on a drawing: one line per
 * axis (width, height, depth) along an outline edge of the model's bounding box, set off outside
 * it, with extension lines, arrowheads and the length. An axis seen end-on is left out, so a top
 * view shows width and depth and a front view width and height.
 */
import * as THREE from "three";

type XY = [number, number];

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
}

/** Edges shorter than this on screen get no dimension. */
const MIN_PX = 28;

/**
 * Dimension lines for `box` (world space, mm) seen by `camera` in a `w` × `h` px view, `gap` px
 * outside the box's outline. `camera` must have up-to-date matrices.
 */
export function dimLines(box: THREE.Box3, camera: THREE.Camera, w: number, h: number, gap = 22): DimLine[] {
  if (box.isEmpty() || w < 2 || h < 2) return [];
  const v = new THREE.Vector3();
  const corner = (i: number) => v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
  const screen = (p: THREE.Vector3): XY | null => {
    p.project(camera);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.z < -1 || p.z > 1) return null;
    return [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h];
  };
  const pts: XY[] = [];
  for (let i = 0; i < 8; i++) {
    const s = screen(corner(i));
    if (!s) return [];
    pts.push(s);
  }
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
      s += `<line class="dim-ext" x1="${r1(fx + nx * 4)}" y1="${r1(fy + ny * 4)}" x2="${r1(tx + nx * 5)}" y2="${r1(ty + ny * 5)}"/>`;
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
