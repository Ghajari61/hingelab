// Builds public/help/svg/*.svg from the real geometry. Usage: node scripts/build-help-images.mjs
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vite-node", "-c", "vitest.config.ts", "scripts/help-images.ts"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
