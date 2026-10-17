import { NextResponse, type NextRequest } from "next/server";
import { currentPlan } from "@/lib/billing/plan";
import { studioProvider } from "@/lib/ai/providers/config";
import { imageCost } from "@/lib/ai/studio/credits";
import { hasPro } from "@/lib/plans";
import { firstIssue, imageRequestSchema, MAX_STUDIO_BODY } from "@/lib/ai/studio/request";
import { creditsMessage, spendCredits, studioImage, StudioError } from "@/lib/ai/studio/server";
import { declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

/** One image model call, which can take a minute. */
export const maxDuration = 120;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

/**
 * AI Studio pictures: text to image, image to design, redraw, expand and cutout. Signed-in users
 * only; each job spends credits from the plan's daily allowance. The image model is called from
 * here, so no key reaches the browser or the desktop app.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return json({ error: "Cross-site requests are not allowed." }, 403);
  if (!isJSONRequest(request)) return json({ error: "Send JSON." }, 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_STUDIO_BODY) return json({ error: "The picture is too large. Use a smaller one." }, 413);
  const { plan, userId } = await currentPlan();
  if (!userId) return json({ error: "Sign in to use AI Studio's cloud tools." }, 401);
  if (!studioProvider(process.env)) return json({ error: "AI Studio's cloud tools are not set up on this server." }, 503);
  const text = await request.text();
  if (text.length > MAX_STUDIO_BODY) return json({ error: "The picture is too large. Use a smaller one." }, 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400); }
  const parsed = imageRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: firstIssue(parsed.error) }, 400);
  const d = parsed.data;
  const quality = (d.op === "generate" || d.op === "restyle") && d.quality === "high" && hasPro(plan) ? "high" : "medium";
  const allowed = await spendCredits(plan, userId, imageCost(d.op, quality));
  if (!allowed.ok) return json({ error: creditsMessage(plan, allowed.daily) }, 429, { "retry-after": String(Math.max(1, allowed.retryAfter)) });
  try {
    return json(await studioImage(d, userId, AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]), undefined, plan), 200, { "x-hingelab-plan": plan });
  } catch (e) {
    if (e instanceof StudioError) return json({ error: e.message }, e.status);
    console.error("ai studio image failed", e);
    return json({ error: "The picture could not be made. Try again." }, 500);
  }
}
