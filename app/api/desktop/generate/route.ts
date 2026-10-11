import { desktopError, desktopJSON, requireDesktopUser } from "@/lib/desktop/http";
import { generateDesign } from "@/lib/desktop/products";
import { desktopPlan } from "@/lib/desktop/session";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { declaredLength, isJSONRequest } from "@/lib/security/request";

export const maxDuration = 60;

/** Desktop settings are a few kB; generator text fields (custom outlines) can be larger. */
const MAX_BODY = 256 * 1024;

/**
 * Builds a desktop design on the server with the caller's plan applied: settings in, checks and
 * the SVG out. A design the plan does not include gets 403 and no SVG.
 */
export async function POST(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  if (!isJSONRequest(request)) return desktopError("invalid", "Send JSON.", 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_BODY) return desktopError("invalid", "Request too large.", 413);
  const limited = await rateLimit(LIMITS.desktopGenerate, `user:${who.userId}`);
  if (!limited.ok) return tooManyRequests(limited);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return desktopError("invalid", "Request too large.", 413);
    body = JSON.parse(text);
  } catch {
    return desktopError("invalid", "Invalid request.", 400);
  }
  try {
    const plan = await desktopPlan(who.userId);
    const out = await generateDesign(body, plan);
    return desktopJSON(out.body, out.status, { "x-hingelab-plan": plan });
  } catch (e) {
    console.error("desktop generate failed", e);
    return desktopError("server_error", "The design could not be built. Try again.", 500);
  }
}
