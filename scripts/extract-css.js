// Copies the prototype's <style> block into app/globals.css, then appends the app's own rules.
const fs = require("fs");
const html = fs.readFileSync("hingelab-prototype.html", "utf8");
const start = html.indexOf("<style>") + "<style>".length;
const end = html.indexOf("</style>");
if (start < 0 || end < 0) throw new Error("style block not found");
let css = html.slice(start, end).replace(/^\n/, "");
css = css.replace("body { background:", "body { margin: 0; background:");
css += `
.home { height: 100%; display: grid; place-content: center; justify-items: center; gap: 14px; padding: 24px; text-align: center; }
.home p { margin: 0; color: var(--fg-dim); max-width: 36em; }
.boot { height: 100%; display: grid; place-items: center; color: var(--fg-dim); }
a.btn-export { text-decoration: none; }
.modal .rename-row { display: flex; justify-content: flex-end; gap: 8px; }
.canvas-error.notice { background: var(--panel-2); border-color: var(--line); color: var(--fg-dim); }
.iconseg button:disabled { cursor: default; opacity: .55; }
.iconseg button:disabled:hover { background: none; color: var(--fg-dim); }
.iconseg.full { display: flex; }
.iconseg.full button { flex: 1; justify-content: center; }
.textin { width: 100%; resize: vertical; min-height: 56px; background: var(--field); border: 1px solid var(--line); border-radius: 4px; color: var(--fg); font: 16px/1.35 var(--font-ui); padding: 6px 8px; outline: none; }
.textin:focus { border-color: var(--accent); }
.fontpick { display: grid; gap: 6px; min-width: 0; }
.fp-opt { display: grid; gap: 1px; text-align: start; background: var(--field); border: 1px solid var(--line); border-radius: 4px; padding: 5px 8px 6px; cursor: pointer; min-width: 0; width: 100%; }
.fp-opt:hover { border-color: var(--accent); }
.fp-opt[aria-selected="true"] { border-color: var(--accent); background: var(--panel-2); }
.fp-head { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--fg-dim); min-width: 0; }
.fp-head .fp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-head .chev { margin-inline-start: auto; transition: transform .15s; }
.fp-head .chev.open { transform: rotate(90deg); }
.fp-prev { font-size: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--fg); }
.fp-list { display: grid; gap: 4px; max-height: 340px; overflow-y: auto; scrollbar-width: thin; }
.fp-tag { margin-inline-start: auto; font-size: 10px; color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--line)); border-radius: 8px; padding: 0 6px; white-space: nowrap; }
.fp-group { font-size: 11px; color: var(--fg-faint); text-transform: uppercase; letter-spacing: .06em; margin-top: 4px; }
.fp-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4px; align-items: stretch; }
.fp-del { background: var(--field); border: 1px solid var(--line); border-radius: 4px; color: var(--fg-dim); cursor: pointer; padding: 0 8px; }
.fp-del:hover { color: var(--err); border-color: var(--err); }
.fp-warn { color: var(--warn); font-size: 12px; margin: 0; }
.dbg { height: 100%; overflow: auto; padding: 16px; display: grid; gap: 14px; align-content: start; }
.dbg-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dbg-bar input[type="text"], .dbg-bar select { background: var(--field); border: 1px solid var(--line); border-radius: 4px; color: var(--fg); padding: 5px 8px; font: 14px var(--font-ui); }
.dbg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; }
.dbg-card { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px 10px; display: grid; gap: 6px; }
.dbg-card h2 { margin: 0; font-size: 12px; font-weight: 600; color: var(--fg-dim); text-transform: uppercase; letter-spacing: .06em; }
.dbg-card svg { width: 100%; height: auto; background: var(--sheet); border-radius: 4px; }
.dbg pre { margin: 0; font: 11.5px/1.45 var(--font-num); color: var(--fg-dim); white-space: pre-wrap; }
`;
fs.mkdirSync("app", { recursive: true });
fs.writeFileSync("app/globals.css", css);
console.log("wrote", css.length);
