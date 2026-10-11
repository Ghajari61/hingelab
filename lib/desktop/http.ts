import "server-only";
import manifest from "@/desktop/releases/stable.json";
import { supabaseConfigured } from "@/lib/supabase/config";
import { minimumVersion, type ReleaseManifest } from "./releases";
import { desktopUser } from "./session";
import { clientVersion, compareVersions, formatVersion } from "./version";

export const RELEASES = manifest as ReleaseManifest;

export type DesktopErrorCode = "unauthorized" | "update_required" | "invalid" | "unavailable" | "server_error" | "unsupported_client";

const NO_STORE = { "cache-control": "no-store" };

export function desktopJSON(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function desktopError(code: DesktopErrorCode, message: string, status: number, headers: Record<string, string> = {}): Response {
  return desktopJSON({ error: code, message }, status, headers);
}

/**
 * Every desktop API call (except the update check) first passes here: the app must say which
 * version it is, and versions below the minimum get 426 so the app shows its update screen.
 */
export function versionGate(request: Request): Response | null {
  const v = clientVersion(request.headers.get("x-hingelab-client"));
  if (!v) return desktopError("unsupported_client", "This endpoint is for the HingeLab desktop app.", 400);
  const min = minimumVersion(RELEASES);
  if (compareVersions(v, min) < 0) {
    return desktopJSON({ error: "update_required", message: `This version of HingeLab is no longer supported. Update to ${formatVersion(min)} or later.`, minimumVersion: formatVersion(min) }, 426);
  }
  return null;
}

export function servicesReady(): Response | null {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return desktopError("unavailable", "Desktop sign-in is not configured on this server.", 503);
  return null;
}

/** Version gate, configuration and bearer token, in that order. */
export async function requireDesktopUser(request: Request): Promise<{ userId: string; sessionId: string } | Response> {
  const gate = versionGate(request) ?? servicesReady();
  if (gate) return gate;
  try {
    const who = await desktopUser(request);
    if (!who) return desktopError("unauthorized", "Your session has ended. Sign in again.", 401, { "www-authenticate": 'Bearer realm="hingelab-desktop"' });
    return who;
  } catch (e) {
    console.error("desktop auth failed", e);
    return desktopError("server_error", "The server could not check your session. Try again.", 500);
  }
}
