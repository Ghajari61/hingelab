// Builds the template library: public/templates/files, public/templates/thumbs and lib/templates/built.json.
// Usage: node scripts/build-templates.mjs   (TEMPLATE_ARCHIVE=<folder> to read the imported designs elsewhere)
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vite-node", "-c", "vitest.config.ts", "scripts/templates/build.ts"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
