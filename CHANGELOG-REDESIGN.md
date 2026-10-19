# Redesign changelog (branch `redesign/unified-app`)

## Phase 0: audit

- `AUDIT.md` (structure, duplication, branches, bundles, workers, tokens, copy issues) and the baseline in `PERF.md`.
- Tooling: ESLint flat config (`eslint.config.mjs`, `npm run lint`), `npm run typecheck`, the bundle analyzer (`npm run analyze`), the editor latency script (`scripts/perf/latency.mjs`). Lint errors fixed (unescaped quotes in JSX text).
- Decisions D186 (R1-R9) in `DECISIONS.md`.

## Phase 1: one app for web and desktop

- `packages/platform`: one interface for files, export, project files, sign-in and session, updates, links and the router, with a website implementation and a Windows implementation (Rust commands). Every editor's downloads and exports go through it.
- `packages/app`: the entry point to the shared app (the start gallery and every editor), the routes (`/editor/<product>`) and `useSession()`. ESLint keeps the shared folders free of Next.js and Tauri imports.
- `packages/ui/lazy.tsx` replaces `next/dynamic` in the editors.
- Server: `/api/export` accepts the Windows app's token (`requestPlan`), with the same version gate and plan checks as the other desktop routes.
- Windows app: renders the website's editor with geometry on the computer; the native workspace and its 12 Rust commands are gone; new commands `api_request`, `save_file`, `open_file` and `open_external`, each allow-listed. Project files page, error boundary, scoped stylesheet, self-hosted fonts, website view kept for Studio, AI Studio and cloud projects.
- Website: self-hosted interface fonts (no Google Fonts), `/editor/<product>` redirects to the editor.
- Tests: the adapter contract and routes, the token path of `/api/export`, the Rust allow-lists. Decisions in D188.

## Phase 2: lighter and faster

- First-load JS: landing 314 → 134 KB, `/home` 252 → 186 KB, every other page down by about 65 KB; editor shell and Hinge Box 284 → 154 KB; Parametric 229 → 55 KB without three.js.
- Supabase and the font parser load on first use; the landing demo's engine when the demo nears the screen; three.js in its own chunk in Parametric.
- A build worker for slow generator designs (Shadow Box, signs, large puzzles), 150 ms after the last change, keeping the last result on screen.
- SVGO over the preset pictures (7.2 → 4.4 MB); new thumbnails optimised as they are made.
- The Windows program carries no local paths; the build checks it.
- Budgets tightened; numbers in `PERF.md`; decisions in D189.
