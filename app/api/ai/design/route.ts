import { NextResponse, type NextRequest } from "next/server";
import { AIDesignError, designWithAI } from "@/lib/ai/design";
import { aiAllowance, aiConfigured, aiLimitMessage, MAX_AI_BODY, parseAIRequest } from "@/lib/ai/request";
import { currentPlan } from "@/lib/billing/plan";
import { declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

/** Two model calls and one build. */
export const maxDuration = 180;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

/**
 * The AI designer: a description and/or a photo in, a design of one of HingeLab's products out
 * (its settings, plus the cut file when the plan can export it). Signed-in users only, with a
 * burst limit and a daily allowance per plan; the model is reached through the AI Gateway on the
 * server, so no key ever reaches the browser.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return json({ error: "Cross-site requests are not allowed." }, 403);
  if (!isJSONRequest(request)) return json({ error: "Send JSON." }, 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_AI_BODY) return json({ error: "Request too large." }, 413);
  const { plan, userId } = await currentPlan();
  if (!userId) return json({ error: "Sign in to use the AI designer." }, 401);
  if (!aiConfigured()) return json({ error: "The AI designer is not set up on this server." }, 503);
  const text = await request.text();
  if (text.length > MAX_AI_BODY) return json({ error: "Request too large." }, 413);
  const req = parseAIRequest(text);
  if ("error" in req) return json({ error: req.error }, 400);
  const allowed = await aiAllowance(plan, userId);
  if (!allowed.ok) return json({ error: aiLimitMessage(plan, allowed.daily) }, 429, { "retry-after": String(Math.max(1, allowed.retryAfter)) });
  try {
    return json(await designWithAI(req, plan, userId, undefined, { photoRelief: true }), 200, { "x-hingelab-plan": plan });
  } catch (e) {
    if (e instanceof AIDesignError) return json({ error: e.message }, 502);
    console.error("ai design failed", e);
    return json({ error: "The design could not be made. Try again." }, 500);
  }
}
