// Run through scripts/build-templates.mjs (vite-node, so the "@/" alias and wasm packages resolve).
// Writes public/templates/files/<id>/*.svg (bundled cut files), public/templates/thumbs/<id>.svg and
// lib/templates/built.json. Deterministic: the same sources give byte-identical output.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { computeModel, layoutParts } from "@/lib/hinge";
import { hingeLocks } from "@/lib/plans";
import { hingePresetParams } from "@/lib/hinge/presets";
import type { Params as HingeParams } from "@/lib/hinge/types";
import { sceneSVG } from "@/components/editor/scene3d";
import { BUNDLED_FONTS, loadFont, type LoadedFont } from "@/lib/letters";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, genContent, type CutPart } from "@/lib/generators/output";
import { makeTextFn } from "@/lib/generators/text";
import { assembledSVG } from "@/lib/generators/thumb";
import type { Layout } from "@/lib/hinge/types";
import { xmlCommentText } from "@/lib/security/svg";
import { createDocument } from "@/lib/studio/doc";
import { mul, nodePaths, pathD, subpathsBox, transformSubpaths } from "@/lib/studio/geom";
import { importSvg } from "@/lib/studio/svgImport";
import { svgDocument } from "@/lib/studio/svgProject";
import type { Document, Mat, SceneNode, Subpath } from "@/lib/studio/types";
import { TEMPLATES } from "@/lib/templates/catalog";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";
import { buildStudioTemplate } from "@/lib/templates/studio";
import type { Template, TemplateBuilt } from "@/lib/templates/types";

const root = process.cwd();
const ARCHIVE = process.env.TEMPLATE_ARCHIVE ?? "D:\\Archive\\Print\\SVG Files";
const PUB = join(root, "public", "templates");
const PAD = 5;

// ---------- clean cut files ----------

/** LightBurn's colours for HingeLab's four working layers; SVG import maps them straight back. */
export const FILE_COLORS = { engrave: "#000000", score: "#0000FF", cut: "#FF0000", inner: "#00E000" } as const;
type Layers = Record<keyof typeof FILE_COLORS, string[]>;
const emptyLayers = (): Layers => ({ engrave: [], score: [], cut: [], inner: [] });

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 0.01 mm is far below any laser's resolution. */
const trim = (d: string) => d.replace(/-?\d+\.\d+/g, (n) => String(r2(Number(n))));

function cleanSvg(w: number, h: number, note: string, layers: Layers): string {
  const W = r2(w), H = r2(h);
  const L = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.map(trim)])) as Layers;
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`;
  s += `<!-- ${xmlCommentText(note)} -->\n`;
  const group = (key: keyof Layers, label: string) => {
    if (!L[key].length) return;
    const paint = key === "engrave" ? `fill="${FILE_COLORS[key]}" fill-rule="evenodd" stroke="none"` : `fill="none" stroke="${FILE_COLORS[key]}" stroke-width="0.1"`;
    s += `<g id="${label}" ${paint}>\n${L[key].map((d) => `  <path d="${d}"/>\n`).join("")}</g>\n`;
  };
  // laser order: engrave, score, inner cuts, outline
  group("engrave", "engrave");
  group("score", "score");
  group("inner", "inner-cuts");
  group("cut", "outline-cut");
  return s + "</svg>\n";
}

const writeFile = (path: string, text: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

// ---------- fonts for generator text ----------

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
const genCtx = { text: makeTextFn(hb, (id) => (BUNDLED_FONTS.some((f) => f.id === id) ? font(id) : null)) };

// ---------- flat thumbnails (Studio and imported templates) ----------

const WOOD = "#E3BF8A", EDGE = "#7A5230", BURN = "#4A2E17", SCORE_INK = "#8B5E34";

function layerPaths(doc: Document, skip: (layer: number) => boolean = () => false, place: (i: number) => Mat = () => doc.root.transform): Map<number, Subpath[]> {
  const out = new Map<number, Subpath[]>();
  const visit = (n: SceneNode, world: Mat) => {
    if (n.hidden) return;
    const m = mul(world, n.transform);
    if (n.type === "group") return n.children.forEach((c) => visit(c, m));
    if (n.type === "image" || skip(n.layer)) return;
    const subs = transformSubpaths(nodePaths(n), m).filter((s) => s.nodes.length);
    if (subs.length) out.set(n.layer, [...(out.get(n.layer) ?? []), ...subs]);
  };
  doc.root.children.forEach((c, i) => visit(c, place(i)));
  return out;
}

/** Sheets laid out in a grid for the picture (an SVG document has one group per sheet, in order). */
function gridPlacement(doc: Document): (i: number) => Mat {
  const n = doc.sheets.length;
  if (n < 2 || doc.root.children.length !== n) return () => doc.root.transform;
  const cols = Math.ceil(Math.sqrt(n)), gap = 20;
  const colW = Array.from({ length: cols }, (_, c) => Math.max(...doc.sheets.filter((_, i) => i % cols === c).map((s) => s.w)));
  const rowH = Array.from({ length: Math.ceil(n / cols) }, (_, r) => Math.max(...doc.sheets.slice(r * cols, r * cols + cols).map((s) => s.h)));
  return (i) => {
    const c = i % cols, r = Math.floor(i / cols), s = doc.sheets[i];
    const x = colW.slice(0, c).reduce((a, w) => a + w + gap, 0), y = rowH.slice(0, r).reduce((a, h) => a + h + gap, 0);
    return mul([1, 0, 0, 1, x - s.x, y - s.y], doc.root.transform);
  };
}

/** Path data in grid units of `q` mm: absolute moves, relative lines and curves, zero-length lines dropped. */
function gridD(subs: Subpath[], q: number): string {
  const u = (v: number) => Math.round(v / q);
  let out = "";
  for (const s of subs) {
    const n = s.nodes;
    if (!n.length) continue;
    let px = u(n[0].x), py = u(n[0].y);
    out += `M${px} ${py}`;
    const segs = s.closed ? n.length : n.length - 1;
    for (let k = 0; k < segs; k++) {
      const a = n[k], b = n[(k + 1) % n.length];
      const bx = u(b.x), by = u(b.y);
      if (a.o || b.i) {
        const c1 = a.o ?? a, c2 = b.i ?? b;
        out += `c${u(c1.x) - px} ${u(c1.y) - py} ${u(c2.x) - px} ${u(c2.y) - py} ${bx - px} ${by - py}`;
      } else if (bx !== px || by !== py) out += `l${bx - px} ${by - py}`;
      px = bx; py = by;
    }
    if (s.closed) out += "z";
  }
  return out.replace(/ -/g, "-");
}

/** The parts as cut plywood: outlines filled, inner cuts punched out, engraving and scoring drawn on top. */
function flatThumb(doc: Document): string {
  const L = layerPaths(doc, undefined, gridPlacement(doc));
  const mask = `holes-${doc.id}`;
  const all = [...L.values()].flat();
  const b = subpathsBox(all);
  if (!Number.isFinite(b.minX)) throw new Error(`${doc.name}: empty thumbnail`);
  // Drawn on a grid of 1/600 of the drawing (under half a pixel when shown 300 px wide), in relative
  // whole-number steps; details smaller than a pixel are left out.
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY), q = size / 600;
  const pad = 18, sw = 2;
  const visible = (s: Subpath) => { const k = subpathsBox([s]); return Math.max(k.maxX - k.minX, k.maxY - k.minY) > size / 300; };
  const [engrave, score, cut, holes] = [0, 1, 2, 3].map((layer) => gridD((L.get(layer) ?? []).filter(visible), q));
  const [mx, my] = [Math.round(b.minX / q) - pad, Math.round(b.minY / q) - pad];
  const [mw, mh] = [Math.round((b.maxX - b.minX) / q) + 2 * pad, Math.round((b.maxY - b.minY) / q) + 2 * pad];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="${mx} ${my} ${mw} ${mh}">`;
  if (holes) s += `<defs><mask id="${mask}" maskUnits="userSpaceOnUse" x="${mx}" y="${my}" width="${mw}" height="${mh}"><rect x="${mx}" y="${my}" width="${mw}" height="${mh}" fill="#fff"/><path d="${holes}" fill="#000"/></mask></defs>`;
  s += `<g${holes ? ` mask="url(#${mask})"` : ""}>`;
  if (cut) s += `<path d="${cut}" fill="${WOOD}" fill-rule="evenodd" stroke="${EDGE}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  if (engrave) s += `<path d="${engrave}" fill="${BURN}" fill-opacity="0.85" fill-rule="evenodd"/>`;
  if (score) s += `<path d="${score}" fill="none" stroke="${SCORE_INK}" stroke-width="${sw * 0.8}" stroke-linecap="round"/>`;
  s += `</g>`;
  if (holes) s += `<path d="${holes}" fill="none" stroke="${EDGE}" stroke-width="${sw}"/>`;
  return s + `</svg>\n`;
}

// ---------- builders per kind ----------

interface Out { built: TemplateBuilt; thumb: string; files?: { name: string; svg: string }[] }

let nid = 0;
const makeId = () => `t${++nid}`;

function leafCount(nodes: SceneNode[]): number {
  return nodes.reduce((a, n) => a + (n.type === "group" ? leafCount(n.children) : 1), 0);
}

function countLayer(nodes: SceneNode[], layer: number): number {
  return nodes.reduce((a, n) => a + (n.type === "group" ? countLayer(n.children, layer) : n.layer === layer ? 1 : 0), 0);
}

function studioTemplate(t: Template): Out {
  const st = buildStudioTemplate(t.id, makeId);
  if (!st) throw new Error(`${t.id}: no Studio builder`);
  const doc = createDocument({ id: t.id, name: t.title, sheet: st.sheet, now: "2026-01-01T00:00:00.000Z" });
  doc.root.children = st.nodes;
  return { built: { w: st.sheet.w, h: st.sheet.h, sheets: 1, objects: leafCount(st.nodes) }, thumb: flatThumb(doc) };
}

/** Cropped to the parts plus PAD, so each bundled file is one sheet's worth of drawing. */
function cropLayout(items: Layout<CutPart>["items"]): Layout<CutPart> {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) for (const c of [...it.pt.outline, ...it.pt.score, ...it.pt.engrave, ...it.pt.cuts]) for (const [x, y] of c) {
    x0 = Math.min(x0, x + it.ox); y0 = Math.min(y0, y + it.oy); x1 = Math.max(x1, x + it.ox); y1 = Math.max(y1, y + it.oy);
  }
  const dx = PAD - x0, dy = PAD - y0;
  return { items: items.map((it) => ({ ...it, ox: it.ox + dx, oy: it.oy + dy })), width: Math.ceil(x1 - x0 + 2 * PAD), height: Math.ceil(y1 - y0 + 2 * PAD) };
}

function generatorTemplate(t: Template): Out {
  const preset = TEMPLATE_PRESETS[t.id];
  const def = ALL_GENERATORS.find((d) => d.id === preset.product);
  if (!def) throw new Error(`${t.id}: unknown generator ${preset.product}`);
  const p = def.merge(preset.params);
  if (p.T !== t.thickness) throw new Error(`${t.id}: catalogue says ${t.thickness} mm, settings are for ${p.T} mm`);
  const a = arrangeGenerator(def, p, genCtx);
  if ("error" in a.result) throw new Error(`${t.id}: ${a.result.error}`);
  if (!a.lay || !a.sheets) throw new Error(`${t.id}: nothing laid out`);
  const lay = a.lay;
  const thumb = assembledSVG(a.result.out, p.T);
  const pro = def.pro?.(a.params, a.result.out) ?? null;
  if (pro && t.source !== "editor") throw new Error(`${t.id}: exporting needs Pro (${pro}), so it must be an "editor" template`);
  if (t.source === "editor") {
    const w = Math.max(...a.sheets.map((s) => s.w)), h = Math.max(...a.sheets.map((s) => s.h));
    return { built: { w: Math.ceil(w), h: Math.ceil(h), sheets: a.sheets.length, objects: lay.items.length, ...(pro ? { pro } : {}) }, thumb };
  }
  const files: { name: string; svg: string }[] = [];
  let w = 0, h = 0;
  a.sheets.forEach((sh, k) => {
    const items = lay.items.filter((it) => {
      const cy = it.oy + (it.pt.bbox.y0 + it.pt.bbox.y1) / 2;
      return cy >= sh.y && cy < sh.y + sh.h;
    });
    if (!items.length) return;
    const sub = cropLayout(items);
    const C = genContent(sub);
    if (C.images.length) throw new Error(`${t.id}: pictures cannot be bundled`);
    const name = a.sheets!.length > 1 ? `sheet-${k + 1}.svg` : "parts.svg";
    const parts = items.map((it) => it.pt.name).join(", ");
    const note = `HingeLab template "${t.title}" (${def.name}). Material ${p.T} mm, kerf ${p.K} mm compensated. Parts: ${parts}. Red: cut, green: inner cuts (cut first), blue: score, black fill: engrave.`;
    files.push({ name, svg: cleanSvg(sub.width, sub.height, note, { engrave: C.engrave, score: C.hinge, inner: C.slots, cut: C.outline }) });
    w = Math.max(w, sub.width); h = Math.max(h, sub.height);
  });
  return { built: { w, h, sheets: files.length, objects: lay.items.length, files: files.map((f) => f.name) }, thumb, files };
}

function hingeTemplate(t: Template): Out {
  const preset = TEMPLATE_PRESETS[t.id];
  const p: HingeParams = { ...hingePresetParams(preset.params as Partial<HingeParams>), labels: false };
  if (p.T !== t.thickness) throw new Error(`${t.id}: catalogue says ${t.thickness} mm, settings are for ${p.T} mm`);
  const m = computeModel(p);
  if ("error" in m) throw new Error(`${t.id}: ${m.error}`);
  // Hinge Box exports carry the Free plan's watermark, so these open in the Hinge Box editor only.
  if (t.source !== "editor") throw new Error(`${t.id}: Hinge Box templates must be "editor" templates`);
  const lay = layoutParts(m.parts, p.bedW, p.gap);
  const locks = hingeLocks("free", p);
  const pro = locks.length ? `${locks.join(" and ")} need${locks.length > 1 ? "" : "s"} the Pro plan` : undefined;
  const thumb = sceneSVG(m, p, -0.6, p.lid === "removable" ? 0.35 : 0).replace("<svg ", '<svg width="300" height="200" ');
  return { built: { w: Math.ceil(lay.width), h: Math.ceil(lay.height), sheets: 1, objects: lay.items.length, ...(pro ? { pro } : {}) }, thumb };
}

// ---------- designs from the user's collection ----------

interface Imported { file: string; name: string; layerMap: Record<string, number>; dpi?: number }
const DROP = 29;
const IMPORTED: Record<string, { sources: Imported[]; note: string }> = {
  "ceramic-tile-frame": {
    note: "Ceramic tile frame, from the owner's own design (xTool Creative Space). The US Letter sheet edge is left out.",
    sources: [{ file: "Ceramic Frame.svg", name: "frame", layerMap: { "#96D71D": DROP, "#FF7F56": 2, "#848B96": 3 } }],
  },
  "kv1-tank": {
    note: "Carter's lasercut tank model - KV-1 (motorizable) by JackCarter, https://www.thingiverse.com/thing:2449310, licensed under Creative Commons Attribution (CC BY). Changed by HingeLab: colours mapped to cut layers, text notes and file metadata removed; geometry and scale unchanged.",
    sources: ["Body", "Turret", "Wheels", "Tracks"].map((part) => ({
      file: `Prefabricated-002\\Prefabricated\\Machinery and special equipment\\103092_Танк KV-1\\103092_files\\KV-1_${part}.svg`,
      name: part.toLowerCase(), layerMap: { "#000000": 2, "#ED1C24": 1 }, dpi: 72,
    })),
  },
};

function importedTemplate(t: Template): Out {
  const spec = IMPORTED[t.id];
  if (!spec) throw new Error(`${t.id}: no source files listed`);
  const files: { name: string; svg: string }[] = [];
  let objects = 0;
  for (const s of spec.sources) {
    const r = importSvg(readFileSync(join(ARCHIVE, s.file), "utf8"), { layerMap: s.layerMap, dpi: s.dpi, name: s.name, id: makeId });
    if (!r.group) throw new Error(`${t.id}/${s.name}: nothing drawable`);
    const doc = createDocument({ name: s.name });
    doc.root.children = [r.group];
    const L = layerPaths(doc, (layer) => layer === DROP);
    const unknown = [...L.keys()].filter((k) => ![0, 1, 2, 3].includes(k));
    if (unknown.length) throw new Error(`${t.id}/${s.name}: colours on unexpected layers ${unknown.join(", ")} (${r.layers.map((l) => `${l.color}→C${l.layer}`).join(" ")})`);
    const b = subpathsBox([...L.values()].flat());
    const shift: Mat = [1, 0, 0, 1, PAD - b.minX, PAD - b.minY];
    const d = (k: number) => (L.has(k) ? [pathD(transformSubpaths(L.get(k)!, shift), 2)] : []);
    objects += leafCount([r.group]) - countLayer([r.group], DROP);
    const name = `${s.name}.svg`;
    files.push({ name, svg: cleanSvg(Math.ceil(b.maxX - b.minX + 2 * PAD), Math.ceil(b.maxY - b.minY + 2 * PAD), spec.note, { engrave: d(0), score: d(1), cut: d(2), inner: d(3) }) });
    if (r.warnings.length) console.log(`  ${t.id}/${s.name}: ${r.warnings.join(" | ")}`);
  }
  const { doc } = svgDocument(files.map((f) => ({ src: f.svg, name: f.name })), { id: t.id, name: t.title, margin: 0, idFactory: makeId });
  const W = Math.max(...doc.sheets.map((s) => s.w)), H = Math.max(...doc.sheets.map((s) => s.h));
  return { built: { w: W, h: H, sheets: files.length, objects, files: files.map((f) => f.name) }, thumb: flatThumb(doc), files };
}

// ---------- run ----------

rmSync(join(PUB, "files"), { recursive: true, force: true });
rmSync(join(PUB, "thumbs"), { recursive: true, force: true });
const built: Record<string, TemplateBuilt> = {};
let total = 0;
for (const t of TEMPLATES) {
  if (t.product && TEMPLATE_PRESETS[t.id]?.product !== t.product) throw new Error(`${t.id}: product ${t.product} has no matching settings`);
  if (t.source === "editor" && !t.product) throw new Error(`${t.id}: an "editor" template needs a product`);
  const out = t.source === "studio" ? studioTemplate(t) : t.product === "hinge" ? hingeTemplate(t) : t.product ? generatorTemplate(t) : importedTemplate(t);
  writeFile(join(PUB, "thumbs", `${t.id}.svg`), out.thumb);
  let bytes = out.thumb.length;
  for (const f of out.files ?? []) {
    writeFile(join(PUB, "files", t.id, f.name), f.svg);
    bytes += f.svg.length;
  }
  total += bytes;
  built[t.id] = out.built;
  console.log(`${t.id.padEnd(22)} ${out.built.sheets} sheet(s) ${out.built.w}×${out.built.h} mm, ${out.built.objects} objects, ${(out.thumb.length / 1024).toFixed(1)} kB thumb, ${(bytes / 1024).toFixed(1)} kB total`);
}
writeFileSync(join(root, "lib", "templates", "built.json"), JSON.stringify(built, null, 1) + "\n");
console.log(`${TEMPLATES.length} templates, ${(total / 1024).toFixed(0)} kB`);
