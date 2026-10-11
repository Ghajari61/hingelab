import { desktopError, servicesReady } from "@/lib/desktop/http";
import { bearer } from "@/lib/desktop/pkce";
import { revokeToken } from "@/lib/desktop/session";
import { isJSONRequest } from "@/lib/security/request";

/**
 * Desktop sign-out: revokes the session that owns the bearer access token or the refresh token in
 * the body. Holding a token is enough to end its session, so this works even after it expired and
 * is allowed for every app version (no version gate).
 */
export async function POST(request: Request) {
  const ready = servicesReady();
  if (ready) return ready;
  let refresh: unknown = null;
  if (isJSONRequest(request)) {
    try {
      const text = await request.text();
      if (text.length <= 4096) refresh = (JSON.parse(text) as { refresh_token?: unknown })?.refresh_token ?? null;
    } catch {
      // A sign-out with an unreadable body still revokes the bearer token.
    }
  }
  try {
    await revokeToken(bearer(request.headers.get("authorization")));
    await revokeToken(refresh);
  } catch (e) {
    console.error("desktop logout failed", e);
    return desktopError("server_error", "Could not sign out on the server.", 500);
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
