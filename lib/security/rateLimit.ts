import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { STUDIO_DAILY } from "@/lib/ai/studio/credits";
import { memoryLimiter, type LimitResult, type LimitRule } from "./limiter";

export type { LimitResult, LimitRule };

/** Limits per caller (signed-in user, or IP address for visitors). */
export const LIMITS = {
  /** SVG exports built on the server (Hinge Box, Letters, Pro generators). */
  export: { name: "export", limit: 40, windowSec: 60 },
  /** Parametric exports re-slice the sculpture on the server: much heavier. */
  exportHeavy: { name: "export-heavy", limit: 12, windowSec: 60 },
  checkout: { name: "checkout", limit: 10, windowSec: 600 },
  portal: { name: "portal", limit: 20, windowSec: 600 },
  /** Desktop editor: every settings change is built on the server (the app debounces edits). */
  desktopGenerate: { name: "desktop-generate", limit: 120, windowSec: 60 },
  /** Desktop sign-in and token refresh, per IP address. */
  desktopToken: { name: "desktop-token", limit: 30, windowSec: 600 },
  /** Desktop app signing its website view in (once per app start, again if the session ends). */
  desktopWebSession: { name: "desktop-web-session", limit: 20, windowSec: 600 },
  /** AI designer: each request is two paid model calls. A short burst limit and a daily allowance per plan. */
  aiDesign: { name: "ai-design", limit: 6, windowSec: 600 },
  aiDesignDayFree: { name: "ai-design-day-free", limit: 10, windowSec: 86_400 },
  aiDesignDayPro: { name: "ai-design-day-pro", limit: 60, windowSec: 86_400 },
  /** AI Studio: a burst limit per request, and daily credits per plan (a job spends its cost in credits). */
  aiStudio: { name: "ai-studio", limit: 30, windowSec: 600 },
  aiStudioDayFree: { name: "ai-studio-day-free", limit: STUDIO_DAILY.free, windowSec: 86_400 },
  aiStudioDayPro: { name: "ai-studio-day-pro", limit: STUDIO_DAILY.pro, windowSec: 86_400 },
  /** POST /api/svg: one allowance per signed-in user. SVG_DAILY_LIMIT overrides the default. */
  svgDay: { name: "svg-day", limit: svgDailyLimit(), windowSec: 86_400 },
} satisfies Record<string, LimitRule>;

function svgDailyLimit(): number {
  const n = Number(process.env.SVG_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
}

const memory = memoryLimiter();
let dbAvailable = true;

/** Callers are stored hashed, so the table never holds an IP address or a user id. */
const keyOf = (rule: LimitRule, who: string) => createHash("sha256").update(`${rule.name}:${who}`).digest("base64url").slice(0, 32);

/**
 * Counts one request. The count lives in Postgres (`rate_limit_hit`, shared by every server
 * instance); if the database cannot be reached the per-instance memory counter decides, so a
 * Supabase outage never turns rate limiting off.
 */
export async function rateLimit(rule: LimitRule, who: string): Promise<LimitResult> {
  const key = keyOf(rule, who);
  const local = memory.hit(key, rule);
  if (!dbAvailable || !process.env.SUPABASE_SERVICE_ROLE_KEY) return local;
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", { p_key: key, p_limit: rule.limit, p_window_seconds: rule.windowSec });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return local;
    return { ok: !!row.allowed && local.ok, retryAfter: Math.max(Number(row.retry_after) || 0, local.retryAfter) };
  } catch (e) {
    // The migration has not been applied yet (function missing): stop asking until the next deploy.
    if (/rate_limit_hit|function|schema cache/i.test(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))) dbAvailable = false;
    return local;
  }
}

export function tooManyRequests(r: LimitResult): Response {
  return Response.json(
    { error: "Too many requests. Wait a minute and try again." },
    { status: 429, headers: { "retry-after": String(Math.max(1, r.retryAfter)), "cache-control": "no-store" } },
  );
}
