/**
 * Desktop sign-in (OAuth 2.0 for native apps, RFC 8252 + PKCE, RFC 7636): the app listens on a
 * loopback port, the browser approves on the website, and the one-time code is useless without the
 * verifier only the app holds. Pure helpers, shared by the consent page and the token route.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url (43 characters). Used for codes and tokens. */
export const randomToken = () => randomBytes(32).toString("base64url");

/** SHA-256, base64url (43 characters). Codes and tokens are stored only as this hash. */
export const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");

const B64URL_43 = /^[A-Za-z0-9_-]{43}$/;

/** RFC 7636: 43 to 128 unreserved characters. */
export const isVerifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(v);

/** An S256 challenge is a SHA-256 hash in base64url. */
export const isChallenge = (v: unknown): v is string => typeof v === "string" && B64URL_43.test(v);

export const isToken = (v: unknown): v is string => typeof v === "string" && B64URL_43.test(v);

/** The app's random state: 16 to 128 URL-safe characters. */
export const isState = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(v);

/** Constant-time check that the verifier hashes to the challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!isVerifier(verifier) || !isChallenge(challenge)) return false;
  const a = Buffer.from(sha256(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The only redirect the website will send a code to: the app's own loopback listener (RFC 8252
 * section 7.3). An IP literal, not "localhost", so DNS or a hosts file cannot point it elsewhere.
 */
export function isLoopbackRedirect(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  const m = /^http:\/\/127\.0\.0\.1:(\d{4,5})\/callback$/.exec(uri);
  if (!m) return false;
  const port = Number(m[1]);
  return port >= 1024 && port <= 65535;
}

/** Bearer token from an Authorization header, or null. */
export function bearer(header: string | null): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? "");
  return m ? m[1] : null;
}
