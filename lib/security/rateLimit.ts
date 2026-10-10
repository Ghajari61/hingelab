import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
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
} satisfies Record<string, LimitRule>;

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
