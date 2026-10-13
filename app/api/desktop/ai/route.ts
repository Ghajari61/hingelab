import { desktopError, desktopJSON, requireDesktopUser } from "@/lib/desktop/http";
import { desktopPlan } from "@/lib/desktop/session";
import { AIDesignError, designWithAI } from "@/lib/ai/design";
import { aiAllowance, aiConfigured, aiLimitMessage, MAX_AI_BODY, parseAIRequest } from "@/lib/ai/request";
import { declaredLength, isJSONRequest } from "@/lib/security/request";

/** Two model calls and one build. */
export const maxDuration = 60;

/**
 * The AI designer for the desktop app: the same designer as /api/ai/design, signed in with the
 * app's token. The answer's settings open in the app's workspace.
 */
export async function POST(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  if (!isJSONRequest(request)) return desktopError("invalid", "Send JSON.", 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_AI_BODY) return desktopError("invalid", "This photo is too large.", 413);
  if (!aiConfigured()) return desktopError("unavailable", "The AI designer is not set up on this server.", 503);
  const text = await request.text();
  if (text.length > MAX_AI_BODY) return desktopError("invalid", "This photo is too large.", 413);
  const req = parseAIRequest(text);
  if ("error" in req) return desktopError("invalid", req.error, 400);
  const plan = await desktopPlan(who.userId);
  const allowed = await aiAllowance(plan, who.userId);
  if (!allowed.ok) return desktopError("invalid", aiLimitMessage(plan, allowed.daily), 429, { "retry-after": String(Math.max(1, allowed.retryAfter)) });
  try {
    return desktopJSON(await designWithAI(req, plan, who.userId), 200, { "x-hingelab-plan": plan });
  } catch (e) {
    if (e instanceof AIDesignError) return desktopError("invalid", e.message, 502);
    console.error("desktop ai design failed", e);
    return desktopError("server_error", "The design could not be made. Try again.", 500);
  }
}
