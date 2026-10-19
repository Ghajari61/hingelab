// Optimises the preset pictures in public/presets with SVGO (in place). Pictures only: cut files
// are never touched. Usage: node scripts/perf/svgo-presets.mjs [dir]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { optimize } from "svgo";

/** Safe for drawings shown with <img>: keeps the viewBox and two decimals (the pictures are 300 px wide). */
export const SVGO_CONFIG = {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    { name: "preset-default", params: { overrides: { removeViewBox: false, cleanupIds: false } } },
  ],
};

export const optimiseSVG = (svg) => optimize(svg, SVGO_CONFIG).data;

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".svg") ? [p] : [];
  });
}

if (process.argv[1]?.endsWith("svgo-presets.mjs")) {
  const dir = process.argv[2] ?? "public/presets";
  let before = 0, after = 0, n = 0;
  for (const f of files(dir)) {
    const src = readFileSync(f, "utf8");
    const out = optimiseSVG(src);
    before += src.length;
    if (out.length < src.length) { writeFileSync(f, out); after += out.length; n++; } else after += src.length;
  }
  console.log(`${n} pictures optimised: ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB`);
}
