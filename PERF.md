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

## After

Filled in at phase 5.
