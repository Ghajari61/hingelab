# Progress

## HingeLab Studio (master spec `CURSOR_STUDIO_PROMPT.md`, phases S0–S10)

**Next step:** S3 — path operations & laser core (spec §5, §16): pathfinder (unite, subtract, intersect, exclude, divide via Clipper2 on flattened curves, then curve refit), offset / contour, arrays, clean-up, cut-layer settings in use, kerf compensation, tabs/bridges, cut order, cut preview, pre-flight checks, sheets & nesting v1, material/machine library in the Cut Layers panel, image place/trace/dither, import SVG/DXF (also SVG paste), export SVG/DXF/PDF/PNG/LBRN2. Pure functions in `lib/studio/` with Vitest tests first; add the new commands to `lib/studio/commands.ts` (registry + menus) and their handlers to `components/studio/editor/commandHandlers.ts`; browser script `scripts/shots/studio-s3.mjs`.

**Deployed (at your request, 10 Oct 2026):** `main` up to `2141dd3` (Studio S2) is live on https://hingelab.vercel.app. `studio-s2.mjs` passed against the live site.

**Accounts live (10 Oct 2026, D78):** Supabase project `hingelab` (ref `vwpuvormmxsydsbjimjs`, us-east-1, org PixiGift via the Vercel integration, Pro plan, about $10/month) with all migrations applied; its keys are in Vercel for every environment. Email and **Google** sign-up / sign-in work on https://hingelab.vercel.app (Google OAuth client "HingeLab web (Supabase)" in Google Cloud project `hingelab` owned by ghajari61@gmail.com, app published to production). Stripe keys are still absent, so billing pages show "not configured".

## UX upgrade and generators (owner's 23-point list, plan U0–U9, G1–G6)

| Phase | Status |
|---|---|
| U0 research (D79) | done |
| U1 light theme + product shell (D80) | done |
| U2 start gallery, history, resets (D81) | done |
| U3 presets, thumbnails, hinge styles, my presets (D82) | done |
| U4 fit to sheet (D83) | done |
| U5 shared 3D view (D84) | done |
| U6 shape buttons (D85) | done |
| U7 checks and fixes (D86) | done |
| U8 help centre (D87) | done |
| U9 performance budgets (D88) | done |
| G1 generator framework + Clock (D89) | done |
| G2 puzzle (D90) | done |
| G3 QR Code (D91) | done |
| G4 boxes (D92) | done |
| G5 lamina (D93) | done |
| G6 xTool gaps (D94) | done |
| Security hardening (D95, `SECURITY_AUDIT.md`) | done |
| Windows desktop app (D96, `DESKTOP_ARCHITECTURE.md`) | done; release needs code signing and a hosted installer |
| Desktop dashboard with pictures (D97) | done |
| Website editors inside the desktop app (D101) | done; desktop 1.0.3 |
| Visual refresh and profile avatar (D102) | done |
| Landing website redesign (D103) | done |

**U1 (D80):** light Atomm-style theme by default (dark kept in Settings), Inter, shared shell in `components/shell/` (gallery rail with picture cards, Sheets / 3D view switch, view tools in the zoom HUD, sliders on every numeric field, Export pinned under the dock, Undo/Redo/Open/Save in the header) used by Hinge Box, Letters and Parametric. Tests 752 / 752, golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u1.mjs` and `reset-fields.mjs` pass. Screenshots `docs/screenshots/ux-u1-*.png`.
**U2 (D81):** the guest editor opens on a product and preset gallery (12 presets per product, each built by `lib/__tests__/presets.test.ts`), `?p=` keeps the open product, File → Start page; Undo/Redo on the gallery rail; units and an undoable Reset all (with confirmation) in the dock header; a reset on every section. Tests 777 / 777, golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u2.mjs`, `ux-u1.mjs`, `reset-fields.mjs`, `letters-l5.mjs` and `parametric-tabs.mjs` pass. Screenshots `docs/screenshots/ux-u2-*.png`.
**U3 (D82):** 36 preset thumbnails drawn from the real geometry (`scripts/build-preset-thumbs.mjs` → `public/presets/`), Hinge style cards (Standard, Fine, Flexible, Stiff, Single line), File → Save as my preset (device + `user_presets` table when signed in; migration `20261010000500_user_presets.sql`). Fixed: Hinge Box presets would have opened with single-line cuts. Tests 784 / 784 (new: thumbnails exist and are clean, every hinge style × pattern builds, my-presets store, RLS integration test), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u3.mjs` passes. Screenshots `docs/screenshots/ux-u3-*.png`. Owner step: `npx supabase db push` to create `user_presets` on the hosted project (until then presets save on the device only).
**U4 (D83):** `lib/fit/fitToSheets.ts` (largest scale that nests into N sheets; MaxRects from the Parametric nester, parts upright) with Hinge Box and Letters adapters (`lib/fit/products.ts`). New Sheet section: sheet preset, Fit product to Off / 1 sheet / N sheets / Auto, the resulting scale and size; several sheets drawn and exported stacked. Fit off is byte-identical (all 198 golden cases also pass through the new path); server export uses the same path. Tests 795 / 795 (new: analytic squares, fits-in-N and largest-scale checks over the presets on a 300 × 200 bed, Letters fit, server export), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u4.mjs` passes. Screenshots `docs/screenshots/ux-u4-*.png`.
**U5 (D84):** shared three.js `Viewport3D` (ground, shadows, room light, orbit/pan/zoom, view cube with Perspective/Top/Front/Side/Fit, plywood/MDF/card/acrylic looks, Explode and Lay flat) for Hinge Box (replacing the SVG preview, `lib/hinge3d/scene.ts`) and Letters; loads on first use of the 3D tab. Tests 801 / 801 (new: box height/width for every shape and lid, ground and centring, slit lines, lay-flat parts, looks), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u5.mjs`, `ux-u1.mjs` and `letters-l4.mjs` pass. Screenshots `docs/screenshots/ux-u5-*.png`.
**U6 (D85):** `ShapePicker` (10 shape buttons with sliders) writes the Along a curve fin length, fin height, twist and outline formulas and the Formula sources; the raw formula sits under Advanced and typed formulas show as custom. Tests 807 / 807 (new: every shape on every field compiles and is finite, outlines positive, exact values, recognition, sync, icons, and leaf/ellipse/heart/star/wave outlines build a clock), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u6.mjs` passes. Screenshots `docs/screenshots/ux-u6-*.png`.
**U7 (D86):** one Issue and Fix model (`lib/issues`) for Hinge Box, Letters and Parametric with fix buttons per issue and an undoable Auto-fix all (safe fixes only, worst first, re-checked after each). Tests 820 / 820 (new: every fix clears its issue, Auto-fix all, undo), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u7.mjs` passes. Screenshots `docs/screenshots/ux-u7-*.png`.
**U8 (D87):** searchable help centre at `/help` (30 articles, option lists generated from the field definitions, figures drawn from the geometry and Playwright screenshots), a ? on every dock section and rail group opening the article beside the editor, Tips per product. Tests 826 / 826 (new: every field documented, links and figures resolve, search ranking), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u8.mjs` passes locally and live. Screenshots `docs/screenshots/ux-u8-*.png`.
**U9 (D88):** code split and budgets (`npm run perf:budgets`): every page under 250 KB first-load JS (largest `/home` 213 KB), Parametric editor 450 → 288 KB, Hinge Box editor 229 → 124 KB; text shaping loads only for a Text source. Tests 826 / 826, golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/ux-u9.mjs` (cold loads at 4× CPU slowdown all interactive under 0.9 s) and `ux-u2` to `ux-u8` pass against the production build. Screenshot `docs/screenshots/ux-u9-text-source.png`.
**G1 (D89):** generator framework (`lib/generators`: one definition per generator gives its fields, rail cards, presets, a pure `build`, checks with fixes, help and file name; one shared editor `components/generators/GeneratorEditor.tsx` with the gallery rail, dock, checks, layers, sheet fit, 3D view, undo and autosave) and the Clock: round, square, polygon, sunburst, gear, scalloped or custom faces; single, ring-on-back or ring-and-centre layers; Roman, Arabic or Persian numerals, ticks, dots, minute ticks, engraved or cut through; six hand styles with counterweight tails; holes for 5, 8 and 13 mm quartz movements or custom; keyhole, hole or desk stand. 8 presets (wall, desk with stand, sunburst, minimal, gear, Persian, square layered, hexagon for kids) with thumbnails; Generators menu in the header and a Generators section on the start page; help articles generated from the fields. Generators save on this device (designs and My presets). Tests 860 / 860 (new: clock geometry, holes, kerf, numerals including Persian left-to-right, every check and fix, a golden wall-clock SVG, the generator contract and help), golden byte-for-byte, `tsc` clean, `next build` OK, budgets met (generator editor 104 KB, clock 9 KB); `scripts/shots/g1.mjs` and `ux-u8.mjs` pass. Screenshots `docs/screenshots/g1-*.png`.

**G2 (D90):** Jigsaw Puzzle generator: rectangle, circle, heart or custom outline; piece count picks the grid; classic, kids, wavy or straight tabs with tab size, variation and a seeded layout number (Randomise); single-line joined cuts with overshoot so each edge is cut once; tiny edge pieces joined; frame or tray; engraved picture (greyscale, clipped to the outline), text or piece numbers; 3D view with exploded pieces. More than 50 pieces needs Pro (upgrade dialog on the free plan, rebuilt and checked on the server for Pro). 8 presets (kids 12 with tray, photo 100 Pro, heart 24, round 36, name puzzle, first puzzle 2x2, numbered 48, wavy coaster) with thumbnails. Tests 890 / 890 (new: tiling and every edge cut once, piece counts, overshoot, joined grid lines, determinism, tab size, custom outline, frame and tray, picture, numbers, every check and fix, Pro rule and server export, a golden default puzzle SVG), golden byte-for-byte, `tsc` clean, `next build` OK, budgets met (puzzle 9.4 KB); `scripts/shots/g2.mjs` passes. Screenshots `docs/screenshots/g2-*.png`.

**G3 (D91):** QR Code generator: web address, text, Wi-Fi, contact (vCard), email, text message or phone call; error correction L to H; square, rounded, dots or connected modules; engraved (or inverted), cut out over a contrasting backplate, or a paint stencil with bridges that keeps every piece joined; rectangle or round plate with border, frame, label (below, above or beside), centre logo (heart, star, Wi-Fi, letters) and a keyring tab or corner hole. 6 presets (keychain, table sign, coaster, Wi-Fi card, business card, paint stencil) with thumbnails. Tests 936 / 936 (new: the content formats, jsQR decoding of every content type at every level, every style and output, logos, labels, round plates, frames and presets, a flood fill proving stencils stay in one piece, every check and fix, a golden SVG), golden byte-for-byte, `tsc` clean, `next build` OK, budgets met (QR 17.7 KB); `scripts/shots/g3.mjs` passes and decodes the exported SVGs. Screenshots `docs/screenshots/g3-*.png`.
**G4 (D92):** Boxes generator: finger-jointed box (closed, open or lift-off lid), tray with half-lap dividers, desk sign, three-layer photo frame (stand or keyhole), phone and tablet stand, key holder and bird house, in one generator with a design rail. Odd finger counts per edge with every finger owned by one panel; inside or outside sizes; `place.yaw` and `place.tilt` for side walls, hooks, roofs and the leaning phone rest; three-quarter preset thumbnails. 14 presets. Tests 958 / 958 (new: 3D occupancy proving no part overlaps another and box walls have no gaps, mortises filled by their tabs, complementary fingers, sizes, half-lap crossing, roofs on gables, fronts facing the viewer, every check and fix, a golden SVG), golden byte-for-byte, `tsc` clean, `next build` OK, budgets met (Boxes 10.0 KB); `scripts/shots/g4.mjs` passes. Screenshots `docs/screenshots/g4-*.png`.
**G5 (D93):** lamina ideas: true-shape outline nesting (Parametric and every generator, opt-in), a calibration bar (scored 100 mm scale and a kerf-compensated 10 mm square) along the bottom of every sheet, generator part labels scored clear of cuts, and the Folded (papercraft) method: quadric simplification to a face count, greedy unfolding into nets that never overlap, mountain and valley score lines, numbered cut edges with trimmed glue tabs, nets in 3D. Presets Papercraft ball and Folded head. Tests 982 / 982 (new: outline nesting, decimation, folded nets and presets, calibration strip, generator extras), golden byte-for-byte, `tsc` clean, `next build` OK, budgets met; `scripts/shots/g5.mjs` passes. Screenshots `docs/screenshots/g5-*.png`.
**G6 (D94):** xTool Studio gaps suited to SVG generation: DXF export for every product (R12, millimetres, one layer per SVG layer with its colour), Parametric's Export SVG saves every sheet in one file (ZIP and DXF as extras), Copies in the generators' Sheet section (the whole set repeated and nested), text bent along the clock dial with numerals that can follow it (Station clock preset), and an engraved border offset from the desk sign's outline (Office sign preset). Image tracing stays the Parametric photo path. Tests 1003 / 1003 (new: DXF conversion of every product, all-sheets SVG, copies, text on a circle, the clock checks, the sign border), golden byte-for-byte, `tsc` clean, `next build` OK, budgets met; `scripts/shots/g6.mjs` passes. Screenshots `docs/screenshots/g6-*.png`.
**Security hardening (D95):** full audit in `SECURITY_AUDIT.md`. Fixed a stored XSS through puzzle pictures in server-built SVGs (plus comment breakout in every SVG writer), form CSRF on the API routes (cross-site and non-JSON requests refused), unbounded export requests (validation, size limits, `maxDuration`), no rate limiting (Postgres-backed limiter with a memory fallback), plan-limit races in the database, Pro unlocked when Supabase config is missing in production, a cancelled second subscription removing Pro; added CSP and security headers, sandboxed downloads, and dependency fixes (`npm audit` 0). Migrations `20261010000500` and `20261011000100` pushed to the hosted project. Tests 1031 / 1031 (new: `lib/security/__tests__`), golden byte-for-byte, `tsc` clean, `next build` OK, budgets met; `scripts/security/csp-check.mjs` (no violations) and `attack-check.mjs` (every attack refused) pass, as do `g2`, `g5`, `g6` and `parametric-p5`.
**Windows desktop app (D96):** HingeLab for Windows in `desktop/` (Tauri 2.12, React UI, Rust core): sidebar (Dashboard, Generators, Recent, Favorites, Subscription, Settings, Help), workspace with grouped settings in mm or inches, checks and fixes, a true-scale canvas (rulers, zoom, fit, reset), Save SVG / Export to a folder, undo/redo, shortcuts, window state, light and dark themes. Every design is built on the server (`/api/desktop/generate`; no geometry in the app); Pro designs on Free get no SVG. Sign-in through the browser with PKCE and a consent page; rotating opaque tokens in Windows Credential Manager, revocable (migration `20261012000100_desktop_sessions.sql`). Signed auto-updates through the official Tauri updater with `requireSignedVersion`, a Git-reviewed manifest (`desktop/releases/stable.json`) and forced updates via 426. Release build `npm run desktop:build`: `HingeLab_1.0.0_x64-setup.exe` (2.1 MB, updater signature verified, secret and server-code scan clean, Authenticode not signed yet). Tests 1061 / 1061 (new: `lib/desktop/__tests__`), `cargo test` 10 / 10, golden byte-for-byte, `tsc` clean, `next build` OK, budgets met; `scripts/desktop/e2e.mjs` (16 / 16 with the real app) and `update-e2e.mjs` (10 / 10 with real installers: tampered, wrong-key, replayed and malformed updates refused, good update installs, no loop) pass. Screenshots `docs/screenshots/desktop-*.png`. Migration pushed to the hosted project and the website deployed (live desktop endpoints checked; release installer smoke-tested against production). Security review: `SECURITY_AUDIT.md` section 33 (fixed: Next.js rewrote `127.0.0.1` in the sign-in link). Owner steps: code-signing certificate, a live sign-in with a real account, host installers and publish with `scripts/desktop/release.mjs` (`WINDOWS_RELEASE_CHECKLIST.md`).
**Desktop dashboard with pictures (D97):** the desktop Dashboard has a graphite hero on the laser-bed grid with a stack of product renders and a Continue (or New) button, picture tiles for the five generators, a row of six ready-made presets (Pro badge on Free), recent designs as cards with a preview drawn from the last server SVG on this computer (360 × 225 WebP in `hl-recent-v1`, hairlines drawn at 1.1 px; falls back to the product picture when no SVG was sent), and a plan card with the Pro perks. Generator preset cards and Favorites show the preset pictures too. The pictures are the website's public preset renders, bundled as local assets (the window CSP allows no remote images). Tests 1061 / 1061, `tsc` clean, `next build` OK, budgets met, desktop bundle scan clean; `scripts/desktop/e2e.mjs` 17 / 17 (new step: every picture loads and the recent card has a drawn preview). Screenshots `docs/screenshots/desktop-dashboard*.png`, `desktop-generators-dark.png`. Then (D98): the workspace settings panel moved to the right of the canvas (after it in the markup too, so Tab order follows the screen) and notifications to the bottom left so they no longer cover the settings; `e2e.mjs` 17 / 17.
**Desktop 1.0.1 published (D99):** first online update. Installer `HingeLab_1.0.1_x64-setup.exe` (2,372,036 bytes, SHA-256 `5da12cd1…37c7`, updater signature verified, scan clean, Authenticode not signed yet) is served from `https://hingelab.vercel.app/downloads/` (committed in `public/downloads/`, skipped by the middleware); `desktop/releases/stable.json` offers it, so installed 1.0.0 apps see it under Settings → Check for updates. Tests 1061 / 1061 (the updater integration test now reads the published version instead of assuming none), `tsc` clean, `next build` OK, budgets met.
**Desktop 1.0.2 (D100):** collapsible sidebar: a button in the sidebar header (or Ctrl+B) shrinks it to a 64 px icon strip with names as tooltips and accessible labels, remembered in `hl-prefs-v1`; notifications follow its width. Published as 1.0.2 the same way as 1.0.1 (installer `6d88275d…805d`, 2,372,123 bytes, signature verified, scan clean); the 1.0.1 installer was removed from `public/downloads/`. Tests 1061 / 1061, `tsc` clean; `e2e.mjs` 18 / 18 (new step: collapse with the button, navigate by name, expand with Ctrl+B). Screenshot `docs/screenshots/desktop-sidebar-collapsed.png`.
**Website inside the desktop app (D101):** everything the website offers online now opens inside the Windows app, signed in as the app's account: a new "Online" sidebar group (All editors, Studio, Cloud projects), a "More editors, online" row on the Dashboard (Letters, Parametric Slicer, Studio), "Full editor" in the workspace (3D view, DXF, sheets) and the full help centre. The pages are the website itself in a second webview over the content area (`desktop/src-tauri/src/web.rs`, `desktop/src/components/Web.tsx`), so no website code ships in the EXE. The app signs it in through the new `POST /api/desktop/web-session` (one-time email token for the same user, opened through the website's `/auth/callback`). The view has no IPC (capabilities now name the `main` webview only); other sites, Stripe included, open in the browser; downloads (drawing and project files only) go to the export folder; app sign-out ends the website session. Fixed on the way: Tauri's `freezePrototype` broke a website library in the view, so the freeze moved into the app's own UI (`src/harden.ts`, kept by `sideEffects`). Tests 1062 / 1062 (new: web-session integration test), `cargo test` 13 / 13 (download names, view navigation policy), `tsc` clean, `next build` OK, budgets met, desktop scan clean; `e2e.mjs` 24 / 24 (six new steps for the website view). Screenshots `docs/screenshots/desktop-online-*.png`. Published as 1.0.3 (installer `230a9d75…9c2a`, 2,414,918 bytes, signature verified, scan clean); the 1.0.2 installer was removed from `public/downloads/`.
**Visual refresh (D102):** a modern look for the website and the Windows app: the HingeLab brand is now an indigo-violet-pink gradient (logo mark, favicon, social image, app logo), the default accent is indigo (`#4F46E5` on light for 4.5:1 text contrast), softer layered shadows, rounder buttons with a gradient primary, a deep-ink app sidebar with a glowing active item, gradient icon badges and picture cards for every generator on the start page. The profile icon (a tiny plain letter) is now a shared `Avatar` (`components/auth/UserMenu.tsx`, helpers in `lib/account/avatar.ts`): two initials from the name or the email ("ghajari61@…" gives GH), a stable colour per account, a gold ring on Pro, the picture when the account has one and the initials if it fails to load; the menu shows the account, the plan and icons for My designs, Cloud projects, Account, Billing and Sign out. The desktop account chip uses the same initials and colours. Tests: new `lib/account/__tests__/avatar.test.ts`.
**Landing redesign (D103):** the public home page (`app/page.tsx`, `app/landing.css`) now presents everything HingeLab makes instead of only hinge boxes: a hero with a floating mosaic of real preset renders and the generator and design counts, a "works with" strip (LightBurn, xTool Creative Space, Glowforge, Inkscape, RDWorks, DXF), "Everything you can make" picture cards for every product built from `lib/site/products.ts` (so new generators appear automatically, with their design counts), an occasions row that opens the cake topper on that occasion's design, How it works, a features grid, the live hinge-box demo with the four sample boxes, a Windows app section with the current installer's version, size and SHA-256 read from `desktop/releases/stable.json` at build (`lib/site/release.ts`), pricing, FAQ and a closing call to action. The header has a Products menu, Occasions, Features, Windows app, Pricing and Help; the footer has product and legal links. Editor links accept `?p=<generator>&preset=<id>` to open a built-in design once (`components/editor/Workspace.tsx`). Site description, Open Graph text and keywords cover all products.
**Requested additions (outside the phase plan):**
- Field reset (`64f9baf`, deployed): double-click a field's name or click its ↺ to restore the default in the Hinge Box, Letters and Parametric editors; `scripts/shots/reset-fields.mjs`.
- Parametric **Text** source (D76): "Model from → Text" slices a typed letter, word or name (Latin or Persian) with a bundled font, rounded (pillow) or flat profile, height, spacing, depth and rounding. Pro source, exported in the browser. Tests 749 / 749 (6 new in `lib/parametric/__tests__/text.test.ts`), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/parametric-text.mjs` passes ("Sam" 71 parts, "سام" in Vazirmatn 45 parts). Screenshots `docs/screenshots/parametric-text-sam.png`, `parametric-text-persian.png`.
- Parametric **tab count** (D77): Joints & Fit → "Tabs per fin" Auto (with "Tab every", default 60 mm) or "Set number" (1–50), for Parallel fins, Along a curve and the Radial hub; Stacked dowels go up to 12. Fixed a bug where most tabs (43 of 64 on the default head) were silently missing from the fins while the backboard had their slots. Tests 752 / 752 (new: tab rule, set number on the plate, radial hub tabs and curve tabs; the slot check now also asserts each tab is on its fin), golden byte-for-byte, `tsc` clean, `next build` OK; `scripts/shots/parametric-tabs.mjs` passes. Screenshots `docs/screenshots/parametric-tabs-6.png`, `parametric-tabs-6-sheets.png`.

How the earlier work maps onto the studio phases:

| Phase | Status | What already exists |
|---|---|---|
| S0 — foundation + Hinge Box port + golden | done (Main 1) | Next.js app, `lib/hinge`, golden test byte-for-byte |
| S1 — design system, shell, start screen, local model | **done** — 692 / 692 tests | see "S1" below |
| S2 — vector editor core | **done** — 743 / 743 tests | see "S2" below |
| S3 — path ops & laser core, import/export | not started | per-product SVG/ZIP export only |
| S4 — Google sign-in, cloud, versions, projects page | partly (Main 2–3) | email + Google auth, cloud projects with autosave, thumbnails, conflict handling |
| S5 — generator framework + #1 #5 #6 #10 #7 | not started | Hinge Box exists as a standalone editor |
| S6 — #2 #8 #9 | not started | — |
| S7 — #3 Letters | done as a standalone product (L1–L5) | needs wrapping as a registered generator (S5 framework) |
| S8 — #4 Parametric | done as a standalone product (P1–P6) | needs wrapping as a registered generator |
| S9 — Stripe, trial, gates, billing, landing, templates | partly (Main 4–5, L5, P6) | Checkout, portal, webhooks, server-side gates, landing page |
| S10 — polish, tour, help, perf, a11y, E2E | not started | — |

### S2 — vector editor core (done)

Built:
- **Model and history** (`lib/studio/`): `geom.ts` (matrices, boxes, Bézier helpers, shape outlines for all 12 live shapes), `scene.ts` (find/locate, add/remove/move, group/ungroup, duplicate, transform, align/distribute, hit testing), `history.ts` (inverse patches, 200 steps, merged drags and typing), `snap.ts` (grid, points, guides, smart guides with alignment and equal spacing), `pathOps.ts` (reverse, close, join, add anchors, compound paths, break apart, clipping masks, reset bounding box), `text.ts` (HarfBuzz layout: Latin and Persian, RTL, tracking, leading, alignment, area text wrap), `clipboard.ts`, `keymap.ts`, `workspace.ts`, `commands.ts` (113 commands, four shortcut sets, menus).
- **Canvas** (`components/studio/editor/Canvas.tsx`): SVG view of sheets, grid, guides and objects (cut-layer colours, fill/score modes, clip groups); selection box with scale and rotate handles (Shift, Alt); move with smart guides, Alt to duplicate, Ctrl to skip snapping; marquee; rulers with draggable guides; HUD with distances and sizes; zoom/pan (wheel, Ctrl+wheel, Space, Hand and Zoom tools).
- **Tools**: Selection, Direct Selection (anchors and handles, smooth/corner, add anchor by double-click), Pen (click/drag, close on the first anchor, Enter/Esc, Backspace), Pencil (smoothed, closes near the start), Line, 12 shapes (rectangle, ellipse, polygon, star, arc, slot, gear, arrow, speech bubble, heart, grid, spiral), Type (point and area text, edited in place), Rotate, Scale, Reflect.
- **Panels and bars**: control bar (X/Y/W/H/angle, cut layer, live-shape and text options, tool defaults), Properties, Layers & Objects (tree, show/lock, rename, drag to reorder or nest), Cut Layers (output/show, speed, power, passes, interval, kerf, air), Align, History (click to jump), Document (sheet, material, machine, grid & snapping, units). Workspaces: Essentials, Laser, Typography, Minimal.
- **Commands**: full menu bar (File, Edit, Object, Type, Select, Path, Laser, View, Window, Help), context menu, command palette (Ctrl+/, commands, generators, recent projects, recently used first), Keyboard Shortcuts dialog (four sets, record a key, conflict prompt with Reassign, export/import JSON, restore defaults with undo), Preferences (General / Shortcuts / Laser, restore defaults per tab with undo), Move… and Document Setup dialogs.
- **Reset system**: Alt+click or ↺ on any field label, section "…" menus (Transform, Shape, Grid & Snapping, cut-layer settings), Edit → Reset Field / Reset Section; every reset shows a toast with Undo.
- Autosave (1.5 s, flushed on leave), Save a Copy, Revert, copy as SVG to the system clipboard.

Tests: 743 / 743 (51 new: geometry, scene ops, history merging, snapping, shapes, path ops, clipboard, custom shortcuts, workspaces, command registry and shortcut-set conflicts, HarfBuzz text layout incl. Persian and wrapping, fuzzy palette matching), golden byte-for-byte, `tsc` clean, `next build` OK, `build-storybook` OK. Browser script `scripts/shots/studio-s2.mjs`: 20 checks pass (Rectangle tool by M, draw, control-bar options, Shift circle, smart guides and HUD while moving, Ctrl+Z / Ctrl+Shift+Z, palette → Star, text "Hello سام" outlined with no missing glyphs, pen closes a path, ruler guide, Ctrl+G and the Layers tree, Alt+click reset and Undo from the toast, reassigning Ctrl+G to Lock, reload keeps every object). `studio-s1.mjs` still passes.

Screenshots: `docs/screenshots/studio-2-smart-guides.png`, `studio-2-palette.png`, `studio-2-nodes.png`, `studio-2-layers.png`, `studio-2-object-menu.png`, `studio-2-context-menu.png`, `studio-2-shortcuts.png`, `studio-2-preferences.png`, `studio-2-editor.png`.

Known limitations: path operations (pathfinder, offset, outline stroke) and image commands are not in the menus yet (S3); pasting SVG from other programs waits for the S3 importer; text has no automatic font fallback (missing glyphs are reported, D72); the selection box is axis-aligned for rotated objects (D71); panels dock in one column, no floating panels yet (D74); custom shortcuts and workspaces are stored per browser until S4.

### S1 — design system, app shell, start screen, local projects (done)

Built:
- **Tokens** (`styles/tokens.css`): dark (default), darker and light themes, four accents, the 30 LightBurn cut-layer colours, spacing, radii, type, motion (zero under reduced motion), plus aliases so the classic editors follow the theme. The theme is applied before first paint.
- **Component library** (`components/ui/`): buttons, icon buttons with rich tooltips, badges, segmented control, slider, select, combobox, text field, colour swatch, tabs, progress bar, empty state, `NumberInput` (expressions, units, scrub, reset, lock), menus (menu bar, submenus, context menu, keyboard navigation), dialog (focus trap), sheet, toasts with Undo, toolbar with flyouts, collapsible panel sections, dock with draggable tabs, preset picker, command palette (fuzzy, recent first).
- **Storybook**: `npm run storybook` / `npm run build-storybook`; eight stories covering every component, with Theme and Accent switches. The build passes.
- **Routes** (`app/(studio)`): `/home` (start screen), `/editor/[projectId]`, `/projects`, `/presets`, `/account`, `/billing`, `/templates`, `/help`. Guests can use `/home`, local editors, `/templates` and `/help`; the others need an account.
- **Start screen**: greeting, search (Ctrl+/) over generators and projects, Blank canvas + 10 generator cards (animated preview on hover, Pro badges, "Last used"), Open from computer / Import image, recent projects with a context menu (Open, Rename, Duplicate, Download, Delete with Undo), welcome card, What's new, Learn links.
- **Dialogs**: New Document (sheet presets incl. "My machine bed", custom size, orientation, units, material, machine), New Project for a generator, Onboarding (laser, units, shortcut set, material; Skip at any time).
- **Document model** (`lib/studio/types.ts`, `doc.ts`): sheets, 30 cut layers, node tree (groups, paths, shapes, text, images, generators, dimensions), guides, grid, snapping; schema version 1 with migrations.
- **Local projects**: IndexedDB store, autosave 1.5 s after a change with a thumbnail; `.hingelab` files (deterministic ZIP) via File → Save to Computer and Open; legacy single-product files are recognised and sent to the classic editor.
- **Editor shell (S1 level)**: menu bar (File, View, Help) with shortcuts, inline rename, sheet W/H, zoom/pan, Document and Generator panels, status bar with cursor position, zoom, units and save state.
- **Libraries**: sheet presets, 8 materials, 8 machine profiles (marked as starting points), generator catalogue, preferences.

Tests: 692 / 692 (25 new: expressions, names, documents, `.hingelab` round trip, library, catalogue, preferences, studio routes, local store, fuzzy search, shortcuts), golden byte-for-byte, `tsc` clean, `next build` OK, `build-storybook` OK. Browser script `scripts/shots/studio-s1.mjs`: 13 checks pass (onboarding saves choices, new document, expression in W, rename survives reload, download is a ZIP named after the project, reopen keeps name and size, generator project, theme persists, Projects asks guests to sign in).

Screenshots: `docs/screenshots/studio-1-onboarding.png`, `studio-1-start.png`, `studio-1-search.png`, `studio-1-new-document.png`, `studio-1-editor.png`, `studio-1-file-menu.png`, `studio-1-recents.png`, `studio-1-new-project.png`, `studio-1-start-light.png`, `studio-1-projects.png`.

Known limitations: the editor has no drawing tools yet (S2); the Generator panel only names the generator (S5); "Move to folder" is disabled until cloud folders (S4); Templates is an empty state (S9); `/app` is still the post-login page (moves to `/home` in S4, D60).

---

## Earlier run (CURSOR_PROMPT / LETTERS / PARAMETRIC briefs)

**Run complete.** Every phase in scope is done and committed locally (nothing pushed): main brief 1–5, Letters L1–L5, Parametric P1–P6. Final gate: 667 / 667 tests including the Hinge Box golden test, `tsc` clean, `next build` OK, every browser script (`scripts/shots/*.mjs`) passing. No blockers (there is no BLOCKERS.md).

**Next step (yours):** work through SETUP.md (hosted Supabase, Stripe test keys, Vercel variables, legal pages), review the commits with `git log`, then push when you are ready to deploy. The Windows desktop app (main brief Phase 6) was built later; see D96 and `DESKTOP_ARCHITECTURE.md`. Decisions made on your behalf are in DECISIONS.md (D1–D59).

Order of the run: main brief Phases 1–5 (Phase 6 Tauri is out of scope) → Letters L2, L4, L5 (L1 and L3 were done earlier) → Parametric P1–P6.

How to check a phase: `npx supabase start` (local stack, see SETUP.md), `npm test`, `npx tsc --noEmit`, `npm run build`. Screenshots: `npm run dev -- -p 3456`, then `node scripts/shots/<phase>.mjs`.

| Phase | Status | Tests |
|---|---|---|
| Main 1 — Port the generator | done (earlier sessions) | 552 / 552 |
| Main 2 — Accounts | done | 561 / 561 |
| Main 3 — Cloud projects | done | 573 / 573 |
| Main 4 — Subscriptions | done (Stripe test mode, no keys yet) | 586 / 586 |
| Main 5 — Landing page | done (not deployed) | 588 / 588 |
| Main 6 — Desktop app | out of scope for this run | |
| Letters L1 — solid | done (earlier sessions) | |
| Letters L2 — stencil | done | 597 / 597 |
| Letters L3 — letter box | done (earlier sessions) | |
| Letters L4 — polish | done | 611 / 611 |
| Letters L5 — plan limits | done | 619 / 619 |
| Parametric P1 — core slicing | done | 632 / 632 |
| Parametric P2 — parallel fins complete | done | 640 / 640 |
| Parametric P3 — stacked + waffle | done | 645 / 645 |
| Parametric P4 — radial + along a curve | done | 652 / 652 |
| Parametric P5 — photo to relief + quality | done | 658 / 658 |
| Parametric P6 — productisation | done (Stripe test mode) | 667 / 667 |

---

## Parametric P6 — Productisation

**Built**
- Plan limits (D54): Free = a library model as parallel fins, up to 30 parts, exported with the "Made with HingeLab" strip below each sheet; Pro = every source, every method, any part count, no mark. One function (`parametricLocks` in `lib/plans.ts`) drives the lock icons on methods and sources, a "Pro:" note in Analysis that names what is locked, Upgrade to Pro on export, and the server check. Locked options can still be previewed. The pricing table and Upgrade dialog list "Parametric sculptures".
- Server export for Free (D56): `/api/export` with `product: "parametric"` checks the plan, slices again with manifold on the server, enforces the 30-part limit and adds the mark (ZIP, single sheet or guide). Pro exports stay in the browser.
- Cloud projects (D55, D57): for Pro, "+ New sculpture" creates a `projects` row with `product = 'parametric'` and the params as JSON, autosaved with a thumbnail. Imported 3D files and photo depth maps go to the private Storage bucket `models` (`{user}/{project}/…`, Pro-only uploads by policy) and are downloaded when a project is opened on a device that does not have them; duplicate copies the file, delete removes it. Free users design in the browser editor (cloud sculptures stay Pro, as the Phase 4 rule and its test require).
- Cut-time estimate (D58): `lib/parametric/cutTime.ts`, speed presets per material for a 40–60 W CO2 laser plus 0.4 s per contour; shown as "Cut time — about N min" in Analysis and in step 1 of the assembly guide.
- Migration `20261010000400_parametric.sql` (bucket and Storage policies), `supabase/config.toml` file limit 100 MiB, privacy page updated for model files, SETUP.md steps for hosted Storage and the cut-speed presets.

**Tests:** 667 / 667, including the Hinge Box golden test. New `lib/billing/__tests__/exportParametric.test.ts` (7 cases: plan rules and messages, cut-time maths and presets, guide text, Free ZIP with the mark on every sheet, the mark sits below the sheet, refusals for methods/sources/parts, Pro clean, request validation) and `lib/projects/__tests__/files.integration.test.ts` (2 cases against the local stack: a Pro user saves a parametric project with its file, another user can neither read nor upload into that folder, copy and delete work; a Free user cannot upload and cannot create a parametric project). `tsc` clean, `next build` OK.

**Browser run** `scripts/shots/parametric-p6.mjs`, against a dev server with dummy test-mode Stripe values (no Stripe account contacted): Free user → "+ New sculpture" opens the browser editor; four methods and three sources locked; cut time shown; the Free ZIP has the mark on both sheets and the guide states the cut time; closer fins (33 parts) and waffle show the Pro note and open Upgrade; the server refuses > 30 parts, radial and photo for Free and builds a Free sheet. The user is made Pro → cloud sculpture from an imported STL as a waffle, saved to the cloud, file in Storage, clean ZIP; after clearing the device the model loads from the cloud. A signed `customer.subscription.deleted` webhook → the gates come back. `parametric-p2.mjs` … `p5.mjs` now sign in as a Pro user first (D59) and all pass.

**Screenshots (stop_and_show: "Pricing gates working in Stripe test mode")**
- `docs/screenshots/parametric-6-free-editor.png` — Free: the head as parallel fins, lock icons on the Pro methods and sources, cut time in Analysis.
- `docs/screenshots/parametric-6-upgrade-dialog.png` — Free with 33 parts: the Pro note and the Upgrade to Pro dialog naming the limit.
- `docs/screenshots/parametric-6-free-waffle-preview.png` — Free previewing a waffle, with the Pro note.
- `docs/screenshots/parametric-6-pro-cloud-waffle.png` — Pro: a cloud sculpture from an imported 3D file as a waffle, "Saved to cloud".
- `docs/screenshots/parametric-6-after-cancel.png` — after the subscription is cancelled (webhook), the same sculpture shows the Pro note again.

**Known limitations**
- A real Stripe checkout was not run (no test keys on this machine); the plan change is made directly in the database or through a signed test webhook, as in Main 4. SETUP.md has the steps for a full test-mode checkout.
- Cut-time presets are typical values, not calibrated to the user's laser, and there is no field to enter your own speeds.
- A Free user's sculptures live only in that browser (no cloud saving on Free).
- On the hosted Supabase Free plan the Storage upload limit is 50 MB, so larger models stay on the device only.
- Server export time for big Free sculptures (up to 30 parts) has not been measured on Vercel.

---

## Parametric P5 — Photo to relief + quality

**Built**
- Photo source (Source → Photo): the photo is resized to 518 px on its long side and run through Depth-Anything-V2-Small (Apache-2.0, int8 ONNX, 27 MB) in a browser worker with onnxruntime-web, on WebGPU when available, otherwise WASM (D50). The status line shows the model download and inference; the Source panel shows the photo and its depth map side by side.
- `lib/parametric/source/relief.ts` (D51): depth map → relief solid. A watertight heightfield over a grid (Detail 8–256 cells), flat back on the wall, an automatic subject mask ("Cut away") or the whole rectangle ("Keep"), and controls for width, max depth, base, smoothing, contrast and invert. The relief goes through the same preparation as an imported model, so all five methods can slice it.
- Deviation and fidelity (`lib/parametric/quality.ts`, D52): 2000 seeded surface samples, exact distance to the nearest part solid, max and mean deviation and a fidelity score in Analysis, computed in the slicer worker after each slice. "Deviation" in the 3D view shows the samples as a heat map (blue on a part → red one spacing away) with a legend.
- Slice Inspector polish (D53): previous/next buttons, arrow keys, Home/End, and the part's area, cut length and sheet number.
- The depth map and two previews are kept in IndexedDB, so the photo source survives a reload; a project whose photo is not on this device falls back to the library model with a message.
- Setup: `npm run fetch:depth-model`, optional `NEXT_PUBLIC_DEPTH_MODEL_URL` (SETUP.md, `.env.example`), licences in `public/models/LICENSES.md`.

**Tests:** 658 / 658, including the Hinge Box golden test. New `relief-quality.test.ts` (6 cases): the relief mesh is watertight (manifold, genus 0) for three option sets, and sampling its top surface matches the depth map within one grid step; a ragged mask and the automatic mask stay watertight; depth-map pack/unpack round trip and damaged-file error; photo → parallel fins end-to-end with deviation stats; exact point-to-prism distances, and on a sphere every in-gap sample is within the gap (s − T) with a mean under half a gap, the same on every run. `tsc` clean, `next build` OK.

**Browser run** `scripts/shots/parametric-p5.mjs`: the test portrait (`scripts/shots/fixtures/portrait.jpg`, an AI-generated image, no rights issue) → depth on WASM → 42 fins on 2 sheets in about 4 s; fidelity 94 %; heat map and legend; inspector buttons and keys; max depth change re-slices; the photo source survives a reload. `parametric-p2.mjs`, `parametric-p3.mjs` and `parametric-p4.mjs` still pass.

**Screenshots (stop_and_show: "A portrait photo turned into a fin sculpture")**
- `docs/screenshots/parametric-5-portrait-fins-3d.png` — the portrait as parallel fins on a backboard, with the photo and depth map in the Source panel.
- `docs/screenshots/parametric-5-portrait-fins-exploded.png` — the fins pulled apart.
- `docs/screenshots/parametric-5-deviation-heatmap.png` — the deviation heat map and legend.
- `docs/screenshots/parametric-5-portrait-sheets.png` — the cut sheets.

**Known limitations**
- Depth from one photo is relative and approximate: faces come out softer than from a 3D scan, and hair or dark clothing can read as far away (the back of the hair in the test portrait becomes a few thin fins).
- No hand-painted mask brush (the brief's optional "brush"); "Cut away" and "Keep" only.
- The model file is not in git; deployments load it from Hugging Face unless `NEXT_PUBLIC_DEPTH_MODEL_URL` is set.
- The first photo downloads 27 MB; later photos on the same page reuse the loaded model.

---

## Parametric P4 — Radial + Along a curve

**Built**
- `lib/parametric/methods/radial.ts` (D47): fins as half-planes round an X, Y or Z axis (count, angle range, hub radius), hub rings at one or both ends with a radial slot per fin and an orientation tick, an inner strip and tabs on every fin, FINS_COLLIDE_AT_HUB with the largest fin count and the smallest hub radius that fit.
- Radial-profile formula source `z = f(theta, s)` (`source/formula.ts`): a closed polar solid for slicing, or exact fin outlines drawn straight from the formula ("Fin shape from: Radial formula").
- `lib/parametric/methods/curveNormal.ts` (D48): fins square to an oval or circle, spaced by arc length; length, height and twist as formulas of t, s and L; an outer outline (oval or polar formula) that clips them; a back plate with one slot per tab (widened for twist) and a centre feature (clock insert 30/37/50/60 mm + 0.2 press fit, opening, or mirror); FINS_COLLIDE for fins that touch.
- The "Leaf clock" preset: a 330 × 200 mm pointed-leaf plate, 56 twisting fins round a 120 × 76 oval and a 60 mm clock insert, from formulas only (no 3D file).
- Editor: Radial and Along a curve are live in the Method control. Method panel per method (axis, hub rings, fin source, count, angles, hub radius/width, buttons to fix a crowded hub; guide shape and size, count or auto spacing, the three formulas, outline, back plate, centre feature, clock insert, "Load the leaf clock"); "Radial z = f(θ, s)" in Source. The model is hidden in 3D when it is not used, radial and curve fins explode outward along their length, and the assembly guide draws the curve back plate front-on with every slot named (D49).

**Tests:** 652 / 652, including the Hinge Box golden test. New `radial-curve.test.ts` (7 cases): "cylinder radial" (r 80 × 120 cylinder, 24 fins round Y, 2 hubs: every fin a 60 × 120 rectangle plus strip and tabs, 15° apart, every tab in exactly one slot of each hub), "hub collision" (80 fins at r 20, T 3 → "at most 31 fins"), radial-profile direct vs. sliced (outlines agree within 1 %), "ellipse curveNormal" (120 × 70, 48 fins: square to the ellipse within 0.01°, no footprints closer than T, slots on the footprints within 1e-6 mm, clock hole 60.2 mm), crowded guide reported + the leaf clock (every fin ends on the leaf outline within 2 mm, plate = outline), exports (sheets, guide, ZIP) for both methods, and regression snapshots (cylinder radial, ellipse curve normal). `tsc` clean, `next build` OK. Browser run `scripts/shots/parametric-p4.mjs`: radial vase 26 parts on 2 sheets, radial-formula sunburst 26 parts on 1 sheet, leaf clock 57 parts on 1 sheet without touching fins, guide saved; `parametric-p2.mjs` and `parametric-p3.mjs` still pass.

**Screenshots:** `parametric-4-leaf-clock-3d.png` (the stop-and-show item), `parametric-4-leaf-clock-exploded.png`, `parametric-4-leaf-clock-sheets.png`, `parametric-4-leaf-clock-guide.png`, `parametric-4-radial-vase-3d.png`, `parametric-4-radial-sunburst-3d.png`.

**Known limitations:** the radial axis is X, Y or Z (turn the model for other directions). Guide curves are ovals and circles only (no SVG path or drawn spline yet). Fin length cannot come from a mesh yet (formulas only). Twisted fins lean past the plate edge near the leaf tips by up to height × sin(twist).

---

## Parametric P3 — Stacked + Waffle

**Built**
- `lib/parametric/methods/stacked.ts` (D43): layers T thick along Y (topographic) or Z (relief from the back); dowel holes through every layer of a chain, with chains split where no common position exists; the outline of the next layer engraved on each layer; optional hollowing with a shell, rings round the dowels and spokes; labels on the hidden area first.
- `lib/parametric/methods/waffle.ts` (D44): two rib families (X × Z standing grid or X × Y wall grid) with half-lap slots split at the middle of every overlap, lap direction choice, the partner id engraved beside every slot, `crossings` in the result.
- Shared pieces moved to `methods/common.ts` (ids, slicing a plane family, clean-up warnings); every method writes its own assembly steps (D46).
- Section clean-up fix (D45): smoothing no longer cuts big corners off long straight edges, and the minimum-feature opening keeps convex corners sharp.
- Editor: Stacked layers and Waffle are live in the Method control; the Method panel shows per-method controls (stack axis, dowels / registration / hollow, dowel count, wall; rib families, lap side, spacing A / B), Joints & Fit shows dowel Ø or lap play as needed, the inspector names layers and ribs, and the 3D planes and explode work for every frame (each family spreads about its own middle).

**Tests:** 645 / 645, including the Hinge Box golden test. New `stacked-waffle.test.ts` (5 cases): "sphere stacked" (r = 100, T = 3: 67 layers, every outline vertex within 0.15 mm of √(100² − h²), one dowel chain, holes concentric through all layers within 1e-6 mm in model space, hole Ø = dowel + play, registration marks present, invariants 1–2), stacked hollow (same parts, under 60 % of the area, invariants hold), "box waffle" (200 × 100 × 150 box, spacing 50: 4 + 3 ribs, 12 crossings, each rib a notched rectangle of area w·h − slots·(T + c)·50, at every crossing the two ribs' material along the crossing line is disjoint and fills the overlap within 1e-6 mm, kerfed slots = T + c − K), square corners survive clean-up, and regression snapshots of the part outlines (sphere parallel, sphere stacked, box waffle). `tsc` clean, `next build` OK. Browser runs: `scripts/shots/parametric-p3.mjs` (mountain stacked out of the wall: 34 parts on 2 sheets, layer L01 with dowels; vase waffle: 18 parts on 2 sheets, guide saved) and `parametric-p2.mjs` again (all checks pass after the clean-up change).

**Screenshots:** `parametric-3-stacked-mountain-3d.png`, `parametric-3-stacked-mountain-sheets.png`, `parametric-3-waffle-vase-3d.png`, `parametric-3-waffle-vase-sheets.png`, `parametric-3-waffle-guide.png`.

**Known limitations:** dowel chains are greedy from the bottom (not globally optimal). Waffle `baseRibs` is not implemented. Small rib pieces that cross nothing are only reported (NO_JOINT), not tied in. Hollowing is never applied to the first and last layer.

---

## Parametric P2 — Parallel fins complete

**Built**
- Tabs and slots (`joints.ts`), the backboard as a plate or a slat board (`backboard.ts`; D35, D36), bridges for floating pieces (D37), stroke-font labels with a wall arrow and the backboard's fin ids (`label.ts`; D38), kerf applied once at the end, bounding-box nesting over several sheets with grain and oversize handling (`nest.ts`; D39), formula sources z = f(x, y) and r = f(h) with a safe expression compiler (`source/formula.ts`; D40).
- Export (`export.ts`; D42): one layered SVG per sheet, the assembly guide (exploded isometric drawing, the backboard at full size with every slot labelled, numbered steps), and a ZIP with all sheets, the guide and the project file.
- The Parametric editor (`components/parametric/ParametricEditor.tsx`, `ParametricDock.tsx`, `ParametricControlBar.tsx`, `Viewport3D.tsx`; D41): Parametric is the third product tab. "3D" tab with model / planes / parts toggles, explode slider and click-to-select; "Sheets" tab with all sheets on the shared canvas (rulers, pan, zoom, layers). Dock: Source (library, 3D file with units and up axis, formula; size and rotation), Method, Material and sheet, Joints & Fit, Quality, Slice Inspector, Analysis (stats and warnings grouped by code with "Show"), Layers & Export. Undo/redo, autosave, open/save project, the imported model kept in IndexedDB, the units prompt for implausible sizes.

**Tests:** 640 / 640, including the Hinge Box golden test. New `fins.test.ts` (8 cases): "formula heightfield" (z = 10·sin(x/20) on 200 × 100 mm, fins along Y follow it within chord tolerance + 0.05 mm), invariant 3 (every tab maps through the placements to exactly one centred slot of nominal size, plate and slats), invariant 4 (parts inside the sheet margins, at least the part gap apart, oversize parts reported), invariant 5 (kerf once: a 100 × 100 plate with a hole and a slot, and the slots in the exported sheet SVG measure T + play − K), invariant 6 (SVG in mm, finite, layer groups in cut order, unique ids; the ZIP holds every file), bridges, formula rejection, grain. The P1 tests now run through tabs, backboard, kerf and nesting too. `tsc` clean, `next build` OK. Browser run `scripts/shots/parametric-p2.mjs`: head with slats 26 parts on 2 sheets, inspector, ZIP and guide downloads, formula surface 31 parts, a broken formula reported, a model in metres asks for units and scales to 300 mm.

**Screenshots:** `parametric-2-face-slats-3d.png`, `parametric-2-sheets.png`, `parametric-2-assembly-guide.png`.

**Known limitations:** nesting is by bounding box (fins with large empty areas waste material). Engraving is on the visible face; "hidden face" places labels near the wall edge (D38). Parametric projects are guest-only (browser storage) until P6. No transform gizmo in 3D (numbers in the Source panel instead) and no "Lay flat on face" or photo source yet (P5). GLB import still has no automated test.

---

## Parametric P1 — Core slicing

**Built**
- `lib/parametric/`: types and defaults; `source/library.ts` (six procedural shapes, including the abstract head, D28); `source/mesh.ts` (STL/OBJ/GLB parsing with the three loaders, vertex welding at 1e-4 of the diagonal, degenerate-triangle removal, open-edge count, units incl. "auto", Z-up to Y-up, centring (D29), rotation, scale, target size, meshoptimizer simplification over 300k triangles); `slice/planes.ts`, `slice/section.ts` (manifold-3d slicing, plus a fallback triangle–plane stitcher for open meshes), `slice/clean.ts` (union, wall cut in 2D (D30), RDP + Chaikin with the wall points pinned, minimum-feature opening, small islands; D31); `methods/parallel.ts` (fins F01…Fn, short fins and floating pieces reported; D32); `engine.ts` (`loadSource`, `computeParametric` with manifold injected).
- Slicing worker `components/parametric/slicer.worker.ts` with a small client (`slicerProtocol.ts`); manifold-3d is copied to `public/manifold` by `scripts/copy-wasm.js` (renamed from `copy-harfbuzz.js`; D33).
- Hidden debug page `/app/parametric-debug`: three.js view of the model, the planes and the fins extruded to T at their placement; source picker, STL/OBJ/GLB import, axis, spacing, phase, smoothing, scale; the selected plane's section; every fin outline; the warning report.

**Tests:** 632 / 632, including the Hinge Box golden test. New `parallel.test.ts` (6 cases): "sphere parallel" (radius 100, subdivision 6, spacing 10, K 0, smoothing 0: 20 half-disc fins, every vertex on radius √(100² − d²) within 0.15 mm, wall edge exactly at 0), the same with the fallback section method, invariants 1–2 (simple polygons, holes inside outers, exactly one connected component at 10 px/mm) for the sphere and the head, an open mesh reported as NON_MANIFOLD and sliced with the fallback, short fins reported, every library mesh closed and outward. New `mesh.test.ts` (7 cases): binary STL, OBJ, welding, auto units, normalising, open-edge warning, simplification. `tsc` clean, `next build` OK. Browser run `scripts/shots/parametric-p1.mjs`: head 21 fins (manifold, 79 ms), sphere 20 fins at spacing 10 (35 ms), an imported STL box sliced and centred.

**Screenshots:** `parametric-1-head-fins.png`, `parametric-1-head-fin-outlines.png`, `parametric-1-sphere-fins.png`.

**Known limitations:** no backboard, tabs, bridges, labels or sheet layout yet (P2). Only the parallel method; other methods fall back to it with METHOD_NOT_READY. The "ask for units" prompt and GLB import have no UI test yet (D34).


## Letters L5 — Plan limits

**Built**
- Free plan: every Letters mode can be previewed (canvas, 3D, Analysis); export works only for a Letter Box of a single letter, with the "Made with HingeLab" mark. Exporting anything else opens Upgrade to Pro; Solid and Stencil show a lock (D27).
- Enforced on the server: `/api/export` now builds Letters SVGs too (`lib/billing/exportLetters.ts`, `lib/billing/letterFonts.ts`), with HarfBuzz and the bundled fonts on the server, uploaded fonts sent with the request (up to 3 MB, not stored).
- Pricing table row: Letters for Free is "Preview, and one-letter boxes". The font upload note and the privacy page mention that an export sends the uploaded font to build the file.

**Tests:** 619 / 619, including the Hinge Box golden test. New `exportLetters.test.ts` (8 cases: character counting incl. Persian, combining marks and emoji; the Free/Pro rule; Free single-letter export = editor export + mark; Pro export byte-identical to the editor for box, solid, stencil and Persian; 403/422 cases; request parsing; server font loading from `public/fonts` and from a base64 upload, with oversize/empty/not-a-font refused). `tsc` clean, `next build` OK; the export function's trace includes the fonts and the HarfBuzz WASM. Browser run `scripts/shots/letters-l5.mjs` against local Supabase: Free locks, upgrade dialog, server 403 for a word and for Solid, single-letter box download with the mark, then Pro exports the word cleanly and the server builds a stencil. A production `next start` returned the same results.

**Screenshots:** `letters-5-free-preview.png`, `letters-5-upgrade-dialog.png`, `letters-5-free-single-letter.png`.

**Known limitations:** a Free user still sees the full drawing on the canvas (same as D15). Pro users with an uploaded font over 3 MB export in the browser instead of on the server.

## Letters L4 — Polish

**Built**
- Marquee light holes (`lib/letters/marquee.ts`): round bulb holes along each letter's strokes, clear of the walls by the margin, at least the spacing apart, through the lid and lid lip (or the base of an open tray). Settings in the Box panel: hole diameter, spacing, margin (D23).
- Small pieces: "Stack to full height" cuts each flat dot or accent `round(depth / T)` times to glue into a stack (D24). Cut flat / Leave out were already there.
- Wall splitting at the maximum wall length (seams on flats, or a 10 mm glued splice on a curve) was already built in L3; unchanged.
- 3D preview with three.js (`lib/letters/scene3d.ts`, `components/letters/LetterPreview3D.tsx`): plates, walls with the hinge zones tinted green / amber / red, light holes, small pieces; drag to orbit, scroll to zoom, "Lift lid" slider; Solid and Stencil show as flat sheets. Loaded lazily (D25).
- Analysis: tightest radius against the hinge limit per letter, light holes, longest strip, warnings and notes in separate lists (D26).

**Tests:** 611 / 611, including the Hinge Box golden test. New: `marquee.test.ts` (9 cases: holes in lid and lip only, clear of walls and counters by T + margin + r, spacing kept, open tray uses the base, flat panels, turned-off settings change nothing byte-for-byte, warning when no hole fits, stacked dots count and naming) and `scene3d.test.ts` (5 cases: closed box is exactly `depth` tall, open tray T + wall height, lifted lid, zone tinting, light holes in the lid mesh, flat Solid/Stencil). `tsc` clean, `next build` OK. Browser run `scripts/shots/letters-l4.mjs` passes (WebGL canvas present, Analysis reports the holes).

**Screenshots:** `letters-4-box-3d.png`, `letters-4-preview-sam.png`, `letters-4-preview-lid-lifted.png`, `letters-4-preview-marquee.png`, `letters-4-marquee-sheet.png`, `letters-4-analysis.png`, `letters-4-preview-persian.png`.

**Known limitations:** the 3D walls are drawn on the wall centerline without the hinge slits themselves (they are tinted instead), and tabs and slots are not modelled. Marquee holes are not placed around engraved labels; turn Labels off or move them if they overlap.

## Letters L2 — Stencil

**Built**
- Stencil mode in `lib/letters/stencil.ts`: the text is cut out of one sheet (text bounds + margin). Every counter (A, B, O, P, Q, R, 8, Persian ف, ه …) gets 1 or 2 bridges across its thinnest stroke so the centre stays attached (D21). Kerf, label and export work like Solid.
- UI: the Stencil mode button is enabled; the Stencil panel has bridges per centre (One / Two), bridge width and sheet margin. Analysis reports how many bridges hold how many centres, and warns if a centre could not be bridged. The debug page has a Stencil option.

**Tests:** 597 / 597, including the Hinge Box golden test. New test 9 (`stencil.test.ts`, 9 cases): "ABOPQR8" with defaults, two bridges, small size + kerf, welded with negative spacing, and Persian "هشت ۸ ۰ ف"; each sheet is rasterised and flood-filled from the border to prove nothing floats. It also checks the bridge count, the 120° spread, a sheet with no counters ("HI"), and the export paths. `tsc` clean, `next build` OK. Browser run `scripts/shots/letters-l2.mjs` passes.

**Screenshots:** `letters-2-stencil-abopqr8.png`, `letters-2-stencil-two-bridges.png`, `letters-2-stencil-persian.png`, `letters-2-stencil-debug.png`.

**Known limitations:** bridges are straight and placed by a ray search, not by a medial axis, so on very irregular display fonts a bridge can sit a little off the visually thinnest point. Very small counters (under (2 × bridge width)²) are left as plain holes.

## Main 5 — Landing page

**Built**
- `/`: hero with a live mini generator (shape, width, height → 3D box and the real cut sheet on a laser bed, traced once in cut order; D19), How it works (3 steps and the layer colors), a gallery of four engine-built boxes, pricing table from `lib/plans.ts`, FAQ (kerf, materials, LightBurn, account, Pro, cancelling), footer with Terms and Privacy.
- `/terms` and `/privacy`: plain-language drafts matching what the app does (D20).
- SEO: title template, description, canonical URLs, Open Graph and Twitter tags, generated Open Graph image (`app/opengraph-image.tsx`), favicon (`app/icon.svg`), `robots.txt`, `sitemap.xml`. Site URL from `NEXT_PUBLIC_SITE_URL`.
- Not deployed (run rule 5). SETUP.md "Before launch" lists the domain, legal review and preview check.

**Tests:** 588 / 588 (new: gallery boxes build, and the hero generator builds for every shape across the whole slider range — 4 × 23 × 13 combinations). Browser run `scripts/shots/phase5.mjs`: headline, live update after changing shape and height, gallery, pricing, FAQ, SEO tags, OG image renders as PNG, robots and sitemap, no horizontal scroll on a 390 px phone; all passing. `tsc` clean, `next build` OK (landing, terms, privacy, robots, sitemap, OG image all static).

**Screenshots:** `main-5-hero-cutting.png` (laser trace mid-way), `main-5-hero.png`, `main-5-hero-cylinder.png`, `main-5-landing-full.png`, `main-5-landing-mobile.png`, `main-5-terms.png`, `main-5-og-image.png`.

**Known limitations:** the gallery shows engine renders, not photos of real cut boxes; replace or add photos once you have them. The Open Graph image uses the default sans font (no network fetch at build time).

## Main 4 — Subscriptions (Stripe)

**Built**
- `lib/plans.ts`: prices ($9/month, $79/year), Free limits (3 cloud projects, Rounded + Straight), the plan table rows, `hingeLocks`, `planForStatus`, and `addWatermark` (8 mm strip with a "Made with HingeLab" engrave layer, D16).
- Server-side limits (D15): migration `20261010000300_plan_limits.sql` (project count, Pro shapes/patterns, parametric for Free) and `POST /api/export`, which builds the SVG on the server with the caller's plan (403 for Pro features on Free, mark for Free).
- Stripe: `lib/stripe.ts` (refuses live keys unless `STRIPE_ALLOW_LIVE=true`), `POST /api/stripe/checkout` (creates the customer, subscription Checkout), `POST /api/stripe/portal`, `POST /api/stripe/webhook` (signature check, `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed`; logic in `lib/billing/events.ts`, D18).
- Editor: lock icons on Pro shapes and patterns, preview allowed (D14), "Upgrade to Pro" dialog on export, export and Copy SVG through `/api/export` when accounts exist, cloud save status "Not saved — Pro feature".
- Billing page `/app/billing`: current plan, renewal date or payment-failed notice, Free vs Pro cards, Upgrade monthly/yearly, Manage billing, checkout success/cancel notices, "Billing is not set up" state. My boxes shows "N of 3 cloud projects" with an upgrade link.
- `scripts/stripe-setup.mjs` creates the test product and prices (test keys only). SETUP.md has the Stripe checklist and the full Vercel variable list; `.env.example` updated.

**Tests:** 586 / 586 (new: 10 billing unit tests — plan rules, Pro export byte-identical to the engine, Free mark layer and size, Free refusal, webhook events parsed through real signature verification, out-of-order safety, bad signature; 2 integration tests against local Supabase — Free limits in the database and the webhook store upgrading a user; 1 scheduler test for refused saves). Browser run `scripts/shots/phase4.mjs` against a dev server with dummy test values: locks, preview, upgrade dialog, server 403, Free export with mark, 4th project refused, checkout error handled, bad-signature webhook 400, Pro clean export, signed `invoice.payment_failed` → past_due, signed `customer.subscription.deleted` → Free; all passing. `tsc` clean, `next build` OK.

**Screenshots:** `main-4-editor-free-locks.png`, `main-4-upgrade-dialog.png`, `main-4-project-limit.png`, `main-4-billing-free.png`, `main-4-billing-pro.png`, `main-4-editor-pro.png`.

**Known limitations:** a real Checkout and Customer Portal were not run (no Stripe account yet; SETUP.md steps 1–6 take about 10 minutes). Letters is still open to Free until Letters L5. Parametric is refused for Free until P6 defines its free tier.

## Main 3 — Cloud projects

**Built**
- Migration `20261010000200_projects.sql`: `projects` table as in the brief (plus checks on product, name length, params type, thumbnail size), RLS `own projects`, index, `updated_at` trigger (server clock).
- `lib/projects`: product ids and defaults, `.hingelab.json` parsing (old files = Hinge Box), `repo.ts` (list/get/create/save/rename/duplicate/delete through the user's client, so RLS applies), `sync.ts` (newer-copy-wins choice and the 1.5 s `SaveScheduler` with offline retry), `thumbnail.ts`.
- Server actions `app/app/actions.ts` (create, import, duplicate, rename, delete).
- **My boxes** `/app`: grid of cards with thumbnail, name, product, last edited; Open / Duplicate / Rename / Delete; New box, New letters, Open project file….
- Editor `/app/editor/<uuid>` loads the project server-side (404 for other users' ids); Hinge Box and Letters editors autosave to the cloud with status "Saving…" / "Saved to cloud" / "Offline — saved locally" (`hooks/useCloudAutosave.ts`, D10); File → New and Open project create cloud projects (D13); product switch starts a new project (D11). `/app/editor/local` keeps the guest editor with localStorage.
- `engine_version` stored per project (`ENGINE_VERSION = 1`).

**Tests:** 573 / 573 (new: 10 unit tests for sync/scheduler/file parsing/thumbnail with fake timers, 2 integration tests: full project lifecycle and cross-user privacy incl. forged `user_id`). Browser run `scripts/shots/phase3.mjs`: create → edit → saved to cloud → offline → back online → reload → second computer → rename → duplicate → delete, all passing. `tsc` clean, `next build` OK.

**Screenshots:** `main-3-my-boxes-empty.png`, `main-3-editor-saved-to-cloud.png`, `main-3-editor-offline.png`, `main-3-my-boxes.png`, `main-3-my-boxes-duplicated.png`.

**Known limitations:** no realtime merge between two tabs editing the same project at once (last save wins). Uploaded Letters fonts stay on the device they were uploaded on (IndexedDB), so a Letters project that uses one shows the default font elsewhere.

## Main 2 — Accounts (Supabase Auth)

**Built**
- Supabase clients: `lib/supabase/{config,client,server,admin,types}.ts`. Guest mode when the keys are missing (DECISIONS D4).
- `middleware.ts`: refreshes the session cookie and guards `/app/*` (except the guest editor `/app/editor/local` and debug pages, D5). Route rules are pure functions in `lib/auth/routes.ts`; `next` targets are same-site only.
- Pages `/login`, `/signup`, `/reset-password`, `/update-password` in the dark design (`components/auth/AuthForm.tsx`, `app/site.css`); email/password and "Continue with Google"; `/auth/callback` (OAuth code, email confirmation, password recovery) and `/auth/signout` (POST).
- Menubar account menu (avatar → My boxes, Billing, Sign out; "Sign in" for guests).
- Migration `20261010000100_profiles.sql`: `profiles` table, read-only RLS for the owner (D6), sign-up trigger.
- Local Supabase stack config (`supabase/config.toml`, ports 5542x, D7). `.env.example`, SETUP.md.

**Tests:** 561 / 561 (new: 7 route/validation tests, 2 integration tests against the local stack: profile created on sign-up, RLS hides other profiles and blocks self-upgrade). `tsc` clean, `next build` OK.

**Screenshots:** `docs/screenshots/main-2-login-redirect.png`, `main-2-signup-validation.png`, `main-2-editor-account-menu.png`.

**Known limitations:** Google sign-in needs the owner's Google OAuth client (SETUP.md). `/app` and `/app/billing` are placeholders until Phases 3 and 4.

## Main 1 — Port the generator (done before this run)

**Built:** `lib/hinge` (pure geometry engine ported line by line from the prototype), the editor at `/app/editor/local` (menubar, control bar, tool rail, canvas with rulers, panel dock, 3D preview, status bar), undo/redo, localStorage autosave, SVG and project downloads. The home page redirects to the editor until the landing page exists.

**Tests:** 552 / 552 pass, including the 198-case golden test (byte-for-byte) and the 192-case invariant test.

**Known limitations:** none specific to the Hinge Box.
