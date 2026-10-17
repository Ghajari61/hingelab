import { NextResponse, type NextRequest } from "next/server";
import { currentPlan } from "@/lib/billing/plan";
import { anyProvider } from "@/lib/ai/providers/config";
import { COSTS } from "@/lib/ai/studio/credits";
import { directorTurn } from "@/lib/ai/studio/director";
import { directorRequestSchema, firstIssue, MAX_STUDIO_BODY } from "@/lib/ai/studio/request";
import { creditsMessage, spendCredits, StudioError } from "@/lib/ai/studio/server";
import { declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

export const maxDuration = 90;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

/** The Creative Director: a design brief from the user's words, or a review of a finished picture. */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return json({ error: "Cross-site requests are not allowed." }, 403);
  if (!isJSONRequest(request)) return json({ error: "Send JSON." }, 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_STUDIO_BODY) return json({ error: "The picture is too large. Use a smaller one." }, 413);
  const { plan, userId } = await currentPlan();
  if (!userId) return json({ error: "Sign in to use AI Studio's cloud tools." }, 401);
  if (!anyProvider(process.env) && !process.env.ANTHROPIC_API_KEY) return json({ error: "AI Studio's cloud tools are not set up on this server." }, 503);
  const text = await request.text();
  if (text.length > MAX_STUDIO_BODY) return json({ error: "The picture is too large. Use a smaller one." }, 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400); }
  const parsed = directorRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: firstIssue(parsed.error) }, 400);
  const allowed = await spendCredits(plan, userId, COSTS[parsed.data.op]);
  if (!allowed.ok) return json({ error: creditsMessage(plan, allowed.daily) }, 429, { "retry-after": String(Math.max(1, allowed.retryAfter)) });
  try {
    return json(await directorTurn(parsed.data, userId, AbortSignal.any([request.signal, AbortSignal.timeout(80_000)])), 200, { "x-hingelab-plan": plan });
  } catch (e) {
    if (e instanceof StudioError) return json({ error: e.message }, e.status);
    console.error("ai studio director failed", e);
    return json({ error: "The Creative Director could not answer. Try again." }, 500);
  }
}
