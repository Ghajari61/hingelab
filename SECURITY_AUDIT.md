# HingeLab Security Audit

Audit date: 10 October 2026 · Fixes: commit `0e97d97`, deployed to https://hingelab.vercel.app · Decision record: DECISIONS.md D95

No full secret appears in this document. Key names are given; values are never printed.

---

## 1. Executive Summary

HingeLab is a Next.js 15 application on Vercel with Supabase (Auth, Postgres with Row Level Security, Storage) and Stripe (subscriptions in test mode). The audit covered the whole repository: every API route, server action, middleware, the auth flow, billing and webhook code, the plan and entitlement rules, every SVG writer, the generator engine, the database migrations and policies, client storage, headers, dependencies and the git history.

**One critical vulnerability was found and fixed.** A puzzle's engraved picture was written into the server-built SVG without escaping, and that SVG was served inline from the HingeLab origin with no CSP, attachment header or content-type protection. The export endpoint also accepted `text/plain` bodies from any site. Together, an attacker's page could make a visitor's browser post a crafted puzzle and render script on hingelab.vercel.app. Supabase session cookies are readable by JavaScript, so this could become account takeover. The picture is now validated and escaped, downloads are sandboxed attachments, and cross-site and non-JSON requests are refused.

**Five high-risk issues were fixed:**
1. Comment breakout (`--->`) in every SVG writer.
2. Cross-site request forgery on the export, checkout and portal routes.
3. Unbounded server work and no rate limiting (denial of service and cost).
4. No security headers or CSP.
5. Vulnerable build and test dependencies.

**Medium and low issues were also fixed:**
- Race conditions that let parallel inserts pass the Free plan limits.
- Pro unlocked when the Supabase configuration is missing in production.
- No database size limits on project data, and no MIME restriction on Storage.
- A cancelled second subscription removing Pro.
- Internal error text returned to users.

Every fix is covered by automated tests: 1031 unit and integration tests pass, 28 of them new. The fixes were also checked on a production build with real attack requests and a page-by-page CSP check. The database changes are applied to the hosted Supabase project.

**What remains is architectural or external.**
- The geometry engine runs in the browser for the live preview, so a determined user can rebuild Pro-only output locally. This is accepted and documented as MEDIUM.
- The CSP must allow inline scripts (Next.js without nonces).
- Some Supabase Auth dashboard settings and the whole production Stripe setup must be done by the owner.

**Final status: READY AFTER MANUAL CONFIGURATION** (details at the end).

## 2. Application Architecture Reviewed

| Layer | Components reviewed |
|---|---|
| Hosting | Vercel (Fluid compute, Node.js runtime), project `hingelab`, production `https://hingelab.vercel.app` |
| Web app | Next.js 15.5 App Router, React 19; pages under `app/`, editors under `components/` |
| API routes | `app/api/export` (server SVG/ZIP export with plan rules), `app/api/stripe/checkout`, `app/api/stripe/portal`, `app/api/stripe/webhook` |
| Auth routes | `app/auth/callback` (OAuth code, email OTP), `app/auth/signout` (POST), pages `/login`, `/signup`, `/reset-password`, `/update-password` |
| Server actions | `app/app/actions.ts` (cloud projects through the user's own Supabase client) |
| Middleware | `middleware.ts`: session refresh, `/app/*` guard, safe `next` redirects |
| Auth | Supabase Auth: email and password with confirmation, Google OAuth |
| Database | Supabase Postgres: `profiles`, `projects`, `user_presets`, `private.rate_limits`; RLS on every public table; triggers for plan limits |
| Storage | Supabase Storage bucket `models` (private; owner-only paths; Pro-only uploads) |
| Billing | Stripe Checkout and Customer Portal, webhook with signature verification; plan stored only by the service role |
| Generators | Pure TypeScript geometry (`lib/hinge`, `lib/letters`, `lib/parametric`, `lib/generators/*`) used by the browser preview and rebuilt on the server for gated exports |
| Client storage | localStorage and IndexedDB for guest projects, presets, uploaded fonts and photos |
| Third parties | Google Fonts, Hugging Face (photo depth model), Supabase, Stripe |

## 3. Threat Model

**Assets:** user accounts and sessions; users' projects, presets and uploaded files; the plan and entitlement of each user; Stripe customers and subscriptions; the service-role key and Stripe secrets; server capacity and cost; the proprietary generator logic and its gated (Pro) outputs.

**Actors:**
- Anonymous visitors.
- Signed-in Free users trying to get Pro output without paying.
- Malicious websites targeting signed-in users (CSRF, XSS delivery).
- Automated abusers (scrapers, export floods, sign-up spam).
- Attackers who obtain a crafted project or file.
- Compromised dependencies.

**Trust boundaries:**
- Browser to API routes and server actions. The browser is untrusted.
- Browser to Supabase directly. RLS is the boundary.
- Stripe to webhook. The signature is the boundary.
- Server to Supabase with the service role. Only three server modules use it.

**Principles applied:**
- The browser is untrusted. Plan, role, price, user id, payment status and entitlement are never read from the request. The plan comes from `profiles.plan` for the session user, which only the service role can write.
- Authentication is not authorization. Google sign-in gives a Free plan.
- Hidden UI and client-side checks are conveniences. Every gated export is re-checked on the server, and plan limits are enforced in Postgres triggers.
- Obfuscation is not a boundary, and an unknown URL is not private. Storage is private, with owner-only RLS paths. Downloads are generated per request and not cached (`no-store`).
- No public web application can be guaranteed to be unhackable. The remaining risks are listed in section 28.

## 4. Critical Vulnerabilities Found

### C-1. Stored/reflected XSS through the puzzle picture in server-built SVG (FIXED)
- **Where:** `lib/generators/output.ts` (`genContent` wrote `engrave.image` into `href="…"` unescaped), `lib/generators/puzzle/params.ts` (no check on the value), and `app/api/export/route.ts`. The route served the result as inline `image/svg+xml` from the site origin, with no `Content-Disposition`, no CSP and no `nosniff`. It parsed any body as JSON regardless of `Content-Type`.
- **Impact:**
  1. A malicious page could auto-submit an HTML form (`enctype="text/plain"`) to `/api/export` with a puzzle whose picture was `"/><script>…</script>`.
  2. Puzzles of 50 pieces or fewer need no plan, so this worked even for signed-out victims.
  3. The response rendered as an SVG document on hingelab.vercel.app and ran the script.
  4. Supabase SSR session cookies are not httpOnly, so the script could read the session and take over the account. A crafted shared project file could do the same when exported.
- **Fix:**
  1. Only base64 PNG/JPEG/WebP data URLs are accepted (`isImageDataURL`), in merge and in the SVG writer.
  2. The href is escaped.
  3. Every download is an attachment, with `nosniff`, `no-store` and `default-src 'none'; sandbox`.
  4. Cross-site and non-JSON requests are refused.
- **Tests:** `security.test.ts`, "puzzle pictures (the stored-XSS path)", plus `scripts/security/attack-check.mjs` against a production build.

## 5. High-Risk Vulnerabilities Found

### H-1. SVG comment breakout in every SVG writer (FIXED)
`replace(/--/g, "- -")` turned `--->` into `- -->`, which closes the comment. User text (Letters text, generator names and notes, Parametric names) could then add markup to exported files. That markup ran when a file was opened in a browser, or when the server returned it inline. **Fix:** `xmlCommentText` splits every `--` so no run of dashes can end a comment, and strips control characters. It is used by the Hinge Box, Letters, Parametric and generator writers. The golden SVG output is byte-for-byte unchanged.

### H-2. Cross-site request forgery on state-changing API routes (FIXED)
- `/api/export` accepted `text/plain` bodies and had no Origin or Sec-Fetch-Site check, which enabled C-1 and let other sites spend a user's server exports.
- `/api/stripe/checkout` and `/api/stripe/portal` likewise had no origin check. Their impact was low (they return a URL to the caller, and the response is not readable cross-site), but they are now covered too.
- **Fix:** `isCrossSite` (403) and `isJSONRequest` (415) run first on all three routes. Server actions keep Next.js's built-in Origin check. Sign-out was already POST-only.

### H-3. Unbounded server work, no rate limiting (FIXED)
- The server rebuilt any geometry it was sent, with no bounds:
  - Hinge Box dimensions and pitch (a 3 km box at 0.5 mm pitch).
  - Parametric `library.detail`: an icosphere with 4^n faces.
  - Generator piece counts and copies.
  - NaN and Infinity.
- There was no rate limit and no `maxDuration`.
- **Fix:**
  - Validation refuses out-of-range requests (`lib/billing/validate.ts`, 400). Generator settings are clamped to the editor's own ranges (`lib/generators/sanitize.ts`).
  - Body size checks run before parsing (256 kB, 1.2 MB for generators with pictures, 4.4 MB for Letters with a font).
  - `maxDuration = 60`.
  - Per-user (or per-IP) rate limits backed by Postgres.

### H-4. No security headers or Content Security Policy (FIXED)
There was no CSP, HSTS, clickjacking protection, `nosniff`, Referrer-Policy or Permissions-Policy, and `X-Powered-By` was sent. **Fix:** section 22.

### H-5. Vulnerable dependencies (FIXED)
`npm audit` reported:
- **postcss ≤ 8.5.22 (high, through Next.js):** XSS in stringify, and file disclosure through `sourceMappingURL`. It runs at build time only, on our own CSS.
- **tinypool ≤ 2.1.1 (critical):** prototype pollution leading to RCE.
- **vitest / @vitest/mocker < 4.1.11 (critical / moderate):** path traversal.

tinypool and vitest are development and test only and not deployed. The real exposure was low, but the advisories are fixed:
- `postcss` is overridden to 8.5.29.
- Vitest is upgraded to 4.1.11.
- `vite-node` 5 is added for the icon script.

`npm audit` now reports 0.

## 6. Medium-Risk Findings

### M-1. Plan limits could be passed with parallel requests (FIXED)
The `enforce_plan_limits` trigger (3 cloud projects on Free) and `limit_user_presets` (200 presets) counted rows without a lock, so simultaneous inserts all saw the old count. **Fix:** a per-user `pg_advisory_xact_lock` before counting. Integration test: 8 parallel inserts leave exactly 3 projects.

### M-2. Pro unlocked when Supabase is not configured (FIXED)
`currentPlan()` returned `pro` without Supabase configuration (intended for local guest mode). A production deployment with a missing environment variable would have given every visitor Pro exports. **Fix:** on `VERCEL_ENV=production` it now returns `free`.

### M-3. No size limit on stored project data; Storage accepted any file type (FIXED)
`projects.params` had no size limit, which allowed database bloat. The `models` bucket had a size limit but no MIME allow-list. **Fix:**
- A `projects_params_size` check (1 MB).
- `allowed_mime_types` limited to 3D models (`application/octet-stream`, `model/stl`, `model/obj`, `model/gltf-binary`, `model/gltf+json`) and photos (JPEG, PNG, WebP).

### M-4. Generator engine and Pro features are computed in the browser (ACCEPTED, residual)
The live preview needs the geometry engine in the browser.
- **Server-enforced:** Free exports of the Hinge Box, Letters and Parametric are built on the server. Pro-locked generator designs are rebuilt and re-checked on the server.
- **Built in the browser:** Free generator designs and Pro users' Parametric exports. A Free user who edits the JavaScript can rebuild Pro-only geometry locally.

This cannot be fully closed without moving the preview to the server. See section 15 for the mitigations in place and recommended.

## 7. Low-Risk Findings

- **L-1. A cancelled second subscription removed Pro (FIXED).** `customer.subscription.deleted` (or an update to `canceled`) always set Free, even when the customer had another active subscription. The store now asks Stripe for another active, trialing or past-due subscription first (`otherProSubscription`). Tested.
- **L-2. Internal error text returned to users (FIXED).** The Letters export returned `e.message` from any exception, including HarfBuzz internals. Only messages written for users (`FontError`) are returned now; other errors are logged.
- **L-3. A project's owner could be changed by its owner (FIXED, defence in depth).** RLS already prevented reading or writing other users' rows. A `keep_owner` trigger now also forbids changing `user_id` on projects and presets.
- **L-4. Trigger functions executable by API roles (FIXED).** `EXECUTE` on `handle_new_user`, `enforce_plan_limits`, `limit_user_presets`, `touch_updated_at` and `keep_owner` is revoked from `public`, `anon` and `authenticated`. Triggers still fire, as the tests show.
- **L-5. Thumbnails inserted with innerHTML (FIXED, defence in depth).** Local project thumbnails are built from numbers, but they are read back from localStorage. `inertSvgMarkup` now refuses any markup with scripts, event handlers, links, `<image>`, `<use>`, `<style>`, `foreignObject` or external `url()`.

## 8. Informational Findings

- **I-1.** Supabase SSR stores the session in cookies that JavaScript can read (by library design). That is why XSS was treated as critical. Keeping the CSP and output escaping strict matters more here than on a site with httpOnly sessions.
- **I-2.** The CSP allows `'unsafe-inline'` scripts because Next.js injects inline bootstrap scripts and the theme script runs before paint. A nonce-based CSP would need every page to render dynamically.
- **I-3.** `/app/letters-debug` and `/app/parametric-debug` are public. They are client-only tools with no data access.
- **I-4.** With "Confirm email" turned off, Supabase reports "already registered" on sign-up, and the form would show it (account enumeration). It is on in production (checked through the public settings endpoint), so sign-up does not reveal accounts. Password reset always says "If an account exists…".
- **I-5.** The local stack's `supabase/config.toml` has confirmations and secure password change off. It affects only `npx supabase start`.
- **I-6.** No secrets are committed. Tracked files and the full git history were scanned for Stripe, Supabase JWT, AWS, GitHub and private-key patterns, with no matches. `.env.local` is git-ignored.
- **I-7.** Signed-out rate limits are keyed on `x-vercel-forwarded-for`, which Vercel sets and clients cannot spoof on Vercel. On other hosts the header order would need review.
- **I-8.** Stripe is not configured in production (no keys), so all billing routes return 503 and no payment can be taken. The live-key guard (`STRIPE_ALLOW_LIVE`) refuses `sk_live_` keys until it is set to `true`.

## 9. Exact Fixes Implemented

1. **SVG output:**
   - `xmlCommentText` for every comment.
   - `escapeXml` and `isImageDataURL` for picture hrefs.
   - `mergePuzzle` drops non-image pictures.
   - `inertSvgMarkup` for thumbnails.
2. **Downloads:** `downloadHeaders()`: `content-disposition: attachment` (sanitised file name), `x-content-type-options: nosniff`, `cache-control: no-store`, `content-security-policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox`.
3. **Request checks on `/api/export`, `/api/stripe/checkout` and `/api/stripe/portal`:**
   - Cross-site requests get 403 and non-JSON requests get 415.
   - The declared and actual body sizes are checked (413).
   - A body that is not a JSON object gets 400.
4. **Validation:**
   - `hingeRequestError`: enums, finite numbers in range, name length, and a total slit estimate of at most 400 000.
   - `parametricRequestError`: method, library id, detail 0–6, formula length, and every applicable field in range.
   - `sanitizeGeneratorParams`: numbers clamped to the field ranges, choices limited to listed options, booleans, text length, fonts, pictures, copies 1–50, and sheets 1–100.
5. **Rate limits:** per user id (or IP when signed out), counted in Postgres through `public.rate_limit_hit` (keys stored as SHA-256) and in memory as a fallback. Responses are 429 with `Retry-After`.

   | Route | Limit |
   |---|---|
   | Export | 40 per minute |
   | Parametric export | 12 per minute |
   | Checkout | 10 per 10 minutes |
   | Portal | 20 per 10 minutes |

6. **Timeouts:** `export const maxDuration = 60` on `/api/export`.
7. **Plans:** `currentPlan` fails closed in production, and a second active subscription keeps Pro.
8. **Database (migration `20261011000100_security_hardening.sql`):**
   - Advisory locks in the plan-limit and preset triggers.
   - `keep_owner` triggers.
   - Params size check.
   - EXECUTE revoked on trigger functions.
   - `private.rate_limits` plus `rate_limit_hit` (service role only).
   - Storage MIME allow-list.
9. **Headers:** CSP, HSTS (on Vercel), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, X-DNS-Prefetch-Control, and `poweredByHeader: false`.
10. **Errors:** the Letters export returns only `FontError` messages.
11. **Dependencies:** postcss override, Vitest 4.1.11, vite-node 5.
12. **Hosted database:** migrations `20261010000500_user_presets` (pending from an earlier phase) and `20261011000100_security_hardening` were applied to the production project with `npx supabase db push`. `migration list` shows all six applied, and `supabase db lint` reports no issues.

## 10. Files Changed

New:
- `lib/security/svg.ts`, `lib/security/request.ts`, `lib/security/limiter.ts`, `lib/security/rateLimit.ts`, `lib/security/headers.ts`
- `lib/billing/validate.ts`, `lib/generators/sanitize.ts`
- `supabase/migrations/20261011000100_security_hardening.sql`
- `lib/security/__tests__/security.test.ts`, `lib/security/__tests__/db.integration.test.ts`
- `scripts/security/csp-check.mjs`, `scripts/security/attack-check.mjs`
- `SECURITY_AUDIT.md`

Modified:
- `app/api/export/route.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`
- `lib/billing/{events,store,plan,exportGenerator,exportHinge,exportParametric,letterFonts}.ts`
- `lib/generators/output.ts`, `lib/generators/puzzle/params.ts`
- `lib/hinge/export.ts`, `lib/parametric/export.ts`
- `lib/supabase/types.ts`
- `components/studio/StartScreen.tsx`, `components/studio/pages/ProjectsPage.tsx`
- `next.config.ts`
- `package.json`, `package-lock.json`
- `DECISIONS.md`, `PROGRESS.md`, `SETUP.md`

## 11. Authentication Protections

- **Sign-in methods:** Supabase Auth with email and password, plus Google OAuth. Production has email confirmation on (`mailer_autoconfirm: false`) and only the email and Google providers enabled. Both were checked through the public `/auth/v1/settings` endpoint.
- **Passwords:** at least 8 characters in the form (`MIN_PASSWORD`) and in Supabase.
- **Sessions:**
  - Refreshed by middleware on every page request with `supabase.auth.getUser()`, which validates with the Auth server rather than trusting the cookie.
  - Server code uses `getUser()`, never `getSession()`, for decisions.
- **Callbacks and redirects:**
  - `/auth/callback` exchanges OAuth codes and verifies email token hashes server-side.
  - `next` targets go through `safeNext` (same-site paths only, no `//host` or scheme), so there is no open redirect.
  - Sign-out is POST-only, so a link or image cannot sign a user out.
- **Password reset:** the reset message does not reveal whether an account exists.

## 12. Authorization Protections

- **Row Level Security** is on for every public table:
  - `profiles`: select-own only. Users cannot update `plan`, `plan_status` or the Stripe ids.
  - `projects` and `user_presets`: owner-only select, insert, update and delete, plus a trigger that forbids changing `user_id`.
- **Storage:** the `models` bucket is private, and its policies tie object paths to `auth.uid()`.
- **Editor pages:** `/app/editor/[id]` validates the UUID and loads through the user's client, so RLS returns nothing for other users' ids.
- **Server actions** use the session user's client, never the service role.
- **Service role:** used in exactly three server-only modules (webhook, checkout customer link, rate limiter), each marked `import "server-only"`.

## 13. Subscription / Entitlement Protections

- The plan is read on the server from `profiles.plan` for the authenticated user (`currentPlan`). No plan, price, role or status is accepted from the request.
- Only the webhook (service role) changes the plan, and it reads current state from Stripe (`subscriptions.retrieve` / `list`), not from the event payload alone.
- Plan limits are enforced in Postgres triggers, now serialized per user:
  - Free: 3 cloud projects, only the Rounded box with the Straight pattern, no Parametric projects.
  - Pro-only uploads.
- Server exports re-check every Pro rule:
  - Hinge Box: Pro shapes and patterns.
  - Letters: words, Solid and Stencil.
  - Parametric: method, source and part count.
  - Generators: `def.pro()` on the rebuilt design.
- Free exports get the watermark on the server.
- A production deployment without Supabase configuration treats everyone as Free.

## 14. Payment / Webhook Protections

- **Webhook:** verifies the `Stripe-Signature` on the raw body with `STRIPE_WEBHOOK_SECRET` and rejects unsigned or invalid requests with 400 (checked live). It handles only the five listed event types. Events are idempotent (they set state, not increments) and are resolved against Stripe's current state, so out-of-order events cannot downgrade a paying user wrongly.
- **Checkout:**
  - Price ids come from server environment variables (`STRIPE_PRICE_PRO_MONTHLY` / `YEARLY`); only `interval` comes from the request.
  - The customer and `client_reference_id` come from the session user.
  - Users already on Pro get 409.
  - Cross-site and non-JSON requests are refused, and the route is rate limited.
- **Portal:** the customer id is read from the user's own profile.
- **Keys:** `STRIPE_ALLOW_LIVE` must be exactly `true` before `sk_live_` keys are used. All Stripe keys are server-only.

## 15. Generator / Intellectual Property Protections

**Server-side, where it matters for revenue:**
- The Hinge Box, Letters and Free Parametric exports are built on the server with the plan applied.
- Pro generator designs are rebuilt and checked on the server before the file is sent.

**Client-side (accepted risk):**
- The geometry engine is in the browser bundle (minified, code-split), because the live preview needs it. Minification is not protection.
- Free generator designs and Pro users' Parametric exports are built in the browser.
- A determined user can reconstruct Pro output locally. That user still cannot get server-made exports without paying, and cannot use cloud features beyond the Free limits.

**Recommended (not implemented, product decision):**
- Move Pro-only geometry (Parametric Waffle, Radial, Folded and Curve; generator Pro modes) behind server endpoints that return only preview meshes or low-resolution previews.
- Add per-user export logging and anomaly alerts.
- Add a licence notice in the bundle.

## 16. SVG Security Protections

- Every SVG writer escapes text and attributes (`escapeXml`) and makes comments unbreakable (`xmlCommentText`).
- Pictures must be base64 PNG, JPEG or WebP data URLs. No external URLs, `javascript:` or SVG-in-SVG are allowed.
- Exported files contain no script, `foreignObject`, event handlers or external references (the server re-validates input).
- Every server download is an attachment with a sandbox CSP and `nosniff`, so even a hostile file would not run in the HingeLab origin.
- Thumbnails pass `inertSvgMarkup` before `innerHTML`.
- The other `innerHTML` uses (rulers, landing-page scenes, the Hinge inspector) render markup built only from numbers in code.
- There is no SVG import yet (planned for Studio S3). When it is added, imported files must be parsed into path geometry and never inserted as markup. Custom puzzle outlines (SVG path data typed by the user) are already parsed into numbers before anything is written.

## 17. API Security

| Route | Auth | Origin/CSRF | Body | Rate limit | Other |
|---|---|---|---|---|---|
| `POST /api/export` | Optional (plan from session) | Cross-site 403, JSON only 415 | Size limits 413, object only | 40/min (12/min Parametric) per user or IP | Validation 400, `maxDuration` 60 s, sandboxed attachment |
| `POST /api/stripe/checkout` | Required (401) | 403 / 415 | JSON | 10 per 10 min per user | Server-side price, 409 if Pro |
| `POST /api/stripe/portal` | Required (401) | 403 / 415 | JSON | 20 per 10 min per user | Own customer id only |
| `POST /api/stripe/webhook` | Stripe signature | n/a (server to server) | Raw body | Stripe-controlled | Unsigned 400 |
| `GET /auth/callback` | Code or token hash | n/a | n/a | Supabase Auth limits | `safeNext` |
| `POST /auth/signout` | Session | POST only | n/a | n/a | n/a |

## 18. Input Validation

- **Hinge Box:** shape, lid, pattern and cut style come from fixed lists. Every number must be finite and in range (for example W, D and H 10–3000 mm, pitch 0.5–500 mm, bed 50–10 000 mm). Names are at most 200 characters, and an estimated slit count over 400 000 is refused.
- **Parametric:** the method and library shape come from fixed lists, detail must be an integer 0–6, formulas are at most 2000 characters, and every editor field that applies must be in range. Thickness is 0.1–25 mm for the card presets. The resolution and `what` checks already existed.
- **Letters:** the existing `parseLetterRequest` (text length, mode, font id) and the uploaded font size limit (3 MB) are unchanged.
- **Generators:** `merge` keeps only values of the right type, then `sanitizeGeneratorParams` holds every field to the editor's range and choices. All built-in presets pass unchanged (tested).
- **Database:** CHECK constraints on product and kind, plus a 1 MB params size limit.
- **Auth forms:** email format and password length.

## 19. Rate Limiting / Abuse Prevention

- **Application limits:** see sections 9 and 17. They are counted in Postgres so all serverless instances share them. If the database call fails, the in-memory limiter still applies per instance.
- **Supabase Auth:** has its own limits on sign-up, sign-in, OTP and email sending.
- **Size and time limits:** body sizes, validation bounds and the 60-second limit put a ceiling on the cost of one request.
- **Recommended:** a Vercel Firewall rate-limit rule on `/api/*` as an outer layer (section 29), and CAPTCHA on sign-up once the forms send a token.

## 20. Database Security

- **RLS** on every public table, with policies reviewed:
  - `profiles`: select own.
  - `projects` and `user_presets`: owner CRUD.
  - Storage objects: owner prefix, with Pro-only uploads.
- **Functions:**
  - Security-definer functions set `search_path = ''`.
  - Trigger functions are not executable by API roles.
  - `rate_limit_hit` is granted to `service_role` only. The anon and authenticated roles were tested as denied.
- **`private` schema:** has no grants to `anon` or `authenticated`.
- **Integrity:** per-user advisory locks remove the plan-limit races, `keep_owner` stops ownership changes, and project params are capped at 1 MB.
- **Hosted project status:** all migrations are applied, and `supabase db lint` is clean.

## 21. Admin Security

**NOT APPLICABLE:** there is no admin interface, admin role or admin route in the application. Administrative actions (plans, users) happen only through the webhook with the service role, or in the Supabase and Stripe dashboards, which are protected by those providers' account security. Recommendation: enforce 2FA on the Supabase, Stripe, Vercel, Google Cloud and GitHub accounts (section 31).

## 22. Security Headers / CSP

On every page (`next.config.ts`, `lib/security/headers.ts`):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.googleusercontent.com;
  connect-src 'self' <supabase-origin> wss://<supabase-host> https://*.supabase.co wss://*.supabase.co
    https://huggingface.co https://*.huggingface.co https://*.hf.co;
  worker-src 'self' blob:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self';
  form-action 'self'; manifest-src 'self'; upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()
Cross-Origin-Opener-Policy: same-origin
X-DNS-Prefetch-Control: off
```

**Variations:**
- API routes skip the page CSP and set their own sandbox CSP on downloads.
- Development adds `'unsafe-eval'` and local websockets.
- Preview deployments add `https://vercel.live` for the toolbar.
- `NEXT_PUBLIC_DEPTH_MODEL_URL`'s origin is added when set.
- `X-Powered-By` is removed.

**Verification:** `scripts/security/csp-check.mjs` loaded every page and every editor on a production build with zero CSP violations. The 3D view, HarfBuzz text, manifold slicing and photo relief with ONNX were all exercised.

## 23. CSRF / CORS

- **CSRF:** the API routes refuse cross-site requests (`Sec-Fetch-Site` and `Origin`) and non-JSON bodies, which HTML forms cannot send. Server actions use Next.js's Origin check, and sign-out is POST.
- **Cookies:** Supabase cookies are `SameSite=Lax`.
- **CORS:** no route sets `Access-Control-Allow-Origin`, so browsers block cross-origin reads of every response. The API is same-origin only by design.

## 24. Secret Management

- **Server-only secrets:** `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
  - They are read only in modules marked `server-only` (`lib/supabase/admin.ts`, `lib/stripe.ts`, `lib/billing/*`, `lib/security/rateLimit.ts`), so the build fails if client code imports them.
  - None of them has a `NEXT_PUBLIC_` prefix.
- **Public values:** only the Supabase URL and anon key, the site URL, the contact email and the depth model URL are `NEXT_PUBLIC_`.
- **Production storage:** secrets are stored in Vercel environment variables, with Supabase keys from the Vercel integration.
- **Repository:** `.env.local` is git-ignored, and `.env.example` holds names only. Tracked files and the full git history contain no secret values (scanned).
- **Audit hygiene:** during the audit, keys were only piped between commands, never printed.

## 25. Dependency Security

- **`npm audit`:** 0 vulnerabilities after the fixes. It was 5 before: 2 critical and 1 high, all build-time or dev-only, plus 2 moderate.
- **Pinning:** the overrides pin `postcss` ^8.5.29 for Next.js's nested copy.
- **Supply chain:** runtime dependencies are mainstream (Next.js, React, Supabase, Stripe, three.js, manifold-3d, harfbuzzjs, onnxruntime-web, mathjs, Clipper). WebAssembly runtimes are served from our own origin (`/ort/`, `/wasm/`).
- **Recommended:** turn on Dependabot or Renovate, and run `npm audit --omit=dev` in CI.

## 26. Tests Added

`lib/security/__tests__/security.test.ts` (24 tests):
- XML escaping.
- Comment breakout for `-->`, `--->` and long dash runs.
- A hostile name inside the layered SVG comment.
- Image data URL allow-list.
- Thumbnail guard (12 hostile cases).
- Puzzle picture refused in merge, never written by the SVG writer, and refused by the server export.
- Hostile generator name in the comment.
- Cross-site, JSON, length and IP checks.
- Limiter windows and retry time.
- Download and page headers.
- Every generator preset unchanged by sanitization, and hand-made generator values clamped.
- Every Hinge Box and Parametric preset accepted, and absurd values refused with 400.
- Webhook keeps Pro with a second active or trialing subscription, and sets Free without one.

`lib/security/__tests__/db.integration.test.ts` (4 tests, local Supabase):
- Rate limiter counts and retry time; anon and authenticated roles denied.
- 8 parallel inserts keep exactly 3 Free projects.
- Owner change and a 1.2 MB params payload are refused.
- Trigger functions cannot be called, and users cannot set their own plan.

`scripts/security/attack-check.mjs`, 16 live attack requests:
- Cross-site POST and text/plain and urlencoded CSRF bodies.
- An array body, an oversized body, a giant box and a microscopic pitch.
- Icosphere detail 20.
- A Pro puzzle while signed out, and a script in the picture.
- Checkout cross-site and signed out, and portal CSRF.
- An unsigned webhook.
- A rate-limit burst.

`scripts/security/csp-check.mjs`: every page and editor, checked for CSP violations and headers.

## 27. Production Build / Test Results

| Check | Result |
|---|---|
| `npx vitest run` | 52 files, **1031 / 1031 passed** (golden Hinge Box SVGs byte-for-byte) |
| `npx tsc --noEmit -p .` | clean |
| `npx next build` | success |
| `node scripts/perf/budgets.mjs` | all budgets met |
| `npm audit` | **0 vulnerabilities** |
| `csp-check.mjs` (production build) | 0 CSP violations on 20 pages; downloads sandboxed |
| `attack-check.mjs --rate` (production build) | every attack refused; first 429 at request 41 |
| Browser flows (`g2`, `g5`, `g6`, `parametric-p5`) | pass under the CSP |
| Hosted DB: `supabase migration list` / `db lint` | 6/6 applied / no issues |
| Live: response headers on https://hingelab.vercel.app | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy and COOP present; no `X-Powered-By` |
| Live: `attack-check.mjs --rate` | every attack refused. First 429 at request 37: the limit counts per real client IP (a spoofed `X-Forwarded-For` is ignored) and is shared across instances, so the earlier test requests counted too |
| Live: `csp-check.mjs` | 0 CSP violations on 20 pages; export is a sandboxed attachment |
| Live: `scripts/shots/g6.mjs` | pass |

## 28. Remaining Risks

| Risk | Severity | Why it remains | Mitigation |
|---|---|---|---|
| Pro geometry can be rebuilt in a modified browser (M-4) | MEDIUM | The preview engine must run client-side | Server-made exports and cloud limits stay gated; move Pro-only geometry server-side if it becomes a problem |
| `'unsafe-inline'` in `script-src` | LOW | Next.js inline scripts without nonces | Strict output escaping, sandboxed downloads; move to nonces with dynamic rendering later |
| Session cookies readable by JavaScript | LOW | Supabase SSR design | The CSP, escaping and no-HTML rendering of user data |
| In-memory limiter only if the database is unreachable | LOW | Fallback | Add a Vercel Firewall rule |
| No CAPTCHA on sign-up and reset | LOW | Forms do not send tokens yet | Supabase Auth rate limits; add Turnstile before a public launch with marketing |
| Billing not configured in production | INFORMATIONAL | No Stripe keys yet | Routes return 503; follow SETUP.md |
| Third-party compromise (Supabase, Stripe, Vercel, npm) | LOW | External | 2FA, least privilege, dependency updates |

## 29. External Configuration Still Required

1. **Supabase Auth dashboard** (production project `hingelab`):
   - Turn on **leaked password protection**.
   - Turn on **Secure password change** and **Secure email change**.
   - Confirm a minimum password length of at least 8.
   - Confirm that Site URL and Redirect URLs list only `https://hingelab.vercel.app/**` (plus your custom domain).
   - Connect custom SMTP before launch.
   - Keep CAPTCHA **off** until the forms send a token.
2. **Supabase Storage:** set the global upload limit to at least 100 MB (SETUP.md) so the bucket limit applies.
3. **Stripe production setup (needed before taking payments):**
   - Keys, prices (`scripts/stripe-setup.mjs`) and the webhook endpoint with its 5 events and signing secret, set in Vercel.
   - Customer portal settings.
   - At launch, live keys and `STRIPE_ALLOW_LIVE=true`.
4. **Google Cloud OAuth client:** authorised redirect URI only `https://vwpuvormmxsydsbjimjs.supabase.co/auth/v1/callback`, and JavaScript origins limited to the production domain.
5. **Vercel:**
   - Optional Firewall rate-limit rule on `/api/*` (for example 100 requests per minute per IP).
   - Turn on Deployment Protection for preview deployments.
6. **Accounts:** enforce 2FA on the Vercel, Supabase, Stripe, Google Cloud and GitHub accounts.

## 30. Credentials That Should Be Rotated

- **None required by this audit:** no secret was found in the repository, its git history, the client bundle or logs.
- **Recommended housekeeping:**
  - The local `.env.local` holds the local stack's demo keys (not usable against production) and a short-lived `VERCEL_OIDC_TOKEN` that expires on its own. If this file was ever shared or copied off the machine, rotate whatever production keys it held.
  - Rotate the Google OAuth client secret and the Supabase service-role key if anyone outside the owner has seen them.
  - When moving Stripe to live mode, create new live keys and a new webhook signing secret. Never reuse test values.

## 31. Pre-Launch Security Checklist

| # | Item | Status |
|---|---|---|
| 1 | No unresolved CRITICAL vulnerability | FIXED (C-1) |
| 2 | No unresolved HIGH vulnerability | FIXED (H-1 to H-5) |
| 3 | User-controlled data escaped in every SVG writer | FIXED |
| 4 | Downloads cannot run as pages (attachment, nosniff, sandbox CSP) | FIXED |
| 5 | CSRF protection on state-changing routes | FIXED |
| 6 | Server-side input validation and size limits | FIXED |
| 7 | Rate limiting on export and billing routes | FIXED |
| 8 | Security headers and CSP without violations | FIXED |
| 9 | Plan read from the server, never from the request | PASS |
| 10 | Pro rules re-checked on the server for every gated export | PASS |
| 11 | Plan limits enforced in the database without races | FIXED |
| 12 | RLS on every table, users cannot change their plan | PASS |
| 13 | Storage private and owner-only, with a MIME allow-list | FIXED |
| 14 | Webhook signature verified on the raw body | PASS |
| 15 | Prices and customers decided on the server | PASS |
| 16 | Live Stripe keys blocked until launch switch | PASS |
| 17 | Secrets server-only, none in repo or history | PASS |
| 18 | Service role confined to server-only modules | PASS |
| 19 | Open redirect protection on auth callbacks | PASS |
| 20 | Email confirmation on in production | PASS |
| 21 | `npm audit` clean | FIXED |
| 22 | Hosted database migrations applied | FIXED |
| 23 | Missing configuration fails closed (no free Pro) | FIXED |
| 24 | Leaked-password protection and secure password change in Supabase | MANUAL ACTION REQUIRED |
| 25 | Stripe production keys, prices, webhook and portal | MANUAL ACTION REQUIRED (before taking payments) |
| 26 | Supabase redirect allow-list and Google OAuth origins reviewed | MANUAL ACTION REQUIRED |
| 27 | Custom SMTP for auth emails | MANUAL ACTION REQUIRED |
| 28 | 2FA on all provider accounts | MANUAL ACTION REQUIRED |
| 29 | Vercel Firewall rule on `/api/*` | MANUAL ACTION REQUIRED (recommended) |
| 30 | Admin interface secured | NOT APPLICABLE (none exists) |
| 31 | CAPTCHA on sign-up | MANUAL ACTION REQUIRED (needs a small app change first; not a blocker) |

## 32. Post-Launch Security Recommendations

1. **Monitoring and alerting:**
   - Watch `/api/export` 4xx and 429 rates and webhook failures in Vercel logs.
   - Alert on spikes of 403 "Cross-site" or 400 validation errors, which indicate probing.
2. **Dependencies:** Dependabot or Renovate weekly, `npm audit --omit=dev` in CI, and Next.js security releases applied promptly.
3. **Reviews:**
   - Re-run `scripts/security/attack-check.mjs` and `csp-check.mjs` against every production deployment, ideally as a CI step.
   - Repeat this audit after major features (Studio cloud sync, sharing, teams), especially anything that renders user-supplied SVG or HTML.
4. **CSP:** move to a nonce-based CSP if pages become dynamic anyway, and add `report-to` to collect violations.
5. **Generator IP:** consider server-side generation for Pro-only geometry, and log exports per user to spot abuse.
6. **Auth:** add Turnstile to the sign-up and reset forms, and consider MFA (TOTP) for paying users.
7. **Billing:** reconcile Stripe subscriptions against `profiles.plan` daily (a small cron) to catch missed webhooks.
8. **Backups:** confirm Supabase point-in-time recovery or daily backups, and test a restore.
9. **Incident response:** document how to rotate each key (Supabase service role, Stripe, webhook secret, Google OAuth) and who is notified.

---

PRODUCTION SECURITY STATUS: READY AFTER MANUAL CONFIGURATION

Reason: every CRITICAL and HIGH vulnerability found was fixed in code, covered by tests, verified on a production build with real attack requests and a CSP check, and deployed. The database changes are applied to the hosted project. No unresolved CRITICAL issue remains. What remains is external configuration only the owner can do: Supabase Auth hardening (leaked-password protection, secure password change, redirect allow-list, SMTP), 2FA on provider accounts, and the full Stripe production setup before payments are taken. There is also one accepted MEDIUM risk (Pro geometry computed in the browser for the live preview). The status is not READY because those dashboard settings cannot be verified or changed from the repository. It is not based on the build passing.


## 33. Windows Desktop App (D96, 11 October 2026)

Scope: `desktop/` (Tauri 2 app), `/api/desktop/*`, `/desktop/authorize`, `private.desktop_*` and the update system. Design: `DESKTOP_ARCHITECTURE.md`, `DESKTOP_UPDATE_SYSTEM.md`.

**Threat model.** The installed EXE, its WebView and everything on the user's PC are untrusted: they can be read, patched, scripted or replayed. The website and database stay the only authority for identity, plan, generation and updates.

| Area | Control | Verified by |
|---|---|---|
| Secrets in the app | None shipped: no Supabase keys, Stripe keys, database URL, OAuth secret or updater private key; only the public site URL and the updater public key. | `scripts/desktop/scan.mjs` on `desktop/dist`, `HingeLab.exe` and the installer (clean; positive control flags planted keys); staged-file scan before commit |
| Geometry / IP | Generators run only on the server; the catalog is data; the UI bundle contains no generator code or server-only text. | scan (server-code strings), `desktop.test.ts` (parity with the website export) |
| Entitlements | Plan decided per request on the server (paid period + 3 days' grace); Pro designs on Free return 403 with no SVG; Free output carries the mark. | integration test, E2E "Pro shape locked", "expired period falls back to Free" |
| Sign-in | System browser, PKCE S256, state, loopback port 1024-65535 built by the server, consent page, one-time hashed codes (120 s). The password never passes through the app. | PKCE RFC vector, loopback tests, Next URL normalization test, E2E sign-in |
| Tokens | Opaque 256-bit tokens, SHA-256 hashed in the database, Windows Credential Manager on the PC, never in the WebView; 15 min access, 30 day rotating refresh, reuse revokes the session; sign-out and revoke-all on the server. | integration tests, E2E "tokens never reach the web page", "revoked session signs the app out", "sign out" |
| Database | Tables in `private` (not exposed by PostgREST); security-definer functions with `search_path = ''`, executable by `service_role` only. | integration test "keeps the desktop tables away from API roles", `supabase db lint --linked` (no errors) |
| Abuse | 120 generates/min per user, 30 token requests per 10 min per IP (shared Postgres limiter), 256 KB bodies, 64 MB answer cap in the app. | E2E 429, request-size check |
| WebView | Strict CSP (no remote content; injected inline script blocked), navigation locked to the app, no fs/shell/http/opener permissions, SVG shown as `<img src=blob:>`, context menu and drops off, single instance. | E2E "navigation blocked", "commands outside the capability are denied"; release smoke test (remote fetch and inline script blocked) |
| Files | Save/Export write only the last server SVG by id, with a sanitised Windows file name; reveal only files saved this session. | Rust tests, E2E unknown-id and arbitrary-path checks |
| Transport | HTTPS only in release builds (http only to 127.0.0.1 in debug/e2e builds); redirects not followed; TLS verification never disabled. | `config.rs` tests |
| Updates | Official Tauri updater; minisign signature with the public key in the app; `requireSignedVersion`; HTTPS endpoint; no downgrades; Git-reviewed manifest with a host allowlist; passive install only after the user's click; forced updates via 426 without loops. | `desktop.test.ts`, `minisign.test.ts`, `update-e2e.mjs` 10/10 with real installers |
| Version gate | Apps below the minimum get 426; minimum raised by `DESKTOP_MIN_VERSION`. | integration test, E2E 426, live check |

**Finding fixed during the audit (high).** Next.js rewrites the first `127.x.x.x` anywhere in a request URL to `localhost` (`next/dist/server/web/next-url.js`), including query values. On the live site this changed the app's `redirect_uri` while sending a signed-out user through `/login`, so desktop sign-in would have failed after login (and the Google path through `/auth/callback` would have done the same). Fixed by sending only the loopback port and building the URI on the server (commit `717674c`); regression test runs Next's URL class on the link; live redirect checked.

**Live checks (production, after deploy).** `/api/desktop/update/windows/x86_64/1.0.0` 204; `/api/desktop/me` 400 without the client header, 401 without a session, 426 for `desktop/0.9.0`; `/api/desktop/token` with an unknown code `invalid_grant` (the new database functions answer); `/desktop/authorize` keeps `port` through the login redirect. The release installer (1.0.0) installed per user, started, reached the live API (401 signed out), found no update over HTTPS, and uninstalled cleanly.

**Not verified / remaining risks.**
- A full sign-in against the **live** site with a real account was not automated (no production test account was created); it is verified end to end against a local production build. Owner check: install, Sign in with your browser, Allow, build a design, export, sign out.
- Installers are **not Authenticode-signed** (no certificate yet): SmartScreen warns, and users can't tell a genuine first installer from a look-alike except by the website link and published SHA-256. Updates are still protected by the updater signature.
- The updater private key exists on one PC only (`%USERPROFILE%\.hingelab\updater`). Back it up; losing it means no automatic updates for installed apps.
- Local caches (recent designs, last settings) are per Windows user, not per HingeLab account.
- A determined user can still save anything the server sends to their own plan (by design: the server never sends Pro output to Free accounts).

**Credentials.** No credential was created, printed or exposed beyond the new updater key pair (private part outside the repository, folder limited to the owner). Nothing needs rotation.