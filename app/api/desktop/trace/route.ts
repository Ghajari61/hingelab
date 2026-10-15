import { desktopError, desktopJSON, requireDesktopUser } from "@/lib/desktop/http";
import { MAX_TRACE_BODY, traceForDesktop } from "@/lib/desktop/trace";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { declaredLength, isJSONRequest } from "@/lib/security/request";

export const maxDuration = 60;

/** Traces a picture the app shrank (or an SVG file) into a generator's outlines. Nothing is kept. */
export async function POST(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  if (!isJSONRequest(request)) return desktopError("invalid", "Send JSON.", 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_TRACE_BODY) return desktopError("invalid", "This picture is too large.", 413);
  const limited = await rateLimit(LIMITS.desktopGenerate, `user:${who.userId}`);
  if (!limited.ok) return tooManyRequests(limited);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_TRACE_BODY) return desktopError("invalid", "This picture is too large.", 413);
    body = JSON.parse(text);
  } catch {
    return desktopError("invalid", "Invalid request.", 400);
  }
  try {
    const out = traceForDesktop(body);
    return desktopJSON(out.body, out.status);
  } catch (e) {
    console.error("desktop trace failed", e);
    return desktopError("server_error", "The picture could not be traced. Try again.", 500);
  }
}
