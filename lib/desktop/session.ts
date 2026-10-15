import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { planOf, type Plan } from "@/lib/plans";
import { bearer, isChallenge, isLoopbackRedirect, isToken, isVerifier, randomToken, sha256, verifyPkce } from "./pkce";
import type { DesktopTokens } from "./types";

/** A one-time code lives just long enough for the app to exchange it. */
export const CODE_TTL = 120;
/** Access tokens are short; the app refreshes them silently. */
export const ACCESS_TTL = 15 * 60;
/** Refresh tokens rotate on every use and expire after 30 days without use. */
export const REFRESH_TTL = 30 * 24 * 60 * 60;
/** Pro stays on this long past the paid period while Stripe's renewal webhook is on its way. */
export const PERIOD_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export type TokenError = { error: "invalid_request" | "invalid_grant" | "server_error"; status: number };

/** Consent page: a code bound to the signed-in user, the app's PKCE challenge and its loopback URL. */
export async function createAuthCode(userId: string, challenge: string, redirectURI: string): Promise<string> {
  if (!isChallenge(challenge) || !isLoopbackRedirect(redirectURI)) throw new Error("invalid desktop authorization request");
  const code = randomToken();
  const { error } = await createAdminClient().rpc("desktop_code_create", { p_user: userId, p_code_hash: sha256(code), p_challenge: challenge, p_redirect: redirectURI, p_ttl_seconds: CODE_TTL });
  if (error) throw error;
  return code;
}

async function issueTokens(userId: string, device: string): Promise<DesktopTokens> {
  const access = randomToken();
  const refresh = randomToken();
  const { error } = await createAdminClient().rpc("desktop_session_create", {
    p_user: userId, p_access_hash: sha256(access), p_access_ttl: ACCESS_TTL, p_refresh_hash: sha256(refresh), p_refresh_ttl: REFRESH_TTL, p_device: device,
  });
  if (error) throw error;
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: ACCESS_TTL };
}

/** authorization_code grant: the code is used up by this call whether or not the checks pass. */
export async function exchangeCode(code: unknown, verifier: unknown, redirectURI: unknown, device: string): Promise<DesktopTokens | TokenError> {
  if (!isToken(code) || !isVerifier(verifier) || !isLoopbackRedirect(redirectURI)) return { error: "invalid_request", status: 400 };
  const { data, error } = await createAdminClient().rpc("desktop_code_take", { p_code_hash: sha256(code) });
  if (error) return { error: "server_error", status: 500 };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.expired || row.redirect_uri !== redirectURI || !verifyPkce(verifier, row.code_challenge)) return { error: "invalid_grant", status: 400 };
  return issueTokens(row.user_id, device);
}

/** refresh_token grant: rotates both tokens. Using an old refresh token again revokes the session. */
export async function refreshTokens(refresh: unknown): Promise<DesktopTokens | TokenError> {
  if (!isToken(refresh)) return { error: "invalid_request", status: 400 };
  const access = randomToken();
  const next = randomToken();
  const { data, error } = await createAdminClient().rpc("desktop_session_refresh", {
    p_refresh_hash: sha256(refresh), p_access_hash: sha256(access), p_access_ttl: ACCESS_TTL, p_refresh_hash_new: sha256(next), p_refresh_ttl: REFRESH_TTL,
  });
  if (error) return { error: "server_error", status: 500 };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.outcome !== "ok") return { error: "invalid_grant", status: 400 };
  return { access_token: access, refresh_token: next, token_type: "Bearer", expires_in: ACCESS_TTL };
}

/** The user behind the request's bearer token, or null (missing, expired or revoked). */
export async function desktopUser(request: Request): Promise<{ userId: string; sessionId: string } | null> {
  const token = bearer(request.headers.get("authorization"));
  if (!token) return null;
  const { data, error } = await createAdminClient().rpc("desktop_session_user", { p_access_hash: sha256(token) });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { userId: row.user_id, sessionId: row.session_id } : null;
}

/** Sign out: revokes the session that owns this access or refresh token. */
export async function revokeToken(token: unknown): Promise<void> {
  if (!isToken(token)) return;
  const { error } = await createAdminClient().rpc("desktop_session_revoke", { p_hash: sha256(token) });
  if (error) throw error;
}

export async function revokeAllDesktopSessions(userId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("desktop_sessions_revoke_all", { p_user: userId });
  if (error) throw error;
  return data ?? 0;
}

/**
 * The plan the desktop app gets: Pro only while `profiles.plan` (written by the Stripe webhook) says
 * so and the paid period has not ended more than the grace period ago.
 */
export function effectivePlan(plan: unknown, periodEnd: string | null | undefined, now = Date.now()): Plan {
  const p = planOf(plan);
  if (p === "lifetime") return "lifetime";
  if (p !== "pro" && p !== "business") return "free";
  if (!periodEnd) return p;
  const end = Date.parse(periodEnd);
  return Number.isNaN(end) || end + PERIOD_GRACE_MS >= now ? p : "free";
}

export async function desktopPlan(userId: string): Promise<Plan> {
  const { data, error } = await createAdminClient().from("profiles").select("plan, current_period_end").eq("id", userId).maybeSingle();
  if (error) throw error;
  return effectivePlan(data?.plan, data?.current_period_end);
}

/**
 * Signs the app's website view in as the desktop user: a one-time email sign-in token (nothing is
 * emailed) that the website's own /auth/callback turns into a session cookie, then continues to
 * `next`. Null when the account has no email address.
 */
export async function webSignInPath(userId: string, next: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: user, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) throw userError;
  const email = user?.user?.email;
  if (!email) return null;
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const hash = data?.properties?.hashed_token;
  if (!hash) return null;
  return `/auth/callback?${new URLSearchParams({ token_hash: hash, type: "email", next })}`;
}

export async function desktopProfile(userId: string) {
  const admin = createAdminClient();
  const [{ data: profile }, { data: user }] = await Promise.all([
    admin.from("profiles").select("plan, plan_status, current_period_end, email").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const meta = (user?.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  return {
    email: user?.user?.email ?? profile?.email ?? null,
    name: (meta.full_name || meta.name || "").slice(0, 120) || null,
    plan: effectivePlan(profile?.plan, profile?.current_period_end),
    status: profile?.plan_status ?? null,
    periodEnd: profile?.current_period_end ?? null,
  };
}
