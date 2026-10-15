// Times the preview path of every product (lib/perf/__tests__/preview.test.ts) on its own, so other
// test files running in parallel do not skew the numbers. Pass a file path to keep the table.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const report = process.argv[2] ? resolve(process.argv[2]) : "";
const r = spawnSync("npx", ["vitest", "run", "lib/perf/__tests__/preview.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PERF: "1", ...(report ? { PERF_REPORT: report } : {}) },
});
process.exit(r.status ?? 1);
