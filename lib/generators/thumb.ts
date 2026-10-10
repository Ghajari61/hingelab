/**
 * A generator's assembled design seen from the front, as a small SVG: parts in their places,
 * stacked by height, engraving dark. Parts standing upright are drawn face on; parts lying under
 * them (a stand's base) are drawn edge on. For preset thumbnails and help figures.
 */
import { bboxOf } from "./geom";
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

export function assembledSVG(out: GenOutput, T: number, w = 300, h = 200): string {
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
    const fill = hand ? "#5A4130" : WOODS[i % WOODS.length];
    s += `<path d="${f.cs.map((c) => thumbD(c, true, tol)).join(" ")}" fill="${fill}" fill-rule="evenodd" stroke="${EDGE}" stroke-width="${sw}"/>`;
    if (f.cuts.length) s += `<path d="${f.cuts.map((c) => thumbD(c, false, tol)).join(" ")}" fill="none" stroke="${EDGE}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    if (f.engrave.length) s += `<path d="${f.engrave.map((c) => thumbD(c, true, tol)).join(" ")}" fill="${INK}" fill-rule="evenodd"/>`;
  });
  return s + `</svg>`;
}
