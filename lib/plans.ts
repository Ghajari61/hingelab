/**
 * Plans and their limits, in one place so they are easy to change. The database enforces the
 * same limits (supabase/migrations/*_plan_limits.sql); keep both in sync.
 */
import type { Params } from "@/lib/hinge";
import type { Plan } from "@/lib/supabase/types";

export type { Plan };

/**
 * Prices for new checkouts. `legacyMonthly` / `legacyYearly` are the Pro prices already on
 * existing subscriptions ($9 / $79). Those Stripe prices are never edited; new checkouts use
 * `monthly` / `yearly` and the Business and Lifetime prices below.
 */
export const PRICES = {
  monthly: 12,
  yearly: 99,
  businessMonthly: 29,
  businessYearly: 290,
  lifetime: 179,
  legacyMonthly: 9,
  legacyYearly: 79,
  currency: "USD",
} as const;

/** First Founder Lifetime buyers. The live count comes from the database. */
export const FOUNDER_CAP = 200;

/** Items in one batch (names, table numbers, or copies). Business has no plan cap. */
export const BATCH_FREE = 5;
export const BATCH_PRO = 30;

/**
 * What each plan allows: the one source for the pricing table, the FAQ, the upgrade dialog and the
 * Terms. Free downloads nothing, so it has nothing to license.
 */
export const LICENSES = {
  free: "Designing and previewing for personal use. Free has no downloads.",
  pro: "Personal use, and selling the physical items you cut from your exports.",
  business: "Everything Pro allows, plus work for clients and selling or sharing the exported files themselves.",
} as const;

/** Stated on the Business card and in the Terms. */
export const COMMERCIAL_LICENSE = "Business includes a commercial-use license: personal use and selling the physical items you cut, as on Pro, plus work for clients and selling the exported files, without a per-item royalty to HingeLab.";

/** Shown on the Business card. Not enforced yet — there is no device or seat ledger. */
export const BUSINESS_SEATS = "Up to 3 devices signed in at once";

/** Cloud projects the Free plan may keep. Zero: Free can try the editors, but cannot save. */
export const FREE_PROJECT_LIMIT = 0;

/** Shown wherever Free tries to save a project or download a cut file. */
export const EXPORT_DENIED = "Saving and exporting need Pro. Upgrade to download cut files and keep cloud projects.";

/** Parametric on the Free plan: library shapes, parallel fins, at most this many parts. */
export const FREE_PARAMETRIC_PARTS = 30;

/** Hinge Box options open to the Free plan. Everything else is Pro. */
export const FREE_SHAPES: readonly Params["shape"][] = ["rect"];
export const FREE_PATTERNS: readonly Params["pattern"][] = ["straight"];

export const SHAPE_NAMES: Record<Params["shape"], string> = { rect: "Rounded", pill: "Pill", poly: "Polygon", cyl: "Cylinder" };
export const PATTERN_NAMES: Record<Params["pattern"], string> = { straight: "Straight", wave: "Wave", relief: "Relief", serpentine: "Serpentine", honeycomb: "Honeycomb" };

/** Rows of the pricing table (landing page and upgrade dialog). */
export const PLAN_ROWS: { feature: string; free: string; pro: string }[] = [
  { feature: "Generator and 3D preview", free: "✓", pro: "✓" },
  { feature: "Save and export", free: "—", pro: "Clean SVG, DXF, PDF, LightBurn" },
  { feature: "Cloud projects", free: "—", pro: "Unlimited" },
  { feature: "Shapes and patterns", free: "Rounded + Straight", pro: "All" },
  { feature: "Letters and future tools", free: "Preview", pro: "✓" },
  { feature: "Parametric sculptures", free: `Library shapes as parallel fins, up to ${FREE_PARAMETRIC_PARTS} parts (preview)`, pro: "Your 3D files, photos and formulas, every method" },
  { feature: "Batch generation", free: `Up to ${BATCH_FREE} items (preview)`, pro: `Up to ${BATCH_PRO} items` },
];

export const PRO_BENEFITS = [
  "Save projects and export clean cut files",
  "Unlimited cloud projects",
  "Pill, polygon and cylinder boxes",
  "Wave, relief, serpentine and honeycomb hinges",
  "Letters and every future tool",
  "Parametric sculptures from your own 3D files and photos",
];

export function planOf(value: unknown): Plan {
  return value === "pro" || value === "business" || value === "lifetime" ? value : "free";
}

/** Pro stays on this long past the paid period while Stripe's renewal webhook is on its way. */
export const PERIOD_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The plan a profile really has: Pro or Business only while `plan` (written by the Stripe webhook)
 * says so and the paid period has not ended more than the grace period ago, so a missed downgrade
 * webhook cannot keep a subscription on for ever. Lifetime never ends. Website and desktop app
 * both use this.
 */
export function effectivePlan(plan: unknown, periodEnd: string | null | undefined, now = Date.now()): Plan {
  const p = planOf(plan);
  if (p === "lifetime") return "lifetime";
  if (p !== "pro" && p !== "business") return "free";
  if (!periodEnd) return p;
  const end = Date.parse(periodEnd);
  return Number.isNaN(end) || end + PERIOD_GRACE_MS >= now ? p : "free";
}

/** Pro, Founder Lifetime and Business all include today's Pro features. */
export function hasPro(plan: Plan): boolean {
  return plan === "pro" || plan === "lifetime" || plan === "business";
}

export function planLabel(plan: Plan): string {
  if (plan === "business") return "Business";
  if (plan === "lifetime") return "Founder Lifetime";
  if (plan === "pro") return "Pro";
  return "Free";
}

/** free < pro = lifetime < business. */
export function planRank(plan: Plan): number {
  if (plan === "business") return 2;
  if (plan === "pro" || plan === "lifetime") return 1;
  return 0;
}

export type Entitlements = {
  tier: Plan;
  /** Clean export, every shape, letters, parametric, unlimited cloud projects. */
  pro: boolean;
  /** Download cut files and save projects. Free never can. */
  canExport: boolean;
  /** Kept for preview SVGs on Free; Free never downloads a file. */
  watermark: boolean;
  projectLimit: number;
  /** Null when this plan has no batch cap. The editor's own safety cap still applies. */
  batchLimit: number | null;
  /**
   * Devices signed in at once. TODO: not enforced. There is no seat ledger yet; this is only
   * the number the pricing page and Business card state.
   */
  seats: number;
  commercialUse: boolean;
  prioritySupport: boolean;
};

/**
 * What `user` is allowed to do. Pass `{ open: true }` for the no-account editor (Supabase is not
 * configured): every feature stays open and batches are not plan-capped, which is how that editor
 * works today.
 */
export function getEntitlements(user: Plan | { plan?: unknown } | null | undefined, opts?: { open?: boolean }): Entitlements {
  if (opts?.open) {
    return { tier: "pro", pro: true, canExport: true, watermark: false, projectLimit: Infinity, batchLimit: null, seats: 1, commercialUse: false, prioritySupport: false };
  }
  const tier = typeof user === "object" && user !== null ? planOf(user.plan) : planOf(user);
  const pro = hasPro(tier);
  const business = tier === "business";
  return {
    tier,
    pro,
    canExport: pro,
    watermark: !pro,
    projectLimit: pro ? Infinity : FREE_PROJECT_LIMIT,
    batchLimit: business ? null : tier === "free" ? BATCH_FREE : BATCH_PRO,
    seats: business ? 3 : 1,
    commercialUse: business,
    prioritySupport: business,
  };
}

export function canUseShape(plan: Plan, shape: Params["shape"]): boolean {
  return hasPro(plan) || FREE_SHAPES.includes(shape);
}

export function canUsePattern(plan: Plan, pattern: Params["pattern"]): boolean {
  return hasPro(plan) || FREE_PATTERNS.includes(pattern);
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

/** Why a Letters design cannot be built on this plan (null = allowed). Export still needs Pro. */
export function lettersLock(plan: Plan, p: { mode: string; text: string }): string | null {
  if (hasPro(plan) || isSingleLetterBox(p)) return null;
  return "Letters is a Pro feature. Design anything here; on the Free plan you can preview a Letter Box of a single letter.";
}

const SOURCE_NAMES: Record<string, string> = { mesh: "Importing a 3D file", image: "Photo relief", text: "Text sculptures", formula: "Formula shapes" };
/** Sources the Free plan may design with (export still needs Pro): library shapes and wall-art patterns. */
const FREE_SOURCES = new Set(["library", "pattern"]);
const METHOD_NAMES: Record<string, string> = { stacked: "Stacked layers", waffle: "Waffle", radial: "Radial fins", curveNormal: "Fins along a curve", folded: "Folded nets" };

/**
 * Pro features a Parametric design uses that the plan does not include (empty = allowed).
 * `partCount` is checked only when known (after slicing). "Along a curve" builds from formulas,
 * so it is locked by its method alone.
 */
export function parametricLocks(plan: Plan, p: { source: { kind: string }; method: string }, partCount?: number): string[] {
  if (hasPro(plan)) return [];
  const out: string[] = [];
  if (p.method !== "curveNormal" && !FREE_SOURCES.has(p.source.kind)) out.push(SOURCE_NAMES[p.source.kind] ?? "This source");
  if (p.method !== "parallel") out.push(METHOD_NAMES[p.method] ?? "This method");
  if (partCount !== undefined && partCount > FREE_PARAMETRIC_PARTS) out.push(`More than ${FREE_PARAMETRIC_PARTS} parts (this design has ${partCount})`);
  return out;
}

/** One sentence for the upgrade dialog, or null when the design is allowed to be built. Export still needs Pro. */
export function parametricLock(plan: Plan, p: { source: { kind: string }; method: string }, partCount?: number): string | null {
  const locks = parametricLocks(plan, p, partCount);
  if (!locks.length) return null;
  const what = locks.length > 1 ? `${locks.slice(0, -1).join(", ")} and ${locks[locks.length - 1]}` : locks[0];
  return `${what} ${locks.length > 1 ? "need" : "needs"} Pro. On the Free plan you can preview library shapes as parallel fins with up to ${FREE_PARAMETRIC_PARTS} parts.`;
}

/** Whether this plan may save a project or download a cut file. */
export function canExport(plan: Plan): boolean {
  return hasPro(plan);
}

export function needsWatermark(plan: Plan): boolean {
  return !hasPro(plan);
}

export function projectLimit(plan: Plan): number {
  return getEntitlements(plan).projectLimit;
}

/** Subscription statuses that keep Pro. `past_due` keeps it while Stripe retries the card. */
export function planForStatus(status: string | null | undefined): Plan {
  return status === "active" || status === "trialing" || status === "past_due" ? "pro" : "free";
}

/**
 * Paid status plus the Stripe price. Unknown prices stay Pro, so existing $9/$79 subscriptions
 * and any price this server does not recognise keep Pro features. Business prices are the new
 * PRICE_BUSINESS_* env ids only.
 */
export function planForPrice(status: string | null | undefined, priceId: string | null | undefined): Plan {
  if (planForStatus(status) !== "pro") return "free";
  const business = [process.env.PRICE_BUSINESS_MONTHLY, process.env.PRICE_BUSINESS_YEARLY].filter(Boolean);
  if (priceId && business.includes(priceId)) return "business";
  return "pro";
}

/** Copy for a subscriber still on the original Pro price. Null for every other price. */
export function lockedPriceCopy(priceId: string | null | undefined): string | null {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return `Your price is locked at $${PRICES.legacyMonthly}/month`;
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO_YEARLY) return `Your price is locked at $${PRICES.legacyYearly}/year`;
  return null;
}

function textLines(value: unknown): number {
  if (typeof value !== "string") return 0;
  return value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length;
}

/**
 * How many items one export or batch would make: names, table numbers, or copies, multiplied when
 * a name list is also copied. Does not change how a generator builds those items.
 */
export function designBatchCount(params: unknown): number {
  if (!params || typeof params !== "object") return 1;
  const p = params as Record<string, unknown>;
  const job = p.job as { names?: unknown } | undefined;
  const sheet = p.sheet as { copies?: unknown } | undefined;
  const names = textLines(job?.names);
  const batch = p.batch as { mode?: unknown; from?: unknown; to?: unknown; list?: unknown } | undefined;
  let tables = 0;
  if (batch && typeof batch === "object") {
    if (batch.mode === "list") tables = textLines(batch.list);
    else if (typeof batch.from === "number" && typeof batch.to === "number") tables = Math.max(0, Math.floor(batch.to) - Math.floor(batch.from) + 1);
  }
  const items = Math.max(names, tables, 1);
  const copies = typeof sheet?.copies === "number" && sheet.copies > 1 ? Math.floor(sheet.copies) : 1;
  return items * copies;
}

/** Why this batch is over the plan, or null when it is allowed. */
export function batchLimitMessage(plan: Plan, count: number, open = false): string | null {
  const limit = getEntitlements(plan, { open }).batchLimit;
  if (limit == null || count <= limit) return null;
  if (plan === "free" && count <= BATCH_PRO) {
    return `This batch has ${count} items. The Free plan allows ${limit} per batch. Pro allows ${BATCH_PRO}.`;
  }
  return `This batch has ${count} items. Your plan allows ${limit} per batch. Business allows unlimited batches.`;
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
