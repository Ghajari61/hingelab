# Performance

How measured: a production build (`NEXT_DIST_DIR=.next-build next build`), `next start` on this PC, Lighthouse 12 (mobile profile, simulated throttling, headless Chrome), `node scripts/perf/budgets.mjs --verbose` (gzip JS), and `node scripts/perf/latency.mjs` (Playwright: key press in the editor's first number field to the next paint after the canvas changes, 25 presses).

## Baseline (before the redesign, 19 Oct 2026)

| Measure | Landing `/` | Editor `/app/editor/local?p=hinge` |
|---|---|---|
| Lighthouse performance | 72 | 80 |
| Accessibility / Best practices / SEO | 96 / 100 / 100 | 92 / 100 / 91 |
| LCP | 5.4 s | 5.3 s |
| FCP | 3.6 s | 1.4 s |
| TBT / CLS | 0 ms / 0 | 60 ms / 0.045 |
| First-load JS (gzip) | 314.5 KB | 104.5 KB page + 284.3 KB editor shell and Hinge Box (lazy) |
| Input latency, median / p90 | | 14 ms / 19 ms |

Other first-load JS: `/home` 252.3 KB, `/projects` 233.8 KB, `/templates` 245.5 KB, `/account` 219.9 KB, shared by all 105 KB. Lazy editor chunks: Letters 32.0 KB, Parametric 229.0 KB, 3D view (three.js) 177.0 KB, generator editor 33.6 KB, generators 9.7-39.3 KB each.

Over budget at baseline: `/` (250 KB), `/home` (250 KB), editor shell and Hinge Box (162 KB).

## After phase 2 (lighter and faster)

| Measure | Baseline | After phase 2 |
|---|---|---|
| First-load JS, landing `/` | 314.5 KB | 134.1 KB |
| First-load JS, `/home` | 252.3 KB | 186.2 KB |
| First-load JS, other pages | 199 KB | 104-177 KB |
| Editor shell and Hinge Box (lazy) | 284.3 KB | 154.4 KB |
| Parametric editor (lazy, without three.js) | 229.0 KB | 55.0 KB |
| Hinge Box input latency, median / p90 | 14 ms / 19 ms | 7 ms / 9 ms |
| Shadow Box "Oval weave", slowest key press | about 380 ms (its build, on the page) | 40 ms (3 of 30 key events over 16 ms) |
| Landing Lighthouse performance / LCP | 72 / 5.4 s | 80 / 4.5 s |
| Preset pictures in `public/presets` | 7.20 MB | 4.42 MB |
| Windows installer | 4.5 MB (no geometry) | 10.2 MB (the editors, geometry, fonts and pictures) |

What changed:

- supabase-js (about 65 KB) loads on first use, and the session check waits until the page is idle. It used to be in every page's first load through the site header.
- The landing demo's Hinge Box engine loads when the demo nears the screen; the server draws its first box.
- opentype.js (about 64 KB) loads only when a font is parsed. The font list moved to `lib/letters/fontList.ts`.
- three.js is its own chunk in Parametric too.
- Generator designs that take over 30 ms to build go to a build worker (`components/generators/build.worker.ts`), 150 ms after the last change, keeping the last result on screen. Build times of all 364 presets on this PC: median 5.8 ms, 90th percentile 48 ms, slowest 379 ms (Shadow Box "Oval weave").
- SVGO over the 436 preset pictures; new thumbnails are optimised as they are made.
- The Windows program no longer contains local paths (`--remap-path-prefix`); the build fails if one comes back.

Measured with `scripts/perf/latency.mjs` (key press to canvas), `scripts/perf/inp.mjs` (Event Timing duration of key presses on a slow design) and `scripts/perf/budgets.mjs`, on a production build with `next start`. The landing page's LCP element is a product picture below the hero; it is addressed with the landing redesign in phase 3.

## After (phase 5)

Filled in at phase 5.
