/**
 * Which pages need a signed-in user, and where the middleware sends people. Pure so it can be tested
 * without Next.js or Supabase.
 */

/** Pages under /app that stay open without an account: the guest editor and the hidden debug pages. */
export const PUBLIC_APP_PATHS = ["/app/editor/local", "/app/letters-debug", "/app/parametric-debug"];

/** Sign-in pages. A signed-in user who opens one goes straight to the app. */
export const AUTH_PAGES = ["/login", "/signup"];

export const HOME_AFTER_LOGIN = "/app";
export const GUEST_EDITOR = "/app/editor/local";

export function isProtected(path: string): boolean {
  if (path !== "/app" && !path.startsWith("/app/")) return false;
  return !PUBLIC_APP_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * A redirect target taken from a query string. Only same-site paths are allowed, so a crafted
 * `?next=https://evil.example` link cannot send a user elsewhere after signing in.
 */
export function safeNext(next: string | null | undefined, fallback = HOME_AFTER_LOGIN): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  return next;
}

export type RouteInput = { path: string; search: string; signedIn: boolean; configured: boolean };

/** Returns the path to redirect to, or null to let the request through. */
export function routeDecision({ path, search, signedIn, configured }: RouteInput): string | null {
  if (!configured) {
    // No accounts yet: everything that needs one falls back to the guest editor.
    return isProtected(path) ? GUEST_EDITOR : null;
  }
  if (isProtected(path) && !signedIn) {
    return `/login?next=${encodeURIComponent(path + search)}`;
  }
  if (AUTH_PAGES.includes(path) && signedIn) {
    const next = new URLSearchParams(search).get("next");
    return safeNext(next);
  }
  return null;
}
