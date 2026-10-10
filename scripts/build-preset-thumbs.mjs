// Builds public/presets/<product>/<id>.svg from the real geometry of every built-in preset.
// Usage: node scripts/build-preset-thumbs.mjs
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vite-node", "-c", "vitest.config.ts", "scripts/preset-thumbs.ts"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
