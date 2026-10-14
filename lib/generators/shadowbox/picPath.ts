/**
 * Stored picture outlines: closed contours as compact path data in a box whose longest side is
 * PIC_BOX units — whole numbers, a move then relative lines, `|` between brightness levels. No
 * dependencies, so the tracing worker and the settings check share it with the build.
 */
import type { Contour, Pt } from "../types";

/** Longest side of a traced picture, in path units. */
export const PIC_BOX = 1000;
/** Brightness cut-offs a picture is traced at, % (darkest first). */
export const LEVEL_CUTS = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
/** Longest stored outlines text (about 80 000 points). */
export const MAX_PIC_TEXT = 400_000;

export function encodeContours(cs: Contour[]): string {
  let out = "";
  for (const c of cs) {
    const pts: Pt[] = [];
    for (const [x, y] of c) {
      const q: Pt = [Math.round(x), Math.round(y)], l = pts[pts.length - 1];
      if (!l || l[0] !== q[0] || l[1] !== q[1]) pts.push(q);
    }
    while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    const d: number[] = [];
    for (let k = 1; k < pts.length; k++) d.push(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    out += `M${pts[0][0]} ${pts[0][1]}l${d.join(" ").replace(/ -/g, "-")}z`;
  }
  return out;
}

export function decodeContours(s: string): Contour[] {
  const out: Contour[] = [];
  let cur: Contour | null = null, move = false, half: number | null = null;
  const close = () => { if (cur && cur.length >= 3) out.push(cur); cur = null; };
  for (const tok of s.match(/[Mlz]|-?\d+/g) ?? []) {
    if (tok === "M") { close(); cur = []; move = true; half = null; continue; }
    if (tok === "l") { move = false; half = null; continue; }
    if (tok === "z") { close(); half = null; continue; }
    if (!cur) continue;
    const n = Number(tok);
    if (half === null) { half = n; continue; }
    const c: Contour = cur;
    if (move) c.push([half, n]);
    else { const l = c[c.length - 1]; if (l) c.push([l[0] + half, l[1] + n]); }
    half = null;
  }
  close();
  return out;
}

export const encodeLevels = (levels: Contour[][]) => levels.map(encodeContours).join("|");

/** Stored outlines: path data only, within the size limit and the number of levels. */
export function isPictureText(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_PIC_TEXT && /^[Mlz\d\s|-]*$/.test(v) && v.split("|").length <= LEVEL_CUTS.length;
}
