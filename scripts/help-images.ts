// Run through scripts/build-help-images.mjs (vite-node, so the "@/" alias resolves).
// Draws the help centre's figures from the real geometry into public/help/svg/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULTS, clone, computeModel, inspectorSVG, type Params } from "@/lib/hinge";

const dir = join(process.cwd(), "public", "help", "svg");
mkdirSync(dir, { recursive: true });

for (const pattern of ["straight", "wave", "relief", "serpentine"] as const) {
  const p: Params = { ...clone(DEFAULTS), pattern };
  const m = computeModel(p);
  if ("error" in m) throw new Error(`${pattern}: ${m.error}`);
  const r = inspectorSVG(m, p);
  if (!r) throw new Error(`${pattern}: no hinge to draw`);
  const svg = r.svg.replace("<svg ", '<svg width="320" height="260" ');
  writeFileSync(join(dir, `pattern-${pattern}.svg`), svg);
  console.log(`pattern-${pattern}.svg ${(svg.length / 1024).toFixed(1)} kB`);
}
