// Builds public/rail/*.svg and lib/railArt.generated.ts: the left-rail card pictures rendered from the real geometry.
// Usage: node scripts/build-rail-art.mjs
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vite-node", "-c", "vitest.config.ts", "scripts/rail-art.ts"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
