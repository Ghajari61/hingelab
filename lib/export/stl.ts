/**
 * A laser cut file as a 3D print: every closed cut on the outline and inner-cut layers of a HingeLab
 * SVG (or any SVG whose cuts are red or green), filled even-odd so holes stay holes, then extruded to
 * the material thickness as one binary STL. Score lines, hinge slits, engraving and text are left out:
 * a print has no use for them. Everything runs on the device.
 */
import { ShapeUtils, Vector2 } from "three";
import { unionShapes } from "@/lib/letters/polygon";
import type { Contour } from "@/lib/letters/types";
import { readScene, type Scene } from "./scene";

/** Layer colours that are cuts through the material (outline and inner cuts, packages/ui/src/ops.ts). */
const CUT_COLORS = new Set(["#ff0000", "#00e000"]);
const ANY_RED_GREEN = /^#(ff0000|f00|00e000|00ff00|0f0)$/i;

export interface StlResult {
  data: Uint8Array;
  /** Separate solid pieces in the file. */
  pieces: number;
  triangles: number;
}

/** Closed cut loops of a scene, in document millimetres (y down). */
export function cutLoops(scene: Scene): Contour[] {
  const loops: Contour[] = [];
  const cutLayers = scene.layers.filter((l) => !l.fill && CUT_COLORS.has(l.color.toLowerCase()));
  // An SVG that is not HingeLab's: any red or green stroked layer, else every stroked layer.
  const layers = cutLayers.length ? cutLayers : scene.layers.filter((l) => !l.fill && ANY_RED_GREEN.test(l.color)).length
    ? scene.layers.filter((l) => !l.fill && ANY_RED_GREEN.test(l.color))
    : scene.layers.filter((l) => !l.fill);
  for (const l of layers) for (const it of l.items) for (const p of it.polys) {
    let pts = p.pts;
    const n = pts.length;
    const closes = n > 2 && Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 0.05;
    if (!p.closed && !closes) continue;
    if (closes) pts = pts.slice(0, -1);
    if (pts.length >= 3) loops.push(pts.map(([x, y]) => [x, y]));
  }
  return loops;
}

function writeBinary(tris: number[]): Uint8Array {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = "HingeLab STL: laser cut file extruded for 3D printing";
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < head.length ? head.charCodeAt(i) : 32);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const k = t * 9;
    const ax = tris[k + 3] - tris[k], ay = tris[k + 4] - tris[k + 1], az = tris[k + 5] - tris[k + 2];
    const bx = tris[k + 6] - tris[k], by = tris[k + 7] - tris[k + 1], bz = tris[k + 8] - tris[k + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of [nx, ny, nz]) { dv.setFloat32(o, v, true); o += 4; }
    for (let j = 0; j < 9; j++) { dv.setFloat32(o, tris[k + j], true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

/** The cut regions extruded to `thickness` mm. y is flipped so the print reads the right way round. */
export function loopsToSTL(loops: Contour[], thickness: number): StlResult {
  const T = Math.max(0.2, Math.min(100, thickness));
  const shapes = unionShapes(loops, [], true);
  const tris: number[] = [];
  const v = (c: Contour) => c.map(([x, y]) => new Vector2(x, -y));
  for (const s of shapes) {
    // y flips, so a contour's winding flips too: three wants the outer counter-clockwise, holes clockwise
    let outer = v(s.outer);
    if (ShapeUtils.isClockWise(outer)) outer = outer.reverse();
    const holes = s.holes.map((h) => { const q = v(h); return ShapeUtils.isClockWise(q) ? q : q.reverse(); });
    const faces = ShapeUtils.triangulateShape(outer, holes);
    const all = [...outer, ...holes.flat()];
    for (const [a, b, c] of faces) {
      const A = all[a], B = all[b], C = all[c];
      tris.push(A.x, A.y, T, B.x, B.y, T, C.x, C.y, T); // top, facing up
      tris.push(A.x, A.y, 0, C.x, C.y, 0, B.x, B.y, 0); // bottom, facing down
    }
    // walls: outer counter-clockwise and holes clockwise both keep the material on the left
    for (const ring of [outer, ...holes]) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      tris.push(p.x, p.y, 0, q.x, q.y, 0, q.x, q.y, T);
      tris.push(p.x, p.y, 0, q.x, q.y, T, p.x, p.y, T);
    }
  }
  return { data: writeBinary(tris), pieces: shapes.length, triangles: tris.length / 9 };
}

/** A laser SVG (HingeLab's or any other) as an STL of its cut-out parts. */
export function svgToSTL(svg: string, thickness: number): StlResult {
  return loopsToSTL(cutLoops(readScene(svg)), thickness);
}
