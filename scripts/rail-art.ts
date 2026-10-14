// Run through scripts/build-rail-art.mjs (vite-node, so the "@/" alias and wasm packages resolve).
// Renders every left-rail card picture from the real geometry into public/rail/ and writes the
// group list lib/railArt.generated.ts. A choice whose options all render the same keeps its
// line drawing.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import Module from "manifold-3d";
import { DEFAULTS as HINGE, colSegments, computeModel, cutWidth, hingeCutPaths, mergeParams, outlinePath, type Params, type WallPart } from "@/lib/hinge";
import { HINGE_VARIANTS } from "@/lib/hinge/presets";
import { sceneSVG } from "@/components/editor/scene3d";
import { BUNDLED_FONTS, computeLetterModel, loadFont, mergeLetterParams, type LoadedFont } from "@/lib/letters";
import { computeParametric, loadSource, mergeParametricParams } from "@/lib/parametric";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";
import type { MethodId } from "@/lib/parametric/types";
import { facesAsPlaced, lettersThumbSVG, partsThumbSVG } from "@/lib/presetThumbs";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { makeTextFn } from "@/lib/generators/text";
import { assembledSVG } from "@/lib/generators/thumb";
import { setPath } from "@/lib/generators/path";
import { railFile } from "@/lib/railArt";
import type { ChoiceSpec } from "@/lib/generators/types";

const root = process.cwd();
const dir = join(root, "public", "rail");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

/** Rounds the path numbers to about 1/300 of the picture width: a few kB per card. */
function compact(svg: string): string {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/[\s,]+/).map(Number);
  const w = vb && vb.length === 4 ? vb[2] : 300;
  const dec = Math.max(0, Math.min(3, Math.ceil(-Math.log10(w / 300))));
  const f = 10 ** dec;
  return svg
    .replace(/\s(width|height)="[^"]*"(?=[^>]*viewBox)/, "")
    .replace(/ d="([^"]*)"/g, (_, d: string) => ` d="${d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * f) / f))}"`);
}

const groups: Record<string, string[]> = {};
const hash = createHash("sha1");
let count = 0;
function put(key: string, svg: string) {
  if (!svg) throw new Error(`${key}: empty picture`);
  const body = compact(svg);
  const file = railFile(key);
  const at = key.lastIndexOf(":"), value = key.slice(at + 1);
  if (/\s/.test(value)) throw new Error(`${key}: option values with spaces are not supported`);
  writeFileSync(join(dir, file), body);
  (groups[key.slice(0, at)] ??= []).push(value);
  hash.update(file).update(body);
  count++;
  console.log(`${key} → ${file} ${(body.length / 1024).toFixed(1)} kB`);
}
/** Writes a group only when its options do not all look the same. */
function putGroup(prefix: string, pics: [string, string][]) {
  const distinct = new Set(pics.map(([, s]) => s)).size;
  if (pics.length > 1 && distinct < 2) { console.log(`${prefix}: options look the same, line art kept`); return; }
  for (const [v, s] of pics) put(`${prefix}:${v}`, s);
}

/* ---------- Hinge Box ---------- */

const hingeBox = (q: Partial<Params>) => {
  const p = mergeParams({ ...q });
  const m = computeModel(p);
  if ("error" in m) throw new Error(`hinge ${JSON.stringify(q)}: ${m.error}`);
  return sceneSVG(m, p, -0.6, p.lid === "removable" ? 0.35 : 0);
};
const SHAPE: Record<string, Partial<Params>> = {
  rect: { shape: "rect", W: 140, D: 90, H: 70, R: 24 },
  pill: { shape: "pill", W: 160, D: 70, H: 55, R: 35 },
  poly: { shape: "poly", sides: 6, W: 120, H: 60 },
  cyl: { shape: "cyl", dia: 110, H: 70 },
};
putGroup("shape", Object.entries(SHAPE).map(([v, q]) => [v, hingeBox(q)]));
putGroup("lid", (["open", "fixed", "removable"] as const).map((v) => [v, hingeBox({ ...SHAPE.rect, lid: v })]));

/** A close-up of the hinge wall as a wooden panel seen from above, with the real cuts. */
function hingePanel(q: Partial<Params>): string {
  const p = mergeParams({ W: 140, D: 90, H: 60, R: 24, ...q });
  const m = computeModel(p);
  if ("error" in m) throw new Error(`hinge panel ${JSON.stringify(q)}: ${m.error}`);
  const wall = m.parts.find((pt): pt is WallPart => pt.kind === "wall" && pt.cols.length >= 4 && !pt.test);
  if (!wall) throw new Error("no hinge wall");
  const h = wall.hBody, c0 = wall.cols[0].x, s = p.pitch;
  const x0 = c0 - 1.6 * s, w = 8.5 * s, y0 = -1, hh = Math.min(h + 2, w * 1.45);
  const cuts: string[] = [];
  for (const c of wall.cols) if (c.x > x0 - s && c.x < x0 + w + s) cuts.push(...hingeCutPaths(c.x, colSegments(c.kind, m.hs, h, p.bridge), h, p, 0, 0));
  const lw = Math.max(cutWidth(p), 0.25);
  // Panel plane → picture: x along the wall, y down the wall, tilted back and turned a little.
  const ax = 2.2, ay = 0.62, bx = -0.75, by = 1.05, t = 3;
  const tx = (x: number, y: number) => [(x - x0) * ax + (y - y0) * bx + 40, (x - x0) * ay + (y - y0) * by + 18];
  const [px, py] = tx(x0, y0);
  const mat = `matrix(${ax} ${ay} ${bx} ${by} ${(px - x0 * ax - y0 * bx).toFixed(2)} ${(py - x0 * ay - y0 * by).toFixed(2)})`;
  const c = [tx(x0, y0), tx(x0 + w, y0), tx(x0 + w, y0 + hh), tx(x0, y0 + hh)];
  const P = (q: number[]) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  const edgeR = `M${P(c[1])}L${P(c[2])}L${P([c[2][0], c[2][1] + t])}L${P([c[1][0], c[1][1] + t])}Z`;
  const edgeB = `M${P(c[3])}L${P(c[2])}L${P([c[2][0], c[2][1] + t])}L${P([c[3][0], c[3][1] + t])}Z`;
  const minX = Math.min(...c.map((q) => q[0])) - 6, maxX = Math.max(...c.map((q) => q[0])) + 6;
  const minY = Math.min(...c.map((q) => q[1])) - 6, maxY = Math.max(...c.map((q) => q[1])) + t + 10;
  const shadow = `<ellipse cx="${((minX + maxX) / 2).toFixed(1)}" cy="${(maxY - 5).toFixed(1)}" rx="${((maxX - minX) * 0.42).toFixed(1)}" ry="4" fill="#000" fill-opacity=".12"/>`;
  const clip = `<clipPath id="w"><rect x="${x0.toFixed(2)}" y="${y0}" width="${w.toFixed(2)}" height="${hh.toFixed(2)}"/></clipPath>`;
  const face = `<g transform="${mat}" clip-path="url(#w)"><path d="${outlinePath(wall, 0, 0)}" fill="rgb(214,178,122)"/>` +
    (p.cutStyle === "slot"
      ? `<path d="${cuts.join(" ")}" fill="rgb(92,64,36)"/>`
      : `<path d="${cuts.join(" ")}" fill="none" stroke="rgb(92,64,36)" stroke-width="${lw.toFixed(2)}" stroke-linecap="round"/>`) +
    `</g>`;
  return `<svg viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}" xmlns="http://www.w3.org/2000/svg"><defs>${clip}</defs>${shadow}` +
    `<path d="${edgeR}" fill="rgb(150,112,62)"/><path d="${edgeB}" fill="rgb(172,132,78)"/>${face}` +
    `<path d="M${c.map(P).join("L")}Z" fill="none" stroke="rgba(60,40,20,.45)" stroke-width=".6"/></svg>`;
}
putGroup("pattern", (["straight", "wave", "relief", "serpentine"] as const).map((v) => [v, hingePanel({ pattern: v })]));
putGroup("variant", HINGE_VARIANTS.map((v) => [v.id, hingePanel(v.params)]));

/* ---------- Letters ---------- */

const fonts = new Map<string, LoadedFont>();
function font(id: string): LoadedFont {
  const hit = fonts.get(id);
  if (hit) return hit;
  const meta = BUNDLED_FONTS.find((f) => f.id === id);
  if (!meta) throw new Error(`unknown font ${id}`);
  const b = readFileSync(join(root, "public", "fonts", meta.file));
  const f = loadFont(hb, meta.id, meta.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  fonts.set(id, f);
  return f;
}
const letters = (mode: "box" | "solid" | "stencil") => {
  const p = mergeLetterParams({ text: "A", mode });
  const r = computeLetterModel(p, font(p.fontId), hb);
  if ("error" in r) throw new Error(`letters ${mode}: ${r.error}`);
  const depth = mode === "box" ? p.depth : mode === "solid" ? 8 : 3;
  return lettersThumbSVG(r.shapes, { depth, stencil: mode === "stencil", margin: p.sheetMargin });
};
putGroup("mode", (["box", "solid", "stencil"] as const).map((v) => [v, letters(v)]));
// Letter boxes: walls bend (living hinge) or are flat panels; the lid choices match the boxes'.
putGroup("letters-wall", [["hinge", hingeBox(SHAPE.cyl)], ["faceted", hingeBox({ shape: "poly", sides: 8, W: 120, H: 60 })]]);
putGroup("letters-lid", (["open", "fixed", "removable"] as const).map((v) => [v, hingeBox({ ...SHAPE.rect, lid: v })]));

/* ---------- Parametric methods ---------- */

const wasm = await Module();
wasm.setup();
const METHOD_PRESET: Record<MethodId, string> = {
  parallel: "wave-fins", stacked: "vase-stack", waffle: "sphere-waffle", radial: "torus-radial", curveNormal: "leaf-clock", folded: "folded-sphere",
};
/** Views that show each method's parts best at card size. */
const METHOD_VIEW: Partial<Record<MethodId, { yaw: number; elev: number }>> = { parallel: { yaw: -0.45, elev: 0.8 }, waffle: { yaw: -0.55, elev: 0.85 } };
const methodPics: [string, string][] = [];
for (const [m, id] of Object.entries(METHOD_PRESET) as [MethodId, string][]) {
  const pr = PARAMETRIC_PRESETS.find((q) => q.id === id);
  if (!pr) throw new Error(`no preset ${id}`);
  const p = mergeParametricParams(pr.params);
  if (m === "parallel") p.parallel.backboard = "none";
  const r = computeParametric(p, await loadSource(p), wasm);
  methodPics.push([m, partsThumbSVG(r.parts.flatMap((pt) => (pt.faces3d ? facesAsPlaced(pt.faces3d) : [{ outer: pt.shape.outer, placement: pt.placement }])), METHOD_VIEW[m])]);
}
putGroup("method", methodPics);

/* ---------- Generators ---------- */

const WOOD = [214, 178, 122];
const wood = (k: number) => `rgb(${WOOD.map((v) => Math.round(Math.min(255, v * k))).join(",")})`;
/** A choice's own icon (64 × 44 paths) cut from wood and stood up: for details too small to read on the whole design. */
function token(paths: { d: string; fill?: boolean }[]): string {
  if (!paths.length) return "";
  const filled = paths.filter((p) => p.fill), lines = paths.filter((p) => !p.fill);
  const body = (fill: string, edge: boolean) => filled.length
    ? filled.map((p) => `<path d="${p.d}" fill="${fill}" fill-rule="evenodd"${edge ? ` stroke="rgba(60,40,20,.5)" stroke-width=".5" stroke-linejoin="round"` : ""}/>`).join("")
    : lines.map((p) => `<path d="${p.d}" fill="none" stroke="${fill}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  const steps = 6;
  let s = `<ellipse cx="34" cy="44.5" rx="20" ry="2.2" fill="#000" fill-opacity=".12"/>`;
  for (let i = steps; i >= 1; i--) s += `<g transform="translate(${(0.62 * i).toFixed(2)} ${(-0.5 * i).toFixed(2)})">${body(wood(0.6 + 0.04 * (steps - i)), false)}</g>`;
  s += body(wood(1.04), true);
  if (filled.length && lines.length) s += lines.map((p) => `<path d="${p.d}" fill="none" stroke="rgb(92,64,36)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg viewBox="-1 -6 70 54" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}
const TOKEN = /(^|\.)motif(\.kind)?$|^(engrave|tabs)\./;

const genCtx = { text: makeTextFn(hb, (id) => (BUNDLED_FONTS.some((f) => f.id === id) ? font(id) : null)) };
for (const def of ALL_GENERATORS) {
  for (const s of def.sections) for (const f of s.fields) {
    if (f.kind !== "choice" || !(f as ChoiceSpec<unknown>).rail) continue;
    const c = f as ChoiceSpec<Record<string, unknown>>;
    const pics: [string, string][] = [];
    if (TOKEN.test(c.key)) {
      for (const o of c.options) { const t = token(def.art?.(c.key, o.v) ?? []); if (t) pics.push([o.v, t]); }
      if (pics.length === c.options.length) putGroup(`gen-${def.id}-${c.key}`, pics);
      continue;
    }
    const tokens = () => c.options.map((o) => [o.v, token(def.art?.(c.key, o.v) ?? [])] as [string, string]).filter(([, t]) => t);
    for (const o of c.options) {
      const base = def.railPreview ? def.merge(def.railPreview(c.key, def.defaults(), o.v)) : def.defaults();
      const p = def.merge(c.apply ? c.apply(base, o.v) : setPath(base, c.key, o.v));
      const r = def.build(p, genCtx);
      // An option that needs the user's own input (a pasted outline, text) shows its icon instead.
      const art = r.error ? token(def.art?.(c.key, o.v) ?? []) : assembledSVG(r, p.T);
      if (!art) { console.log(`${def.id}.${c.key}=${o.v}: ${r.error}, line art kept`); pics.length = 0; break; }
      pics.push([o.v, art]);
    }
    if (!pics.length) continue;
    const t = tokens();
    putGroup(`gen-${def.id}-${c.key}`, new Set(pics.map(([, s]) => s)).size > 1 || t.length < c.options.length ? pics : t);
  }
}

const groupList = (gen: boolean) => Object.keys(groups).filter((g) => g.startsWith("gen-") === gen).sort()
  .map((g) => `  ${JSON.stringify(g)}: ${JSON.stringify(groups[g].sort().join(" "))},`).join("\n");
writeFileSync(join(root, "lib", "railArt.generated.ts"),
  `// Generated by scripts/build-rail-art.mjs: rail groups that have rendered pictures in public/rail/ (see lib/railArt.ts).\n` +
  `export const RAIL_V = ${JSON.stringify(hash.digest("hex").slice(0, 8))};\n` +
  `export const RAIL_GROUPS: Record<string, string> = {\n${groupList(false)}\n};\n`);
writeFileSync(join(root, "lib", "generators", "railArt.generated.ts"),
  `// Generated by scripts/build-rail-art.mjs: the generators' rail groups, registered by the generator editor (see lib/railArt.ts).\n` +
  `export const GEN_RAIL_GROUPS: Record<string, string> = {\n${groupList(true)}\n};\n`);
const total = readdirSync(dir).reduce((a, f) => a + readFileSync(join(dir, f)).length, 0);
console.log(`\n${count} pictures in ${Object.keys(groups).length} groups, ${(total / 1024).toFixed(0)} kB in public/rail`);
