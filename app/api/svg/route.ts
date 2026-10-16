import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { currentPlan } from "@/lib/billing/plan";
import { hasPro } from "@/lib/plans";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";
import { laserSheetSvg } from "@/lib/security/svg";

export const maxDuration = 60;

const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";
const MAX_PROMPT = 1000;
const MAX_BODY = 8_000;

function bed(): { w: number; h: number } {
  const w = Number(process.env.SVG_BED_W);
  const h = Number(process.env.SVG_BED_H);
  return {
    w: Number.isFinite(w) && w >= 50 ? w : 900,
    h: Number.isFinite(h) && h >= 50 ? h : 600,
  };
}

function dailyLimit(): number {
  return LIMITS.svgDay.limit;
}

export async function POST(req: Request) {
  if (isCrossSite(req, siteOrigins())) {
    return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  if (!isJSONRequest(req)) return Response.json({ error: "Send JSON." }, { status: 415 });
  const length = declaredLength(req);
  if (length !== null && length > MAX_BODY) return Response.json({ error: "Request too large." }, { status: 413 });

  const { plan, userId } = await currentPlan();
  if (!userId) return Response.json({ error: "Sign in to generate an SVG." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prompt = body && typeof body === "object" && "prompt" in body ? (body as { prompt?: unknown }).prompt : undefined;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT) {
    return Response.json({ error: "prompt must be a string of at most 1000 characters" }, { status: 400 });
  }
  const quality = body && typeof body === "object" && "quality" in body ? (body as { quality?: unknown }).quality : undefined;
  if (quality === "high" && !hasPro(plan)) {
    return Response.json({ error: "High quality SVG needs Pro." }, { status: 403 });
  }

  const allowed = await rateLimit(LIMITS.svgDay, `user:${userId}`);
  if (!allowed.ok) {
    const limit = dailyLimit();
    return Response.json(
      { error: `You have used today's ${limit} SVG designs. Try again tomorrow.` },
      { status: 429, headers: { "retry-after": String(Math.max(1, allowed.retryAfter)) } },
    );
  }

  const model = quality === "high" ? OPUS : SONNET;
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content:
            "Return one SVG cut file and nothing else. Use millimetres: width and height attributes ending in mm. " +
            "Cut lines are stroke #FF0000 with fill none. No scripts, images, links, or styles. " +
            `The sheet must fit a ${bed().w} by ${bed().h} mm bed. Request: ${prompt}`,
        },
      ],
    });
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const match = text.match(/<svg[\s\S]*<\/svg>/i);
    if (!match) return Response.json({ error: "The model did not return an SVG." }, { status: 502 });
    const sheet = laserSheetSvg(match[0], bed().w, bed().h);
    if (!sheet.ok) return Response.json({ error: sheet.error }, { status: 422 });
    return new Response(sheet.svg, {
      status: 200,
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store", "x-hingelab-model": model },
    });
  } catch (e) {
    const status = e instanceof APIError && e.status ? e.status : 500;
    const message = e instanceof Error ? e.message : "SVG request failed";
    return Response.json({ error: message }, { status });
  }
}
