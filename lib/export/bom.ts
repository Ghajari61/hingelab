/**
 * A parts list (bill of materials) as CSV: every part of a generator design with its finished size,
 * area, cut length and score length, identical parts counted together, and totals. Sizes are the
 * parts as drawn, before the kerf the export adds.
 */
import { signedArea } from "@/lib/generators/geom";
import type { Contour, GenPart } from "@/lib/generators/types";

export interface BomRow {
  name: string;
  qty: number;
  /** Width and height of the part as cut, mm. */
  w: number;
  h: number;
  t: number;
  /** Area of material in one part (outline minus holes), cm². */
  area: number;
  /** Length of every cut line of one part (outline and holes), mm. */
  cut: number;
  /** Length of every score line of one part, mm. */
  score: number;
  holes: number;
  engraved: boolean;
}

const perimeter = (c: Contour) => c.reduce((n, q, i) => { const r = c[(i + 1) % c.length]; return n + Math.hypot(r[0] - q[0], r[1] - q[1]); }, 0);
const lineLength = (c: Contour) => c.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - c[i][0], q[1] - c[i][1]), 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
/** A part's name without its running number, so "Porch post 3" counts with "Porch post 1". */
const baseName = (n: string) => n.replace(/\s+\d+(?=\s*(\(|$))/, "").trim();

export function bomRows(parts: GenPart[], T: number): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const p of parts) {
    const xs = p.outer.map((q) => q[0]), ys = p.outer.map((q) => q[1]);
    const w = r1(Math.max(...xs) - Math.min(...xs)), h = r1(Math.max(...ys) - Math.min(...ys)), t = p.t ?? T;
    const area = r1((Math.abs(signedArea(p.outer)) - p.holes.reduce((n, c) => n + Math.abs(signedArea(c)), 0)) / 100);
    const cut = Math.round(perimeter(p.outer) + p.holes.reduce((n, c) => n + perimeter(c), 0));
    const score = Math.round((p.score ?? []).reduce((n, c) => n + lineLength(c), 0));
    const name = baseName(p.name);
    const key = [name, w, h, t, area, cut, score].join("|");
    const row = rows.get(key);
    if (row) row.qty++;
    else rows.set(key, { name, qty: 1, w, h, t, area, cut, score, holes: p.holes.length, engraved: !!(p.engrave?.length || p.images?.length) });
  }
  return [...rows.values()];
}

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** The parts list as CSV (comma separated, a header row, one row per kind of part, then totals). */
export function bomCSV(rows: BomRow[], meta: { title: string; material: string; T: number }): string {
  const head = ["Part", "Qty", "Width mm", "Height mm", "Thickness mm", "Area each cm²", "Cut each mm", "Score each mm", "Holes", "Engraved"];
  const lines = [
    [`# ${meta.title}`], [`# Material: ${meta.material}, ${meta.T} mm. Sizes are before kerf.`],
    head,
    ...rows.map((r) => [r.name, r.qty, r.w, r.h, r.t, r.area, r.cut, r.score, r.holes, r.engraved ? "yes" : "no"]),
  ];
  const tot = rows.reduce((a, r) => ({ qty: a.qty + r.qty, area: a.area + r.area * r.qty, cut: a.cut + r.cut * r.qty, score: a.score + r.score * r.qty }), { qty: 0, area: 0, cut: 0, score: 0 });
  lines.push(["Total", tot.qty, "", "", "", r1(tot.area), Math.round(tot.cut), Math.round(tot.score), "", ""]);
  return lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}
