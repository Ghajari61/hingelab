/**
 * Checks every state-changing API route runs before reading the body. Pure (no Next.js imports) so
 * they can be tested with plain Request objects.
 */

/**
 * True when the request may come from another site's page. Browsers send `Sec-Fetch-Site` and
 * `Origin` on every cross-site POST; only same-origin calls (our own pages) are accepted. Requests
 * with neither header come from tools such as curl, which carry no victim's cookies.
 */
export function isCrossSite(req: Request, allowedOrigins: string[] = []): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const own = new URL(req.url).origin;
  return origin !== own && !allowedOrigins.includes(origin);
}

/** JSON bodies only: an HTML form cannot send `application/json` without the page's own script. */
export function isJSONRequest(req: Request): boolean {
  return /^application\/json\b/i.test(req.headers.get("content-type") ?? "");
}

/** Declared body size, or null when the client did not say. */
export function declaredLength(req: Request): number | null {
  const n = Number(req.headers.get("content-length"));
  return Number.isFinite(n) && n >= 0 && req.headers.has("content-length") ? n : null;
}

/** The caller's IP as Vercel reports it (the platform overwrites these headers; clients cannot). */
export function clientIP(req: Request): string {
  const h = req.headers;
  const first = (v: string | null) => v?.split(",")[0]?.trim() || "";
  return first(h.get("x-vercel-forwarded-for")) || first(h.get("x-real-ip")) || first(h.get("x-forwarded-for")) || "unknown";
}

/** Origins our pages are served from besides the request's own (the canonical site URL). */
export function siteOrigins(): string[] {
  const out: string[] = [];
  for (const v of [process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]) {
    if (!v) continue;
    try { out.push(new URL(v).origin); } catch { /* not a URL */ }
  }
  return out;
}
