import { convertForDesktop, MAX_CONVERT_SVG } from "@/lib/desktop/convert";
import { desktopError, desktopJSON, requireDesktopUser } from "@/lib/desktop/http";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { declaredLength, isJSONRequest } from "@/lib/security/request";

export const maxDuration = 60;

const MAX_BODY = MAX_CONVERT_SVG + 64 * 1024;

/** Converts a design the server built for the app to DXF, PDF or LightBurn. */
export async function POST(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  if (!isJSONRequest(request)) return desktopError("invalid", "Send JSON.", 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_BODY) return desktopError("invalid", "This design is too large to convert. Export the SVG instead.", 413);
  const limited = await rateLimit(LIMITS.desktopGenerate, `user:${who.userId}`);
  if (!limited.ok) return tooManyRequests(limited);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return desktopError("invalid", "This design is too large to convert. Export the SVG instead.", 413);
    body = JSON.parse(text);
  } catch {
    return desktopError("invalid", "Invalid request.", 400);
  }
  try {
    const out = convertForDesktop(body);
    return desktopJSON(out.body, out.status);
  } catch (e) {
    console.error("desktop convert failed", e);
    return desktopError("server_error", "The file could not be made. Try again.", 500);
  }
}
