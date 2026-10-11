# HingeLab for Windows: architecture

HingeLab for Windows (`desktop/`) is a Tauri 2 app for Windows 10 and 11. It is a **client of the HingeLab website**: it signs in, sends design settings, shows the SVG the server returns and saves it. Everything that must be trusted stays on the server. The web app is unchanged; the desktop app only adds routes under `/api/desktop/*` and the page `/desktop/authorize`.

Decision record: DECISIONS.md D96. Build: `WINDOWS_BUILD.md`. Releases: `WINDOWS_RELEASE_CHECKLIST.md`. Updates: `DESKTOP_UPDATE_SYSTEM.md`.

## The rule: the EXE is untrusted

Anything shipped in the installer can be read, patched or replayed. So the app contains:

- no geometry: the generators (hinge layout, clock, puzzle, QR, boxes) run only on the server (`lib/desktop/products.ts` calls the same code as the website's export);
- no plan logic that matters: the server decides Free or Pro on every request; the app only shows what it is told;
- no secrets: no Supabase keys of any kind, no Stripe keys, no database URL, no OAuth client secret, no updater private key. The app knows one public URL (`https://hingelab.vercel.app`) and the updater's **public** key;
- no payment code: Upgrade and Manage open the website's billing page in the browser.

`scripts/desktop/scan.mjs` checks every build for secret patterns, the actual values of secret variables in local env files, the updater private key and password, and text that only exists in the server's geometry code. `npm run desktop:build` fails if it finds any.

## Parts

| Part | Where | Job |
|---|---|---|
| Web UI | `desktop/src` (React 19, Vite) | Sidebar, workspace, settings, update dialog. Talks only to the Rust core through `invoke`. |
| Rust core | `desktop/src-tauri/src` | All HTTP, token storage, sign-in listener, file dialogs and writes, window, updater. |
| Server API | `app/api/desktop/*`, `lib/desktop/*` | Tokens, account, catalog, generate, update manifest. |
| Consent page | `app/(auth)/desktop/authorize` | The signed-in user approves the app in the browser. |
| Database | `supabase/migrations/20261012000100_desktop_sessions.sql` | `private.desktop_auth_codes`, `private.desktop_sessions` and security-definer functions callable by the service role only. |

## Sign-in (system browser, PKCE, loopback)

Follows RFC 8252 (native apps) and RFC 7636 (PKCE).

1. The app makes a 64-byte `code_verifier`, its S256 `code_challenge` and a 32-byte `state`, and listens on `127.0.0.1:<random port>/callback`.
2. It opens `https://hingelab.vercel.app/desktop/authorize?port=…&state=…&code_challenge=…&code_challenge_method=S256` in the default browser. The password (or Google) is entered on the website, never in the app.
3. If signed out, the website sends the user through `/login` (Google or email) and back. The consent page shows the account and asks **Allow** / **Cancel**. The server builds the redirect URI itself as `http://127.0.0.1:<port>/callback` (port 1024-65535); nothing else is accepted. The app sends only the port because Next.js rewrites the first `127.x.x.x` anywhere in a request URL to `localhost`, which mangled a full `redirect_uri` on its way through `/login` (a test in `desktop.test.ts` runs Next's own URL class on the link).
4. Allow runs a server action that stores a one-time code (SHA-256 hashed, 120 s, single use, bound to the challenge and redirect URI) and sends the browser to the loopback address with `code` and `state`.
5. The app checks `state`, then posts `code`, `code_verifier` and `redirect_uri` to `/api/desktop/token`. The server checks the verifier against the stored challenge (constant-time) and returns an access token (15 min) and a refresh token (30 days).
6. Tokens are random 32-byte values (not JWTs), stored on the server only as SHA-256 hashes, and on the PC in **Windows Credential Manager** (`keyring`, entry `app.hingelab.desktop` / `session`). The web UI never sees them.

Refresh rotates both tokens. Presenting an already-used refresh token revokes the whole session (theft detection); the Rust core serialises refreshes so the app never trips this itself. Sign out calls `/api/desktop/logout` (revokes on the server) and clears the credential. The website can revoke all desktop sessions of a user (`desktop_sessions_revoke_all`), and a 401 that a refresh can't fix signs the app out.

## API

Every request carries `x-hingelab-client: desktop/<version>` and `Authorization: Bearer <access>`. Responses are `no-store`.

| Route | Purpose |
|---|---|
| `POST /api/desktop/token` | `authorization_code` and `refresh_token` grants. 30 per 10 min per IP. |
| `POST /api/desktop/logout` | Revokes the session of the presented token. |
| `GET /api/desktop/me` | Account, effective plan, entitlements, minimum version. |
| `GET /api/desktop/catalog` | Products, settings sections, fields and presets as plain JSON (no code). |
| `POST /api/desktop/generate` | Builds a design on the server. 120 per minute per user, 256 KB body, 60 s. |
| `GET /api/desktop/update/{target}/{arch}/{version}` | Tauri updater answer (see `DESKTOP_UPDATE_SYSTEM.md`). |

Errors: 400 bad request or missing client header, 401 sign in again, 403 the design needs Pro (no SVG is sent, because anything sent to the app can be saved), 422 the design can't be built (with checks and fixes), 426 `update_required` with `minimumVersion`, 429 with `Retry-After`, 503 service not configured. The Rust core turns these into typed errors (`kind`: `unauthorized`, `forbidden`, `rate_limited`, `update_required`, `network`, `server`, `invalid`, …); the UI shows each one in words and keeps the last good preview.

The effective plan on desktop is Pro only while `profiles.plan = 'pro'` and the paid period (plus 3 days' grace) has not ended. Free designs carry the same small mark as the website's Free exports.

## Generate and save

The UI sends `{ product, params, change | fix | autofix | preset }`. The server applies the change (choices that set other values, materials that set thickness and kerf), validates and clamps the settings with the website's own rules, runs the checks, builds the design and returns settings, form state, checks, stats and the SVG. Responses arrive in order; stale ones are dropped; typing is debounced.

The Rust core keeps the last good SVG under a numeric `designId`. Save SVG and Export write **only that server SVG** (the UI can't hand Rust a file to write), to a place the user picked in the Windows dialog or to the export folder from Settings, with a safe Windows file name. "Show in folder" works only for files saved in this session.

The preview is the SVG as an `<img src="blob:…">`, so scripts or links inside an SVG never run. The canvas shows it at true scale (mm rulers, zoom 5–4000 %, fit, reset, pan).

## Window and WebView lockdown

- CSP: `default-src 'self'; script-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' blob: data:; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`. No remote content is loaded.
- Navigation: the window can only show the app's own pages (`on_navigation`); links open nowhere inside it. `open_web` opens only a fixed list of website pages in the browser.
- Capabilities (`capabilities/default.json`): the app's own commands, `core:app:allow-version`, `core:event:default`, `core:window:allow-set-title`, `updater:default`, `process:allow-restart`. No filesystem, shell, HTTP or opener permissions for the WebView; file dialogs and writes happen in Rust.
- `Object.prototype` frozen first thing in the app's UI (`src/harden.ts`; Tauri's `freezePrototype` is off because it would also apply to the website view), `withGlobalTauri: false`, single instance, context menu and file drops disabled.
- Commands validate their input (request size and shape, design id, page names, paths).

## The website inside the window (D101)

The website's editors and pages (Letters, Parametric, every product's full editor with 3D view, DXF and sheets, the Studio, cloud projects, the help centre) open inside the app window, signed in as the app's account. They are the website itself, so nothing of their code ships in the EXE.

- **View.** A second webview (label `web`, `src/web.rs`) laid over the content area with `Window::add_child` (Tauri `unstable` feature). The UI keeps a placeholder (`components/Web.tsx`) and sends its position and size; the view hides on native pages and while a dialog is open, and keeps its page when you come back.
- **Sign-in.** On the first open of a run, Rust calls `POST /api/desktop/web-session` with the desktop bearer token. The server makes a one-time email sign-in token for that user with the admin API (`generateLink`, nothing is emailed) and returns `/auth/callback?token_hash=…&type=email&next=…`. The view opens that link, the website's own callback sets its session cookie and continues to `next` (same-site path, `safeNext`; `/api/` and `/auth/` fall back to `/home`). Rate limit 20 per 10 minutes per user. If a page later lands on `/login` (session ended), the app signs it in again, at most once a minute.
- **No IPC.** Capabilities are granted to the `main` webview only (`"webviews": ["main"]`) and no remote URL is listed, so the website view can't call any command or plugin (E2E tries `app_info`, `me`, `sign_out`, `web_open`, opener and updater).
- **Navigation.** Only the website's own origin (and its `blob:` downloads) loads in the view. Other `https`/`mailto` links, Stripe checkout included, open in the default browser; everything else (`file:`, `javascript:`, `tauri:`) is blocked. New windows go to the view (same site) or the browser.
- **Downloads.** Only drawing and project files (SVG, DXF, ZIP, JSON, `.hingelab`, PNG, JPG, PDF, LightBurn, CSV, TXT) from the website's origin; saved with a sanitised unique name in the export folder, else Downloads; "Show in folder" works for them. Programs and scripts are refused.
- **Sign-out.** Signing out of the app ends the website session in the view (`POST /auth/signout`) and closes it.

## Offline

Designs are built on the server, so editing needs a connection. Offline, the app keeps the last preview, says what happened, and retries when the connection returns. Recent designs, favorites, preferences, the catalog and the account are cached on the PC (settings only, never tokens) so the app opens instantly. These caches belong to the Windows user, not the HingeLab account: on a shared Windows login, the next person to sign in sees the same recent designs and last settings (never the previous account's session or files).

## Tests

- `lib/desktop/__tests__/desktop.test.ts`: PKCE (RFC 7636 example), loopback rules, versions, manifests (URL allowlist, signatures, signed version, downgrades), effective plan, catalog, generate parity with the website's export for every product.
- `lib/desktop/__tests__/desktop.integration.test.ts` (local Supabase): code exchange, plans, refresh rotation and reuse detection, logout, 426, updater route, functions denied to API roles.
- `lib/desktop/__tests__/minisign.test.ts`: the release scripts' signature check (valid, tampered, wrong key, corrupted).
- `cargo test` in `desktop/src-tauri`: PKCE, callback parsing, file names, download names, SVG check, token shape, navigation rules (app window and website view), API base rules.
- `scripts/desktop/e2e.mjs`: the real app against a local production server (24 steps: sign-in, previews, export, Pro lock and upgrade, expired period, navigation lockdown, denied commands, 429, offline, revoked session, 426, dashboard, sidebar, the website view signed in / without IPC / outside links to the browser / downloads / hidden on native pages, sign out).
- `scripts/desktop/update-e2e.mjs`: real installers (10 steps, see `DESKTOP_UPDATE_SYSTEM.md`).
