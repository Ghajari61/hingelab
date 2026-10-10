/**
 * A generator's assembled design seen from the front, as a small SVG: parts in their places,
 * stacked by height, engraving dark. Parts standing upright are drawn face on; parts lying under
 * them (a stand's base) are drawn edge on. Assemblies with turned or leaning parts (boxes) are drawn
 * in a three-quarter view instead. For preset thumbnails and help figures.
 */
import { unionShapes } from "@/lib/letters/polygon";
import { bboxOf, signedArea } from "./geom";
import { placePoint, type V3 } from "./place";
import type { Contour, GenOutput, GenPart } from "./types";

const WOODS = ["#D9B98C", "#E8CFA6", "#F1DDBB", "#E2C394"];
const INK = "#3B2A1C";
const EDGE = "#8A6F45";

const shift = (c: Contour, dx: number, dy: number): Contour => c.map(([x, y]) => [x + dx, y + dy]);

/** Path data for a thumbnail: points closer than `tol` to the last one kept are dropped, one decimal. */
function thumbD(c: Contour, closed: boolean, tol: number): string {
  const kept: Contour = [];
  c.forEach((p, i) => {
    const q = kept[kept.length - 1];
    if (!q || i === c.length - 1 || Math.hypot(p[0] - q[0], p[1] - q[1]) >= tol) kept.push(p);
  });
  const f = (v: number) => String(Math.round(v * 10) / 10);
  return "M" + kept.map(([x, y]) => `${f(x)},${f(y)}`).join(" L") + (closed ? " Z" : "");
}

function frontOf(p: GenPart, uprightBottom: number | null, T: number): { cs: Contour[]; engrave: Contour[]; cuts: Contour[] } | null {
  const pl = p.place ?? { x: 0, y: 0, z: 0 };
  if (uprightBottom !== null && !pl.upright) {
    const b = bboxOf([p.outer]);
    const t = p.t ?? T, y0 = uprightBottom - t;
    return { cs: [[[b.x0 + pl.x, y0], [b.x1 + pl.x, y0], [b.x1 + pl.x, y0 + t], [b.x0 + pl.x, y0 + t]]], engrave: [], cuts: [] };
  }
  const tr = (c: Contour) => {
    const a = ((pl.rot ?? 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    return shift(c.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos] as [number, number]), pl.x, pl.upright ? 0 : pl.y);
  };
  return { cs: [p.outer, ...p.holes].map(tr), engrave: (p.engrave ?? []).map(tr), cuts: (p.cuts ?? []).map(tr) };
}

const VIEW_AZ = (32 * Math.PI) / 180, VIEW_EL = (24 * Math.PI) / 180;
const toward: V3 = [Math.cos(VIEW_EL) * Math.sin(VIEW_AZ), Math.cos(VIEW_EL) * Math.cos(VIEW_AZ), Math.sin(VIEW_EL)];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Seen from the front right and above (larger y is nearer). */
const screen = (P: V3): [number, number] => [
  P[0] * Math.cos(VIEW_AZ) - P[1] * Math.sin(VIEW_AZ),
  -(-P[0] * Math.sin(VIEW_EL) * Math.sin(VIEW_AZ) - P[1] * Math.sin(VIEW_EL) * Math.cos(VIEW_AZ) + P[2] * Math.cos(VIEW_EL)),
];
const LIGHT: V3 = [-0.35, 0.55, 0.76];

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function projectedSVG(out: GenOutput, T: number, w: number, h: number): string {
  const items = out.parts.map((p, i) => {
    const pl = p.place ?? { x: 0, y: 0, z: 0 };
    const t = p.t ?? T;
    const at = (c: Contour, hh: number) => c.map(([u, v]) => placePoint(pl, u, v, hh));
    const o0 = at(p.outer, 0), o1 = at(p.outer, t);
    const mid = o0.concat(o1).reduce((a, q) => [a[0] + q[0], a[1] + q[1], a[2] + q[2]] as V3, [0, 0, 0] as V3).map((v) => v / (2 * o0.length)) as V3;
    const a = placePoint(pl, 0, 0, 0), n1 = placePoint(pl, 0, 0, 1);
    const normal: V3 = [n1[0] - a[0], n1[1] - a[1], n1[2] - a[2]];
    const topNear = dot(normal, toward) >= 0;
    const hh = topNear ? t : 0;
    const face = [p.outer, ...p.holes].map((c) => at(c, hh).map(screen));
    const quads: Contour[] = [];
    const s0 = o0.map(screen), s1 = o1.map(screen);
    for (let k = 0; k < s0.length; k++) {
      const q: Contour = [s0[k], s0[(k + 1) % s0.length], s1[(k + 1) % s0.length], s1[k]];
      const ar = signedArea(q);
      if (Math.abs(ar) > 1e-6) quads.push(ar < 0 ? q.reverse() : q);
    }
    const band = quads.length ? unionShapes(quads).flatMap((s) => [s.outer, ...s.holes]) : [];
    const light = Math.abs(dot(normal, LIGHT));
    return {
      p, i, depth: dot(mid, toward), face, band, light, a, normal, t, pts: o0.concat(o1), near: topNear,
      engrave: topNear ? (p.engrave ?? []).map((c) => at(c, t).map(screen)) : [],
      cuts: (p.cuts ?? []).map((c) => at(c, hh).map(screen)),
    };
  });
  // Painter's order: a part wholly on the viewer's side of another's slab (tabs may sit inside it) is
  // drawn after it; otherwise farther parts first.
  type It = (typeof items)[number];
  const side = (A: It, B: It) => {
    let beyond = false, behind = false, ahead = false, past = false;
    for (const P of A.pts) {
      const d = dot([P[0] - B.a[0], P[1] - B.a[1], P[2] - B.a[2]], B.normal);
      const v = B.near ? d : B.t - d;
      if (v < -0.01) behind = true;
      if (v > B.t + 0.01) beyond = true;
      if (v > 0.01) ahead = true;
      if (v < B.t - 0.01) past = true;
    }
    return !behind && beyond ? 1 : !ahead && past ? -1 : 0;
  };
  const after = items.map((A) => items.filter((B) => B !== A && (side(A, B) > 0 || side(B, A) < 0)));
  const order: It[] = [];
  const left = new Set(items);
  while (left.size) {
    const free = [...left].filter((A) => after[items.indexOf(A)].every((B) => !left.has(B)));
    const pick = (free.length ? free : [...left]).reduce((m, A) => (A.depth < m.depth ? A : m));
    order.push(pick);
    left.delete(pick);
  }
  items.splice(0, items.length, ...order);
  const all = items.flatMap((d) => [...d.face, ...d.band]);
  if (!all.length) return "";
  const bb = bboxOf(all);
  const pad = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.06;
  const vb = [bb.x0 - pad, bb.y0 - pad, bb.x1 - bb.x0 + 2 * pad, bb.y1 - bb.y0 + 2 * pad].map((v) => Math.round(v * 100) / 100);
  const sw = Math.round(vb[2] / 260 * 100) / 100;
  const tol = vb[2] / 260;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb.join(" ")}">`;
  for (const d of items) {
    const base = (d.p.tone ?? 1) < 0.6 ? "#5A4130" : WOODS[d.i % WOODS.length];
    if (d.band.length) s += `<path d="${d.band.map((c) => thumbD(c, true, tol)).join(" ")}" fill="${shade(base, 0.78)}" fill-rule="evenodd" stroke="${EDGE}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    s += `<path d="${d.face.map((c) => thumbD(c, true, tol)).join(" ")}" fill="${shade(base, 0.86 + 0.16 * d.light)}" fill-rule="evenodd" stroke="${EDGE}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    if (d.cuts.length) s += `<path d="${d.cuts.map((c) => thumbD(c, false, tol)).join(" ")}" fill="none" stroke="${EDGE}" stroke-width="${sw}"/>`;
    if (d.engrave.length) s += `<path d="${d.engrave.map((c) => thumbD(c, true, tol)).join(" ")}" fill="${INK}" fill-rule="evenodd"/>`;
  }
  return s + `</svg>`;
}

export function assembledSVG(out: GenOutput, T: number, w = 300, h = 200): string {
  if (out.parts.some((p) => p.place?.yaw || p.place?.tilt)) return projectedSVG(out, T, w, h);
  const upright = out.parts.filter((p) => p.place?.upright);
  const bottom = upright.length ? Math.max(...upright.map((p) => bboxOf([p.outer]).y1)) : null;
  const order = [...out.parts].sort((a, b) => (a.place?.upright ? 1 : 0) - (b.place?.upright ? 1 : 0) || (a.place?.z ?? 0) - (b.place?.z ?? 0));
  const drawn = order.map((p) => ({ p, f: frontOf(p, bottom, T) })).filter((d): d is { p: GenPart; f: NonNullable<ReturnType<typeof frontOf>> } => !!d.f);
  const all = drawn.flatMap((d) => d.f.cs);
  if (!all.length) return "";
  const bb = bboxOf(all);
  const pad = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.06;
  const vb = [bb.x0 - pad, bb.y0 - pad, bb.x1 - bb.x0 + 2 * pad, bb.y1 - bb.y0 + 2 * pad].map((v) => Math.round(v * 100) / 100);
  const sw = Math.round(vb[2] / 260 * 100) / 100;
  const tol = vb[2] / 260;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb.join(" ")}">`;
  drawn.forEach(({ p, f }, i) => {
    const hand = /hand/i.test(p.name);
    const fill = hand || (p.tone ?? 1) < 0.6 ? "#5A4130" : WOODS[i % WOODS.length];
    s += `<path d="${f.cs.map((c) => thumbD(c, true, tol)).join(" ")}" fill="${fill}" fill-rule="evenodd" stroke="${EDGE}" stroke-width="${sw}"/>`;
    if (f.cuts.length) s += `<path d="${f.cuts.map((c) => thumbD(c, false, tol)).join(" ")}" fill="none" stroke="${EDGE}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    if (f.engrave.length) s += `<path d="${f.engrave.map((c) => thumbD(c, true, tol)).join(" ")}" fill="${INK}" fill-rule="evenodd"/>`;
  });
  return s + `</svg>`;
}
