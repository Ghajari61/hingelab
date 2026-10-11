import { safeNext } from "@/lib/auth/routes";
import { desktopError, desktopJSON, requireDesktopUser } from "@/lib/desktop/http";
import { webSignInPath } from "@/lib/desktop/session";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { declaredLength, isJSONRequest } from "@/lib/security/request";

const MAX_BODY = 4 * 1024;

/**
 * Signs the app's website view in: returns a same-site path (one-time token, valid once) that the
 * app opens in its website view to get a website session for the same account.
 */
export async function POST(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  if (!isJSONRequest(request)) return desktopError("invalid", "Send JSON.", 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_BODY) return desktopError("invalid", "Request too large.", 413);
  const limited = await rateLimit(LIMITS.desktopWebSession, `user:${who.userId}`);
  if (!limited.ok) return tooManyRequests(limited);
  let next = "/home";
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return desktopError("invalid", "Request too large.", 413);
    const body = text ? (JSON.parse(text) as { next?: unknown }) : {};
    if (typeof body?.next === "string" && body.next.length <= 512) next = safeNext(body.next, "/home");
  } catch {
    return desktopError("invalid", "Invalid request.", 400);
  }
  if (next.startsWith("/auth/") || next.startsWith("/api/")) next = "/home";
  try {
    const path = await webSignInPath(who.userId, next);
    if (!path) return desktopError("unavailable", "This account cannot open the website in the app.", 409);
    return desktopJSON({ path });
  } catch (e) {
    console.error("desktop web session failed", e);
    return desktopError("server_error", "Could not open the website. Try again.", 500);
  }
}
