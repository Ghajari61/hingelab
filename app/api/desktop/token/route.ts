import { desktopError, desktopJSON, servicesReady, versionGate } from "@/lib/desktop/http";
import { exchangeCode, refreshTokens } from "@/lib/desktop/session";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { clientIP, declaredLength, isJSONRequest } from "@/lib/security/request";

const MAX_BODY = 4096;

/**
 * Desktop token endpoint (OAuth 2.0 for native apps). `authorization_code` exchanges the one-time
 * code from the consent page plus the PKCE verifier; `refresh_token` rotates the session's tokens.
 * Bearer tokens only, no cookies, so there is no cross-site request to forge.
 */
export async function POST(request: Request) {
  const gate = versionGate(request) ?? servicesReady();
  if (gate) return gate;
  if (!isJSONRequest(request)) return desktopError("invalid", "Send JSON.", 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_BODY) return desktopError("invalid", "Request too large.", 413);
  const limited = await rateLimit(LIMITS.desktopToken, `ip:${clientIP(request)}`);
  if (!limited.ok) return tooManyRequests(limited);
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return desktopError("invalid", "Request too large.", 413);
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return desktopError("invalid", "Invalid request.", 400);
  }
  const device = typeof body.device === "string" ? body.device.replace(/[\u0000-\u001f]/g, "").slice(0, 120) : "";
  let out;
  if (body.grant_type === "authorization_code") out = await exchangeCode(body.code, body.code_verifier, body.redirect_uri, device);
  else if (body.grant_type === "refresh_token") out = await refreshTokens(body.refresh_token);
  else return desktopJSON({ error: "unsupported_grant_type" }, 400);
  if ("error" in out) return desktopJSON({ error: out.error }, out.status);
  return desktopJSON(out, 200, { pragma: "no-cache" });
}
