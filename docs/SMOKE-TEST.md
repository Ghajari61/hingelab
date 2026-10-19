# Smoke test

Run before a release. The automated checks come first; the rest needs a person, an account and (for the Windows app) a Windows PC.

## Automated

| Check | Command | Result on 19 Oct 2026 (redesign phase 5) |
|---|---|---|
| Unit, golden and geometry tests (every generator, every preset, exports in SVG, DXF, PDF and LightBurn, kerf, checks and fixes, batches, `.oclc` files, plans, the updater manifest) | `npm test` | 2,464 passed, 33 skipped (they need the local Supabase stack) |
| Types and lint | `npm run typecheck`, `npm run lint` | clean (lint: 0 errors, 28 warnings) |
| Website production build and JS budgets | `NEXT_DIST_DIR=.next-build npx next build`, `node scripts/perf/budgets.mjs` | built; all budgets met |
| Every product's editor renders, desktop and phone width | `npm run smoke:web` (on `next start`) | 14 products × 2 widths |
| Accessibility (WCAG 2.1 A and AA, contrast included) | `npm run a11y` (on `next start`) | no serious or critical problems on 8 pages × 2 widths |
| The Windows UI bundle under the window's CSP (start gallery, Hinge Box, Letters with HarfBuzz, Boxes, Shadow Box in the build worker, Clock fonts, Parametric with Manifold and three.js) | `npm run desktop:ui:build`, `npm run desktop:smoke` | 7 of 7; the test fails when `'wasm-unsafe-eval'` is removed from the CSP, as it should |
| Rust core: allow-lists for API paths, external pages, file names; project files; prefs | `cargo test --manifest-path desktop/src-tauri/Cargo.toml` | 19 passed |
| Windows installer: build, minisign signature, secret and server-code scan, no local paths | `npm run desktop:build` | passed; Authenticode skipped (not configured, see docs/SIGNING.md) |
| Desktop sign-in and API end to end (PKCE, refresh rotation, reuse detection, plans, export with the app's token) | `npx vitest run lib/desktop` with the local Supabase stack running; `node scripts/desktop/e2e.mjs` | not run here: needs Docker and the local stack |

## By hand (website)

1. Open `/`: the hero, the live demo (change shape and size), the gallery, pricing (monthly and yearly; "Save up to 30%"), FAQ, the Windows download with version, size and SHA-256.
2. `/app/editor/local`: pick each product; change a size; Undo and Redo; "?" shows the shortcuts.
3. Signed out: Export shows "Export needs Pro" and the upgrade dialog with the design's picture.
4. Sign in with a Pro test account (Stripe test mode): Export SVG, DXF, and from More… PDF and LightBurn; open each in LightBurn or Inkscape at 100 %: true size, layers in the export colours.
5. A design with a check (for example a Boxes part larger than the sheet): the check says what is wrong, Show frames the part, the fix works.
6. Batch: Table Numbers with ten tables; the ZIP has one file per sheet.
7. File › Save project, then File › Open it again; open the same `.oclc` in the Windows app.
8. Phone (390 px): the canvas on top, settings in the sheet below; a generator's three-step flow.

## By hand (Windows app)

1. Install the new version over the old one; the app opens signed in.
2. Settings › Application updates › Check for updates: "up to date" (or the update dialog when a newer one is published).
3. Design: the start gallery, then each product; designs build without a connection (turn Wi-Fi off and change a size).
4. Export with a Pro account: the file lands in the export folder from Settings (or a Save dialog), Show in Explorer works.
5. Double-click an `.oclc` in Explorer: it opens in the editor; drop one on the window: the same.
6. Project files: the recent list, Open…, Remove from the list.
7. Free-form Studio, AI Studio and Cloud projects open in the website view, signed in.
8. Subscription › Upgrade opens the website's billing in the browser; Refresh plan updates the badge.
9. Sign out, sign in again (the browser opens HingeLab's sign-in, Allow, back to the app).
