/**
 * Text operations shared by the generators: how a block of lettering becomes manufacturing
 * geometry on a part.
 *
 * - Engrave: the letters' filled regions on the part's engrave layer.
 * - Score: the letters' outlines as thin lines on the score layer. With No Weld every glyph keeps its
 *   own closed outline, so overlapping script letters and accents still read; welded, the outline of
 *   the joined word is scored (the established behaviour).
 * - Raised (cut as separate pieces, usually in a second material): welded, the letters join into one
 *   piece grown by a border with islands bridged; with No Weld every glyph, dot and counter is its own
 *   piece, at its true outline.
 *
 * No Weld needs each glyph's outlines (`glyphs` from textBlock or ctx.text); without them a block is
 * treated as one glyph, which is the welded result. The helpers never change the remembered weld
 * settings, and old saves without these fields keep their behaviour (see cleanTextOps).
 */
import { shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { letterShapes, letterTraces, type WeldOptions } from "./weld";
import { bboxOf, pointInContour } from "./geom";
import type { Contour, FieldSpec, Pt } from "./types";

/** Lettering with each glyph's outlines when the font gave them (same frame as `contours`). */
export interface Lettering { contours: Contour[]; glyphs?: Contour[][] }

export type LetterMark = "engrave" | "score";

const closed = (c: Contour): Contour => (c.length && (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1]) ? [...c, c[0]] : c);

/** Moves lettering (contours and glyphs alike). */
export function moveLettering(t: Lettering, map: (c: Contour) => Contour): Lettering {
  return { contours: t.contours.map(map), ...(t.glyphs ? { glyphs: t.glyphs.map((g) => g.map(map)) } : {}) };
}

/** Several blocks as one: glyphs kept only when every block has them. */
export function joinLettering(blocks: Lettering[]): Lettering {
  const all = blocks.filter((b) => b.contours.length);
  const glyphs = all.every((b) => b.glyphs?.length) ? all.flatMap((b) => b.glyphs!) : undefined;
  return { contours: all.flatMap((b) => b.contours), ...(glyphs ? { glyphs } : {}) };
}

/**
 * Engraved or scored letters. Engraving is the union of the filled regions either way (an engraved
 * overlap is still filled once); scoring follows No Weld as described above.
 */
export function markLetters(t: Lettering, mark: LetterMark, noWeld = false): { engrave?: Contour[]; score?: Contour[] } {
  if (!t.contours.length) return {};
  if (mark === "engrave") return { engrave: shapeContours(unionShapes(t.contours)) };
  if (noWeld) return { score: letterTraces(t.contours, true, t.glyphs) };
  return { score: shapeContours(unionShapes(t.contours)).map(closed) };
}

/**
 * Letters cut as pieces of their own (raised on a board, or in a second material). Welded: one piece
 * (or none), grown by `border`; No Weld: every glyph region, dot and counter as drawn.
 */
export function raisedLetters(t: Lettering, o: WeldOptions & { noWeld?: boolean }): Shape[] {
  if (!t.contours.length) return [];
  return letterShapes(t.contours, o, t.glyphs);
}

/** The No Weld toggle, with the same wording in every generator. */
export function noWeldField<P>(key: string, show?: (p: P) => boolean, what = "letters", modes: readonly ("raised" | "score")[] = ["raised", "score"]): FieldSpec<P> {
  const does = [modes.includes("raised") && "raised letters are cut as separate pieces", modes.includes("score") && "scored letters keep each glyph's own outline"].filter(Boolean).join(", ");
  return {
    kind: "toggle", key, label: "No Weld", show,
    help: `Keep every glyph, dot and counter of the ${what} separate instead of welding them into one outline: ${does}. Engraving is unchanged.`,
  };
}

/** An Engrave / Score choice for lettering that only had engraving before. */
export function letterMarkField<P>(key: string, label: string, show?: (p: P) => boolean): FieldSpec<P> {
  return {
    kind: "choice", key, label, show,
    help: "Engrave fills the letters; Score traces their outlines with a thin line (much quicker, and easier on a diode laser).",
    options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }],
  };
}

/** A saved mark, or `fallback` when it is missing or not one of `allowed` (older saves). */
export function cleanMark<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** A saved No Weld flag: only an explicit `true` turns it on (older saves weld, as they always did). */
export const cleanNoWeld = (v: unknown): boolean => v === true;

/**
 * Score lines kept to the wood of a part: the runs of each line that lie inside `outer` and outside
 * every hole (sampled every `step` mm), so a scored letter crossing a slot or an opening stops at
 * its edge instead of running over the gap. Runs shorter than `minRun` mm are dropped.
 */
export function clipLines(lines: Contour[], outer: Contour, holes: Contour[], step = 0.4, minRun = 0.6): Contour[] {
  const boxes = holes.map((h) => ({ h, b: bboxOf([h]) }));
  const inWood = (q: Pt) => {
    if (!pointInContour(q, outer)) return false;
    let n = 0;
    for (const { h, b } of boxes) if (q[0] >= b.x0 && q[0] <= b.x1 && q[1] >= b.y0 && q[1] <= b.y1 && pointInContour(q, h)) n++;
    return n % 2 === 0;
  };
  const out: Contour[] = [];
  for (const line of lines) {
    let run: Contour = [], len = 0;
    const flush = () => { if (run.length > 1 && len >= minRun) out.push(run); run = []; len = 0; };
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const q: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        if (inWood(q)) { if (run.length) len += Math.hypot(q[0] - run[run.length - 1][0], q[1] - run[run.length - 1][1]); run.push(q); }
        else flush();
      }
    }
    flush();
  }
  return out;
}
