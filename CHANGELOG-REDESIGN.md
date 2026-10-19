# Redesign changelog (branch `redesign/unified-app`)

## Phase 0: audit

- `AUDIT.md` (structure, duplication, branches, bundles, workers, tokens, copy issues) and the baseline in `PERF.md`.
- Tooling: ESLint flat config (`eslint.config.mjs`, `npm run lint`), `npm run typecheck`, the bundle analyzer (`npm run analyze`), the editor latency script (`scripts/perf/latency.mjs`). Lint errors fixed (unescaped quotes in JSX text).
- Decisions D186 (R1-R9) in `DECISIONS.md`.
