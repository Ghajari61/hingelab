/**
 * The paper box engine's dieline as the shell's parts: the outline and holes cut, slits and
 * perforations (as dashes) on the inner-cut layer, creases and half cuts on the score layer.
 */
import { cleanParams, getBoxStyle, type Dieline, type DielinePart, type Pt } from "@/lib/paperbox";
import type { Contour, GenOutput, GenPart } from "../types";
import type { PaperBoxParams } from "./params";

export type PaperBoxOutput = GenOutput & { info?: { warnings: string[]; outer: [number, number, number]; inner: [number, number, number]; style: string } };

const area = (c: Pt[]) => Math.abs(c.reduce((a, q, i) => { const r = c[(i + 1) % c.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;

/** A polyline as cut dashes `cut` long with `gap` between. */
export function dashes(pts: Pt[], cut: number, gap: number): Contour[] {
  const out: Contour[] = [];
  let on = true, left = cut, cur: Contour = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (d > 1e-9) {
      const s = Math.min(left, d), k = s / d;
      const q: Pt = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      if (on) cur.push(q);
      d -= s; left -= s; a = q;
      if (left <= 1e-9) {
        if (on && cur.length > 1) out.push(cur);
        on = !on; left = on ? cut : gap; cur = [q];
      }
    }
  }
  if (on && cur.length > 1) out.push(cur);
  return out;
}

export function toParts(d: Dieline, p: PaperBoxParams): GenPart[] {
  let x = 0;
  return d.parts.map((dp: DielinePart) => {
    const closed = dp.paths.filter((q) => q.type === "cut" && q.closed);
    const outer = closed.reduce((a, b) => (area(b.pts) > area(a.pts) ? b : a), closed[0]);
    const xs = outer.pts.map((q) => q[0]), w = Math.max(...xs) - Math.min(...xs);
    const part: GenPart = {
      id: dp.id, name: dp.name,
      outer: outer.pts,
      holes: closed.filter((q) => q !== outer).map((q) => q.pts),
      cuts: [
        ...dp.paths.filter((q) => q.type === "cut" && !q.closed).map((q) => q.pts),
        ...dp.paths.filter((q) => q.type === "perforation").flatMap((q) => dashes(q.pts, Math.max(0.3, p.lines.perfCut), Math.max(0.3, p.lines.perfGap))),
      ],
      score: dp.paths.filter((q) => q.type === "crease" || q.type === "halfCut").map((q) => q.pts),
      ...(dp.paths.some((q) => q.type === "engrave") ? { engrave: dp.paths.filter((q) => q.type === "engrave").map((q) => q.pts) } : {}),
      place: { x, y: 0, z: 0 },
    };
    x += w + 20;
    return part;
  });
}

/** Builds the chosen style with the shell's board thickness. */
export function buildPaperBox(p: PaperBoxParams): PaperBoxOutput {
  const style = getBoxStyle(p.style);
  if (!style) return { parts: [], stats: [], error: `Unknown box style "${p.style}".` };
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the board thickness." };
  const d = style.build(cleanParams(style, { ...p.styles[style.id], paper: "custom", thickness: p.T }));
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    parts: toParts(d, p),
    stats: [
      { label: "Outside", value: `${d.outer.map(r).join(" × ")} mm` },
      { label: "Inside", value: `${d.inner.map(r).join(" × ")} mm` },
      { label: "Pieces", value: String(d.parts.length) },
    ],
    assembly: d.assembly,
    info: { warnings: d.warnings, outer: d.outer, inner: d.inner, style: style.id },
  };
}
