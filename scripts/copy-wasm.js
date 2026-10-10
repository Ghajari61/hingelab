/**
 * Copy WASM builds into public/ so the browser can load them as plain ES modules (they locate
 * their .wasm next to themselves via import.meta.url, which bundlers would rewrite):
 * HarfBuzz → public/hb (Letters), manifold-3d → public/manifold (Parametric worker),
 * onnxruntime-web (WebGPU + WASM build) → public/ort (photo depth worker).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const copies = [
  { from: "node_modules/harfbuzzjs/dist", to: "public/hb", files: ["index.mjs", "harfbuzz.js", "harfbuzz.wasm"] },
  { from: "node_modules/manifold-3d", to: "public/manifold", files: ["manifold.js", "manifold.wasm"] },
  { from: "node_modules/onnxruntime-web/dist", to: "public/ort", files: ["ort.webgpu.min.mjs", "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"] },
];
for (const c of copies) {
  const dst = path.join(root, c.to);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of c.files) fs.copyFileSync(path.join(root, c.from, f), path.join(dst, f));
  console.log(`${c.files.join(", ")} copied to ${c.to}`);
}
