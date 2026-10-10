/**
 * Plans and their limits, in one place so they are easy to change. The database enforces the
 * same limits (supabase/migrations/*_plan_limits.sql); keep both in sync.
 */
import type { Params } from "@/lib/hinge";
import type { Plan } from "@/lib/supabase/types";

export type { Plan };

export const PRICES = { monthly: 9, yearly: 79, currency: "USD" } as const;

export const FREE_PROJECT_LIMIT = 3;

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
  { feature: "Letters and future tools", free: "Preview", pro: "✓" },
];

export const PRO_BENEFITS = [
  "Clean SVG export, no mark",
  "Unlimited cloud projects",
  "Pill, polygon and cylinder boxes",
  "Wave, relief and serpentine hinges",
  "Letters and every future tool",
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
