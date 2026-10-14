// JS budgets from a production build: first-load JS per page and the lazy editor chunks, gzipped
// as Next reports them. Usage: NEXT_DIST_DIR=.next-build npx next build, then
// node scripts/perf/budgets.mjs [--verbose]. Exits 1 when a budget is broken.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dist = path.resolve(process.env.NEXT_DIST_DIR || ".next-build");
const verbose = process.argv.includes("--verbose");
const KB = 1024;

/** First-load JS per page, in KB (gzip). The landing page and the app's home pages are the tightest. */
const PAGE_BUDGET = 250;
/**
 * Code that loads when an editor opens, on top of its page (gzip, KB). Chunks shared with the shell
 * count again here, so these overstate what is downloaded. Each budget is the U9 measurement plus
 * roughly 15–25 %; the slicer, depth model, HarfBuzz and fonts load later and are not counted.
 */
const LAZY_BUDGETS = {
  // Every editor's sheet grid, typed sums and units, and the rail's search and favourites (D159): 150 → 154 KB.
  "Editor shell + Hinge Box": { key: /EditorRoot\.tsx -> \.\/Workspace$/, kb: 154 },
  "Letters editor": { key: /Workspace\.tsx -> @\/components\/letters\/LettersEditor$/, kb: 145 },
  "Parametric editor": { key: /Workspace\.tsx -> @\/components\/parametric\/ParametricEditor$/, kb: 330 },
  "3D view (three.js)": { key: /EditorApp\.tsx -> \.\/HingeView3D$/, kb: 195 },
  "Generator editor": { key: /Workspace\.tsx -> @\/components\/generators\/GeneratorEditor$/, kb: 125 },
  "Clock generator": { key: /registry\.ts -> \.\/clock$/, kb: 15 },
  "Puzzle generator": { key: /registry\.ts -> \.\/puzzle$/, kb: 15 },
  "QR Code generator": { key: /registry\.ts -> \.\/qr$/, kb: 25 },
  // Boxes version 2 (D109) added five designs and three lids: 10 → 25 KB.
  "Boxes generator": { key: /registry\.ts -> \.\/boxes$/, kb: 30 },
  "Cake Topper generator": { key: /registry\.ts -> \.\/topper$/, kb: 18 },
  "Key Holder generator": { key: /registry\.ts -> \.\/keyrack$/, kb: 17 },
  "Sign generator": { key: /registry\.ts -> \.\/sign$/, kb: 20 },
  "Table Numbers generator": { key: /registry\.ts -> \.\/tablenum$/, kb: 19 },
  "Trophy generator": { key: /registry\.ts -> \.\/trophy$/, kb: 18 },
  // The Your picture pattern (D160): sample shapes, picture layers and bridges for loose pieces, 32 → 37 KB.
  "Shadow Box generator": { key: /registry\.ts -> \.\/shadowbox$/, kb: 37 },
};

const gz = new Map();
const size = (file) => {
  if (!gz.has(file)) gz.set(file, zlib.gzipSync(fs.readFileSync(path.join(dist, file))).length);
  return gz.get(file);
};
const sum = (files) => [...new Set(files)].filter((f) => f.endsWith(".js")).reduce((s, f) => s + size(f), 0);

const app = JSON.parse(fs.readFileSync(path.join(dist, "app-build-manifest.json"), "utf8")).pages;
const build = JSON.parse(fs.readFileSync(path.join(dist, "build-manifest.json"), "utf8"));
const shared = [...(build.rootMainFiles ?? [])];
const failures = [];

console.log("First-load JS per page (gzip)");
for (const entry of Object.keys(app).filter((k) => k.endsWith("/page")).sort()) {
  const segs = entry.split("/").slice(1, -1);
  const layouts = ["/layout", ...segs.map((_, i) => `/${segs.slice(0, i + 1).join("/")}/layout`)].filter((l) => app[l]);
  const files = [...shared, ...layouts.flatMap((l) => app[l]), ...app[entry]];
  const kb = sum(files) / KB;
  const route = "/" + segs.filter((s) => !/^\(.*\)$/.test(s)).join("/");
  const over = kb > PAGE_BUDGET;
  if (over) failures.push(`${route}: ${kb.toFixed(0)} KB > ${PAGE_BUDGET} KB`);
  console.log(`  ${over ? "✗" : "✓"} ${route.padEnd(28)} ${kb.toFixed(1).padStart(6)} KB`);
  if (verbose) for (const f of [...new Set(app[entry])].filter((f) => f.endsWith(".js")).sort((a, b) => size(b) - size(a)).slice(0, 6)) console.log(`        ${(size(f) / KB).toFixed(1).padStart(6)} KB ${f}`);
}

const lazy = JSON.parse(fs.readFileSync(path.join(dist, "react-loadable-manifest.json"), "utf8"));
console.log("\nLazy editor code (gzip)");
for (const [name, b] of Object.entries(LAZY_BUDGETS)) {
  const hit = Object.entries(lazy).find(([k]) => b.key.test(k.replaceAll("\\", "/")));
  if (!hit) { failures.push(`${name}: not found in react-loadable-manifest`); continue; }
  const kb = sum(hit[1].files) / KB;
  const over = kb > b.kb;
  if (over) failures.push(`${name}: ${kb.toFixed(0)} KB > ${b.kb} KB`);
  console.log(`  ${over ? "✗" : "✓"} ${name.padEnd(28)} ${kb.toFixed(1).padStart(6)} KB (budget ${b.kb})`);
  if (verbose) for (const f of [...new Set(hit[1].files)].filter((f) => f.endsWith(".js")).sort((a, b) => size(b) - size(a)).slice(0, 8)) console.log(`        ${(size(f) / KB).toFixed(1).padStart(6)} KB ${f}`);
}

if (failures.length) {
  console.log(`\nOver budget:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll budgets met.");
