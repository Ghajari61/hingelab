/**
 * Text style shared by the generators whose design is mostly words (signs, toppers, key holders,
 * table numbers): letter case, slant, width, thickening and a curve. The defaults change nothing,
 * so designs saved before these settings existed come out exactly as they did.
 */
import { differenceShapes, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, rect } from "./geom";
import { bridgeIslands } from "./shadowbox/islands";
import { orient } from "./shapes";
import type { Contour, Pt, SectionSpec } from "./types";

export type TextCase = "as-typed" | "upper" | "lower" | "title";

export interface TextStyle {
  case: TextCase;
  /** Lean of the letters, degrees (positive leans right, like italics). */
  slant: number;
  /** Width of the letters, % of the font's own. */
  stretch: number;
  /** Grow every stroke by this much, mm. */
  bold: number;
  /** Bend the text along an arc of this many degrees (positive arches up, negative smiles). */
  arc: number;
}

export const TEXT_STYLE: TextStyle = { case: "as-typed", slant: 0, stretch: 100, bold: 0, arc: 0 };

/** Where the text runs and how its letters hold together, kept at `textForm` beside the style. */
export interface TextForm {
  /** Set the text round a circle of this diameter, mm (0 = off; the curve applies instead). */
  circle: number;
  /** Bridge the closed middles of letters (O, A, B …) with bridges this wide, mm (0 = off). */
  stencil: number;
}

export const TEXT_FORM: TextForm = { circle: 0, stencil: 0 };

export function cleanTextForm(raw: unknown): TextForm {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof TextForm, unknown>>;
  const num = (v: unknown, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(0, v)) : 0);
  return { circle: num(s.circle, 2000), stencil: num(s.stencil, 5) };
}

const CASES: TextCase[] = ["as-typed", "upper", "lower", "title"];

/** The style's fields for a generator's settings, kept at `textStyle`. */
export function textStyleSection<P extends { textStyle: TextStyle; textForm: TextForm }>(show?: (p: P) => boolean): SectionSpec<P> {
  return {
    id: "textStyle", title: "Text style", open: false, show,
    help: "Fine-tune the lettering: capitals, slant, width, stroke weight, a curve or a full circle, and stencil bridges.",
    fields: [
      {
        kind: "choice", key: "textStyle.case", label: "Letters", help: "Keep the text as typed, or set it in capitals, small letters or Title Case. Scripts without capitals stay as typed.",
        options: [{ v: "as-typed", text: "As typed" }, { v: "upper", text: "ABC" }, { v: "lower", text: "abc" }, { v: "title", text: "Abc" }],
      },
      { kind: "number", key: "textStyle.slant", label: "Slant", unit: "deg", min: -20, max: 30, step: 1, help: "Leans the letters like italics; negative values lean them back." },
      { kind: "number", key: "textStyle.stretch", label: "Width", unit: "%", min: 50, max: 200, step: 1, help: "Makes the letters narrower or wider without changing their height." },
      { kind: "number", key: "textStyle.bold", label: "Thicken", unit: "mm", min: 0, max: 3, step: 0.1, help: "Grows every stroke, so thin and script fonts cut and engrave cleanly." },
      { kind: "number", key: "textStyle.arc", label: "Curve", unit: "deg", min: -180, max: 180, step: 1, help: "Bends the text along an arc: positive values arch it up like a rainbow, negative values curve it down like a smile." },
      { kind: "number", key: "textForm.circle", label: "Round a circle", unit: "mm", min: 0, max: 2000, step: 1, help: "Sets the text round a circle of this diameter, reading clockwise over the top like a badge; a long text widens the circle so it never overlaps. 0 uses Curve instead." },
      { kind: "number", key: "textForm.stencil", label: "Stencil bridges", unit: "mm", min: 0, max: 5, step: 0.1, help: "Breaks the closed middles of letters such as O, A and B with bridges this wide, so text cut through a board keeps them. 0 turns it off." },
    ],
  };
}

/** A style from saved settings: unknown or missing values fall back to the defaults. */
export function cleanTextStyle(raw: unknown): TextStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof TextStyle, unknown>>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    case: CASES.includes(s.case as TextCase) ? (s.case as TextCase) : "as-typed",
    slant: num(s.slant, -20, 30, 0),
    stretch: num(s.stretch, 50, 200, 100),
    bold: num(s.bold, 0, 3, 0),
    arc: num(s.arc, -180, 180, 0),
  };
}

export function caseText(s: string, c: TextCase | undefined): string {
  if (c === "upper") return s.toUpperCase();
  if (c === "lower") return s.toLowerCase();
  if (c === "title") return s.toLowerCase().replace(/(^|[\s\-–(/"“])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return s;
}

/** Points no further apart than `step`, so straight edges bend smoothly along a curve. */
function densify(c: Contour, step: number): Contour {
  const out: Contour = [];
  for (let i = 0; i < c.length; i++) {
    const [x0, y0] = c[i], [x1, y1] = c[(i + 1) % c.length];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** A style with the text form's settings (absent ones change nothing). */
export type FullTextStyle = Partial<TextStyle> & Partial<TextForm>;

export const isPlainStyle = (s: FullTextStyle | undefined) =>
  !s || ((s.slant ?? 0) === 0 && (s.stretch ?? 100) === 100 && (s.bold ?? 0) === 0 && (s.arc ?? 0) === 0 && !(s.circle! > 0) && !(s.stencil! > 0));

/** Letters with their closed middles held by bridges `w` wide (the loose-piece bridges of Shadow Box). */
export function stencilContours(cs: Contour[], w: number): Contour[] {
  const letters = unionShapes(cs);
  if (!letters.some((l) => l.holes.length)) return cs;
  const b = bboxOf(cs), m = 4 * w + 2;
  const box = orient(rect(b.x0 - m, b.y0 - m, b.x1 - b.x0 + 2 * m, b.y1 - b.y0 + 2 * m));
  const paper = differenceShapes([box], shapeContours(letters));
  if (!paper.length) return cs;
  const main = paper.reduce((a, q) => (q.area > a.area ? q : a));
  const held = bridgeIslands(main, paper.filter((q) => q !== main), w).shape;
  return shapeContours(differenceShapes([box], shapeContours([held])));
}

/**
 * Text outlines (a block centred on 0, 0, y down) with the style applied: width and slant about the
 * centre, then the curve (or the circle), then thickening and stencil bridges. The caller centres
 * and measures the result again.
 */
export function styleContours(cs: Contour[], s: FullTextStyle, frame?: Contour[]): Contour[] {
  if (!cs.length || isPlainStyle(s)) return cs;
  let out = cs;
  const k = (s.stretch ?? 100) / 100;
  const t = Math.tan(((s.slant ?? 0) * Math.PI) / 180);
  if (k !== 1 || t !== 0) out = out.map((c) => c.map(([x, y]) => [x * k - y * t, y] as Pt));
  if (s.arc || s.circle! > 0) {
    // When styling a single unwelded glyph, curve it in the whole word's frame.
    const b = bboxOf(frame ? frame.map(c => c.map(([x, y]) => [x * k - y * t, y] as Pt)) : out);
    const W = b.x1 - b.x0, H = b.y1 - b.y0;
    // A radius under 1.2 × the text height would fold the letters over; the curve stops there.
    const maxA = W / Math.max(1e-6, 1.2 * H);
    // Round a circle: the baseline on a circle of that diameter, at most 97 % of the way round.
    const A = s.circle! > 0
      ? Math.min(W / (s.circle! / 2), maxA, 0.97 * 2 * Math.PI)
      : Math.sign(s.arc!) * Math.min((Math.abs(s.arc!) * Math.PI) / 180, maxA, (330 * Math.PI) / 180);
    if (W > 0 && A !== 0) {
      const R = W / A, cx = (b.x0 + b.x1) / 2, y0 = b.y1;
      const step = Math.max(0.3, W / 600);
      out = out.map((c) => densify(c, step).map(([x, y]) => {
        const th = (x - cx) / R, r = R - (y - y0);
        return [cx + r * Math.sin(th), y0 + R - r * Math.cos(th)] as Pt;
      }));
    }
  }
  if (s.bold && s.bold > 0) out = shapeContours(offsetShapes(unionShapes(out), s.bold, "round"));
  if (s.stencil! > 0) out = stencilContours(out, s.stencil!);
  return out;
}
