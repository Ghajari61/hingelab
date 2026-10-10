/**
 * Copy the HarfBuzz WASM build into public/hb so the browser can load it as a plain ES module
 * (it locates harfbuzz.wasm next to itself via import.meta.url, which bundlers would rewrite).
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "harfbuzzjs", "dist");
const dst = path.join(__dirname, "..", "public", "hb");
fs.mkdirSync(dst, { recursive: true });
for (const f of ["index.mjs", "harfbuzz.js", "harfbuzz.wasm"]) fs.copyFileSync(path.join(src, f), path.join(dst, f));
console.log("harfbuzz copied to public/hb");
