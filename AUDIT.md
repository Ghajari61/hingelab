# HingeLab audit (redesign phase 0)

Taken on branch `redesign/unified-app` before any redesign change. Numbers are in [PERF.md](PERF.md); decisions in [DECISIONS.md](DECISIONS.md) (D186).

## Repo structure

| Area | Where | Notes |
|---|---|---|
| Web app | `app/` (Next.js 15 App Router), `components/`, `hooks/`, `styles/` | Server pages are thin; every editor is a client component. |
| Geometry and generators | `lib/` (`hinge`, `letters`, `parametric`, `generators/*`, `paperbox`, `fit`, `export`, `nest`) | Pure TypeScript, shared by the browser, the server export and tests. |
| Desktop app | `desktop/src` (Vite + React, 23 files, ~3,900 lines), `desktop/src-tauri/src` (Rust, ~2,000 lines) | A client of the website's API; its own UI. |
| Server API | `app/api/*`, `app/api/desktop/*`, `lib/billing/*`, `lib/desktop/*` | Plan checks, export, desktop tokens and generate. |
| Design system | `styles/tokens.css`, `components/ui/*` (Tooltip, IconButton, Badge, SegmentedControl, Slider, Select, TextField, Tabs, Dialog, Sheet, Toast, Toolbar, Combobox, CommandPalette, PresetPicker, EmptyState and more) | Storybook in `.storybook/`. |
| Database | `supabase/migrations` | Not changed by this work except additively. |

Products: Hinge Box, Letters, Parametric, and the generators Clock, Puzzle, QR Code, Boxes, Cake Topper, Key Holder, Sign, Table Numbers, Trophy, Shadow Box and Paper Box (14).

## Desktop shell vs web: duplicated UI

| Desktop (`desktop/src`) | Web equivalent |
|---|---|
| Dashboard (`Pages.tsx`) | `/home` (`StartScreen`) |
| Generators (`Pages.tsx`) | `/generators`, the start gallery |
| Workspace + Canvas + SettingsPanel + View3D | `/app/editor/[id]` (`EditorRoot` → `Workspace` → the product editors) |
| Recent, Favorites | `/projects`, `/presets`, `/bookmarks` |
| Subscription | `/billing` |
| Settings | `/preferences`, `/account` |
| AI page (`AIPage.tsx`) | `/app/ai` |
| Website view (`Web.tsx`, `web.rs`) | the website itself in a second webview |

Desktop-only today: the true-scale bed with mm rulers, the export folder and "open after export", recent project files, offline `.oclc` files opened by double-click, and the updater card.

## Desktop vs web branches in code

- `components/editor/Workspace.tsx`: `?desktop-open=1` handover (`window.hingelabDesktopOpen`) used by the website view to open a `.oclc` passed from Rust (`web.rs` polls for it).
- `lib/desktop/http.ts`, `lib/desktop/version.ts`: the `x-hingelab-client: desktop/<v>` header and bearer realm.
- `lib/auth/routes.ts`: `/desktop` in the account paths. `lib/security/rateLimit.ts`: desktop limits.
- `app/api/desktop/*`, `app/(auth)/desktop/authorize`: desktop-only routes.
- No `__TAURI__`/`isDesktop` checks anywhere in `components/`, `app/` or `hooks/`.

Rule D96 ("the EXE is untrusted"): the EXE ships no geometry; `scripts/desktop/scan.mjs` fails a build containing secret patterns or geometry markers (`computeModel`, `arrangeGenerator`, ...).

## Bundle size per route (first load, gzip)

See PERF.md for the table. Heaviest client dependencies: three.js (3D view, ~177 KB lazy), manifold-3d wasm (Parametric), clipper-lib (polygon booleans, in every editor), HarfBuzz wasm and 51 Letters fonts (6.97 MB, unsubset), qrcode-generator, the mesh loaders (STL, OBJ, GLTF, lazy), ONNX depth model (lazy).

## Main thread vs workers

Workers: nesting (`nest.worker`), Parametric slicing and booleans (`slicer.worker`), depth (`depth.worker`), photo and levels (`photo.worker`, `levels.worker`), Studio trace and imaging. Main thread: Hinge Box model, layout and checks (`arrangeHinge`, `layerContent`, `hingeIssues`), the generators' build and arrangement before nesting, Letters, the export SVG and DXF and watertight merging.

## Design tokens and inconsistencies

- `styles/tokens.css` is the web source (themes light, dark, darker; four accents; status, brand, CTA, LightBurn palette `--c00..--c29`, radii, spacing 2-32 px, type, motion, shadows) plus legacy aliases.
- `desktop/src/styles.css` copies the values by hand (149 hard-coded hex colours) with different names (`--font` vs `--font-ui`, `--accent-soft`).
- Operation colours differ: canvas `--l-outline #E5383B`, `--l-slots #1FA94F`, `--l-hinge #2F80ED`; export `#FF0000`, `#00E000`, `#0000FF`; score is `#FF8000` in the Hinge export but `#0000FF` in the AI legend and `#3B6FD8` in share thumbnails; `--l-score` is undefined.
- Hard-coded hex colours: `studio.css` 49, `shell.css` 47, `landing.css` 36, `site.css` 28, about 333 in TS/TSX.

## Copy issues found

- "Save ~30%" on the yearly toggle (true for Pro, about 17% for Business).
- Licensing contradicts itself between `lib/plans.ts` (Business commercial licence; comment says Free and Pro may sell what they cut), the comparison table (Free and Pro "personal and commercial cutting"), entitlements (`commercialUse: business` only), the terms and the FAQ.
- Terms mention "Free exports carry a small mark" while Free can't export.
- Shadow Box: "132 designs" in `catalog.ts`, `ids.ts`, `startPresets.ts` and the help, while 134 presets exist.
- Nav item "Studio" links to `/home`.
- Download block shows version and size from `desktop/releases/stable.json`, no SHA-256.

## Tooling gaps

No ESLint config, no lint or typecheck script, no bundle analyzer, no Lighthouse setup, no Windows signing; one CI workflow (`licences.yml`). Added in phase 0: `eslint.config.mjs`, `npm run lint`, `npm run typecheck`, `npm run analyze`, `scripts/perf/latency.mjs`.
