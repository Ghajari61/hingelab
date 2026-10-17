import { NextResponse, type NextRequest } from "next/server";
import { currentPlan } from "@/lib/billing/plan";
import { studioProvider } from "@/lib/ai/providers/config";
import { COSTS } from "@/lib/ai/studio/credits";
import { assistantRequestSchema, firstIssue, MAX_CHAT_IMAGE, MAX_CHAT_TEXT, MAX_CHAT_TURNS } from "@/lib/ai/studio/request";
import { assistantTurn, creditsMessage, spendCredits, StudioError } from "@/lib/ai/studio/server";
import { declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

/** A design made by the assistant runs the AI designer (two model calls and a build). */
export const maxDuration = 180;

const MAX_BODY = MAX_CHAT_TURNS * (MAX_CHAT_TEXT + 64) + MAX_CHAT_IMAGE + 8_000;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

/** The AI Studio assistant: a chat turn that can suggest laser settings, make a product design or prepare a picture. */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return json({ error: "Cross-site requests are not allowed." }, 403);
  if (!isJSONRequest(request)) return json({ error: "Send JSON." }, 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_BODY) return json({ error: "The conversation is too long. Start a new one." }, 413);
  const { plan, userId } = await currentPlan();
  if (!userId) return json({ error: "Sign in to use the assistant." }, 401);
  if (!studioProvider(process.env)) return json({ error: "The assistant is not set up on this server." }, 503);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "The conversation is too long. Start a new one." }, 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400); }
  const parsed = assistantRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: firstIssue(parsed.error) }, 400);
  const allowed = await spendCredits(plan, userId, COSTS.assistant);
  if (!allowed.ok) return json({ error: creditsMessage(plan, allowed.daily) }, 429, { "retry-after": String(Math.max(1, allowed.retryAfter)) });
  try {
    return json(await assistantTurn(parsed.data, plan, userId, AbortSignal.any([request.signal, AbortSignal.timeout(170_000)])), 200, { "x-hingelab-plan": plan });
  } catch (e) {
    if (e instanceof StudioError) return json({ error: e.message }, e.status);
    console.error("ai studio assistant failed", e);
    return json({ error: "The assistant could not answer. Try again." }, 500);
  }
}
