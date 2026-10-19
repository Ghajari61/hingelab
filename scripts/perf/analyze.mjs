// Production build with the bundle analyzer: reports in .next-build/analyze/{client,nodejs,edge}.html.
// Usage: npm run analyze. Then node scripts/perf/budgets.mjs --verbose for the per-route numbers.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true, env: { ...process.env, ANALYZE: "1", NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-build" } });
process.exit(r.status ?? 1);
