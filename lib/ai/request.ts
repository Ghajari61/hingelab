import "server-only";
/** Request checks shared by the website's and the desktop app's AI designer routes. */
import type { Plan } from "@/lib/plans";
import { LIMITS, rateLimit, type LimitResult } from "@/lib/security/rateLimit";
import { isImageDataURL } from "@/lib/security/svg";
import { MAX_IMAGE_CHARS, MAX_PROMPT, type AIDesignRequest } from "./types";

/** Largest body: the photo plus the description. */
export const MAX_AI_BODY = MAX_IMAGE_CHARS + 16 * 1024;

export function parseAIRequest(text: string): AIDesignRequest | { error: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Invalid request." };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid request." };
  const { prompt, image } = body as Record<string, unknown>;
  if (prompt !== undefined && typeof prompt !== "string") return { error: "The description must be text." };
  const p = (prompt ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (p.length > MAX_PROMPT) return { error: `Keep the description under ${MAX_PROMPT} characters.` };
  if (image !== undefined && image !== null && image !== "") {
    if (!isImageDataURL(image) || image.length > MAX_IMAGE_CHARS) return { error: "The photo must be a JPEG, PNG or WebP under 1 MB." };
  }
  if (!p && !image) return { error: "Describe the product or add a photo of it." };
  return { prompt: p, ...(image ? { image: image as string } : {}) };
}

/** The burst limit, then the plan's daily allowance. */
export async function aiAllowance(plan: Plan, userId: string): Promise<LimitResult & { daily?: boolean }> {
  const burst = await rateLimit(LIMITS.aiDesign, `user:${userId}`);
  if (!burst.ok) return burst;
  const day = await rateLimit(plan === "pro" ? LIMITS.aiDesignDayPro : LIMITS.aiDesignDayFree, `user:${userId}`);
  return day.ok ? day : { ...day, daily: true };
}

export function aiLimitMessage(plan: Plan, daily?: boolean): string {
  if (!daily) return "Too many AI designs in a short time. Wait a few minutes and try again.";
  return plan === "pro"
    ? `You have used today's ${LIMITS.aiDesignDayPro.limit} AI designs. Try again tomorrow.`
    : `You have used today's ${LIMITS.aiDesignDayFree.limit} free AI designs. Upgrade to Pro for ${LIMITS.aiDesignDayPro.limit} a day, or try again tomorrow.`;
}

/** The AI Gateway authenticates with the deployment's OIDC token on Vercel, or a gateway key elsewhere. */
export const gatewayConfigured = () => !!(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

export const aiConfigured = () => gatewayConfigured() || !!process.env.OPENAI_API_KEY;
