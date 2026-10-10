/**
 * Plans and their limits, in one place so they are easy to change. The database enforces the
 * same limits (supabase/migrations/*_plan_limits.sql); keep both in sync.
 */
import type { Params } from "@/lib/hinge";
import type { Plan } from "@/lib/supabase/types";

export type { Plan };

export const PRICES = { monthly: 9, yearly: 79, currency: "USD" } as const;

export const FREE_PROJECT_LIMIT = 3;

/** Parametric on the Free plan: library shapes, parallel fins, at most this many parts. */
export const FREE_PARAMETRIC_PARTS = 30;

/** Hinge Box options open to the Free plan. Everything else is Pro. */
export const FREE_SHAPES: readonly Params["shape"][] = ["rect"];
export const FREE_PATTERNS: readonly Params["pattern"][] = ["straight"];

export const SHAPE_NAMES: Record<Params["shape"], string> = { rect: "Rounded", pill: "Pill", poly: "Polygon", cyl: "Cylinder" };
export const PATTERN_NAMES: Record<Params["pattern"], string> = { straight: "Straight", wave: "Wave", relief: "Relief", serpentine: "Serpentine" };

/** Rows of the pricing table (landing page and upgrade dialog). */
export const PLAN_ROWS: { feature: string; free: string; pro: string }[] = [
  { feature: "Generator and 3D preview", free: "✓", pro: "✓" },
  { feature: "SVG export", free: "With a small “Made with HingeLab” mark", pro: "Clean" },
  { feature: "Cloud projects", free: `Up to ${FREE_PROJECT_LIMIT}`, pro: "Unlimited" },
  { feature: "Shapes and patterns", free: "Rounded + Straight", pro: "All" },
  { feature: "Letters and future tools", free: "Preview, and one-letter boxes", pro: "✓" },
  { feature: "Parametric sculptures", free: `Library shapes as parallel fins, up to ${FREE_PARAMETRIC_PARTS} parts`, pro: "Your 3D files, photos and formulas, every method" },
];

export const PRO_BENEFITS = [
  "Clean SVG export, no mark",
  "Unlimited cloud projects",
  "Pill, polygon and cylinder boxes",
  "Wave, relief and serpentine hinges",
  "Letters and every future tool",
  "Parametric sculptures from your own 3D files and photos",
];

export function planOf(value: unknown): Plan {
  return value === "pro" ? "pro" : "free";
}

export function canUseShape(plan: Plan, shape: Params["shape"]): boolean {
  return plan === "pro" || FREE_SHAPES.includes(shape);
}

export function canUsePattern(plan: Plan, pattern: Params["pattern"]): boolean {
  return plan === "pro" || FREE_PATTERNS.includes(pattern);
}

/** Pro features a Hinge Box design uses that the plan does not include (empty = allowed). */
export function hingeLocks(plan: Plan, p: Pick<Params, "shape" | "pattern">): string[] {
  const out: string[] = [];
  if (!canUseShape(plan, p.shape)) out.push(`${SHAPE_NAMES[p.shape]} shape`);
  if (!canUsePattern(plan, p.pattern)) out.push(`${PATTERN_NAMES[p.pattern]} pattern`);
  return out;
}

/** Visible characters (grapheme clusters) of a text, spaces ignored. */
export function letterCount(text: string): number {
  const t = text.replace(/\s+/gu, "");
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)].length;
}

/** The one Letters design the Free plan can export: a Letter Box of a single letter. */
export function isSingleLetterBox(p: { mode: string; text: string }): boolean {
  return p.mode === "box" && letterCount(p.text) === 1;
}

/** Why a Letters design cannot be exported on this plan (null = allowed). */
export function lettersLock(plan: Plan, p: { mode: string; text: string }): string | null {
  if (plan === "pro" || isSingleLetterBox(p)) return null;
  return "Letters is a Pro feature. Design anything here; on the Free plan you can export a Letter Box of a single letter, with the small HingeLab mark.";
}

const SOURCE_NAMES: Record<string, string> = { mesh: "Importing a 3D file", image: "Photo relief", text: "Text sculptures", formula: "Formula shapes" };
const METHOD_NAMES: Record<string, string> = { stacked: "Stacked layers", waffle: "Waffle", radial: "Radial fins", curveNormal: "Fins along a curve" };

/**
 * Pro features a Parametric design uses that the plan does not include (empty = allowed).
 * `partCount` is checked only when known (after slicing). "Along a curve" builds from formulas,
 * so it is locked by its method alone.
 */
export function parametricLocks(plan: Plan, p: { source: { kind: string }; method: string }, partCount?: number): string[] {
  if (plan === "pro") return [];
  const out: string[] = [];
  if (p.method !== "curveNormal" && p.source.kind !== "library") out.push(SOURCE_NAMES[p.source.kind] ?? "This source");
  if (p.method !== "parallel") out.push(METHOD_NAMES[p.method] ?? "This method");
  if (partCount !== undefined && partCount > FREE_PARAMETRIC_PARTS) out.push(`More than ${FREE_PARAMETRIC_PARTS} parts (this design has ${partCount})`);
  return out;
}

/** One sentence for the upgrade dialog, or null when the design is allowed. */
export function parametricLock(plan: Plan, p: { source: { kind: string }; method: string }, partCount?: number): string | null {
  const locks = parametricLocks(plan, p, partCount);
  if (!locks.length) return null;
  const what = locks.length > 1 ? `${locks.slice(0, -1).join(", ")} and ${locks[locks.length - 1]}` : locks[0];
  return `${what} ${locks.length > 1 ? "need" : "needs"} Pro. On the Free plan you can export library shapes as parallel fins with up to ${FREE_PARAMETRIC_PARTS} parts, with the small HingeLab mark.`;
}

export function needsWatermark(plan: Plan): boolean {
  return plan !== "pro";
}

export function projectLimit(plan: Plan): number {
  return plan === "pro" ? Infinity : FREE_PROJECT_LIMIT;
}

/** Subscription statuses that keep Pro. `past_due` keeps it while Stripe retries the card. */
export function planForStatus(status: string | null | undefined): Plan {
  return status === "active" || status === "trialing" || status === "past_due" ? "pro" : "free";
}

const MARK_STRIP = 8;

/**
 * Adds the Free-plan mark to an exported SVG: an 8 mm strip below the parts with
 * "Made with HingeLab" on its own engrave layer (C00). The parts themselves are untouched.
 */
export function addWatermark(svg: string): string {
  const head = /<svg\b[^>]*\bwidth="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!head) return svg;
  const W = parseFloat(head[3]);
  const H = parseFloat(head[4]);
  const H2 = Math.round((H + MARK_STRIP) * 1000) / 1000;
  const fixed = svg.replace(head[0], head[0]
    .replace(`height="${head[2]}mm"`, `height="${H2}mm"`)
    .replace(`viewBox="0 0 ${head[3]} ${head[4]}"`, `viewBox="0 0 ${head[3]} ${H2}"`));
  const x = Math.round((W - 3) * 1000) / 1000;
  const y = Math.round((H + MARK_STRIP / 2) * 1000) / 1000;
  const mark = `<g id="watermark" inkscape:groupmode="layer" inkscape:label="00 Made with HingeLab (engrave)" fill="none" stroke="#000000" stroke-width="0.1">\n`
    + `  <text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="3.5" fill="#000000" stroke="none" text-anchor="end" dominant-baseline="middle">Made with HingeLab</text>\n</g>\n`;
  return fixed.replace(/<\/svg>\s*$/, mark + "</svg>\n");
}
