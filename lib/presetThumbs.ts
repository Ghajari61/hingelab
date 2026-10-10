/**
 * Preset thumbnails drawn from the real geometry as small SVGs (built by scripts/build-preset-thumbs.mjs).
 * Letters: the welded letter shapes, extruded. Parametric: the cut parts at their assembled
 * positions, painter-sorted in a three-quarter view.
 */
import type { Contour, Shape } from "@/lib/letters/types";

const VW = 300, VH = 200;
const WOOD = [201, 163, 106];
const shade = (k: number) => `rgb(${WOOD.map((c) => Math.round(Math.min(255, c * k))).join(",")})`;
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

function pathOf(cs: Contour[], tx: (p: [number, number]) => [number, number]): string {
  return cs.map((c) => "M" + c.map((p) => tx(p).map(n1).join(" ")).join("L") + "Z").join("");
}

function fitBox(x0: number, y0: number, x1: number, y1: number, pad = 18) {
  const sc = Math.min((VW - 2 * pad) / Math.max(1e-6, x1 - x0), (VH - 2 * pad) / Math.max(1e-6, y1 - y0));
  const ox = (VW - (x1 - x0) * sc) / 2 - x0 * sc, oy = (VH - (y1 - y0) * sc) / 2 - y0 * sc;
  return { sc, ox, oy };
}

const svgOpen = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg">`;

/** Keeps every k-th point so a thumbnail stays a few kilobytes. */
function thin(c: Contour, max: number): Contour {
  if (c.length <= max) return c;
  const k = Math.ceil(c.length / max);
  return c.filter((_, i) => i % k === 0);
}

/**
 * Letters as seen from the front and a little above: the shapes are stacked back to front so the
 * extrusion reads as depth. `stencil` draws a plate with the letters cut out.
 */
export function lettersThumbSVG(shapes: Shape[], opts: { depth: number; stencil?: boolean; margin?: number }): string {
  if (!shapes.length) return "";
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) { x0 = Math.min(x0, s.bbox.x0); y0 = Math.min(y0, s.bbox.y0); x1 = Math.max(x1, s.bbox.x1); y1 = Math.max(y1, s.bbox.y1); }
  if (opts.stencil) { const m = opts.margin ?? 15; x0 -= m; y0 -= m; x1 += m; y1 += m; }
  const dz = opts.depth, dx = dz * 0.45, dy = dz * 0.35;
  const { sc, ox, oy } = fitBox(x0, y0 - dy, x1 + dx, y1);
  const contours = shapes.flatMap((s) => [thin(s.outer, 140), ...s.holes.map((h) => thin(h, 80))]);
  const steps = Math.max(2, Math.min(7, Math.round(dz * sc / 1.6)));
  let body = `<ellipse cx="${n1(VW / 2)}" cy="${n1(y1 * sc + oy + 6)}" rx="${n1((x1 - x0) * sc * 0.5)}" ry="6" fill="#000" fill-opacity=".12"/>`;
  const plate: Contour = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const draw = opts.stencil ? [plate, ...shapes.map((s) => thin(s.outer, 140))] : contours;
  for (let i = steps; i >= 0; i--) {
    const f = i / steps;
    const tx = (p: [number, number]): [number, number] => [(p[0] + dx * f) * sc + ox, (p[1] - dy * f) * sc + oy];
    const front = i === 0;
    body += `<path d="${pathOf(draw, tx)}" fill="${front ? shade(1.06) : shade(0.62 + 0.12 * (1 - f))}" fill-rule="evenodd"${front ? ` stroke="rgba(60,40,20,.45)" stroke-width=".6"` : ""}/>`;
  }
  return `${svgOpen}${body}</svg>`;
}

type V3 = [number, number, number];

/** A flat cut part placed in model space: its outline in part-local mm and the 4×4 column-major placement. */
export interface PlacedPart { outer: Contour; placement: number[] }

/** Parts in a three-quarter view (model Y up, Z toward the viewer), filled with a light-dependent shade. */
export function partsThumbSVG(parts: PlacedPart[], view: { yaw?: number; elev?: number } = {}): string {
  if (!parts.length) return "";
  const yaw = view.yaw ?? -0.7, elev = view.elev ?? 0.62;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elev), se = Math.sin(elev);
  const toModel = (m: number[], x: number, y: number): V3 => [m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13], m[2] * x + m[6] * y + m[14]];
  const project = (p: V3): V3 => {
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    return [x1, -(p[1] * ce - z1 * se), z1 * ce + p[1] * se];
  };
  const light: V3 = [-0.45, 0.6, 0.66];
  const faces = parts.map((pt) => {
    const m = pt.placement;
    const pts = thin(pt.outer, Math.max(16, Math.min(90, Math.floor(4000 / parts.length)))).map(([x, y]) => project(toModel(m, x, y)));
    const nz: V3 = [m[8], m[9], m[10]];
    const len = Math.hypot(...nz) || 1;
    const k = Math.abs((nz[0] * light[0] + nz[1] * light[1] + nz[2] * light[2]) / len);
    const depth = pts.reduce((a, p) => a + p[2], 0) / pts.length;
    return { pts, fill: shade(0.62 + 0.42 * k), depth };
  }).sort((a, b) => a.depth - b.depth);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of faces) for (const p of f.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const { sc, ox, oy } = fitBox(x0, y0, x1, y1, 14);
  let body = `<ellipse cx="${n1(VW / 2)}" cy="${n1(y1 * sc + oy + 4)}" rx="${n1((x1 - x0) * sc * 0.46)}" ry="6" fill="#000" fill-opacity=".12"/>`;
  for (const f of faces) {
    body += `<path d="M${f.pts.map((p) => `${n1(p[0] * sc + ox)} ${n1(p[1] * sc + oy)}`).join("L")}Z" fill="${f.fill}" stroke="rgba(60,40,20,.5)" stroke-width=".5" stroke-linejoin="round"/>`;
  }
  return `${svgOpen}${body}</svg>`;
}
