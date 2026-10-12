/**
 * SVG import: a small, tolerant XML reader and a converter from SVG geometry to Studio paths in mm.
 * Nothing from the file is ever rendered as markup — only coordinates, colours (as layer numbers) and
 * short cleaned names survive — so scripts, event handlers, external references and foreignObject
 * cannot reach the page. Text and bitmaps are skipped with a warning (convert text to paths first).
 */
import { newId } from "./doc";
import { emptyBox, I, mul, PathBuilder, rotateAt, subpathsBox, transformSubpaths, unionBox, type Box } from "./geom";
import { LAYER_COUNT, layerForColor, nearestLayer } from "./cutLayers";
import type { GroupNode, Mat, PathNode, Subpath } from "./types";

// ---------- XML ----------

export interface XmlEl {
  tag: string;
  attrs: Record<string, string>;
  children: XmlEl[];
  /** Character data, kept only for <style> and <title>. */
  text: string;
}

export class SvgImportError extends Error {}

const XML_ENT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
/** Total characters entity references may add to one document (guards against entity bombs). */
const ENTITY_BUDGET = 4_000_000;

const localName = (raw: string) => (raw.startsWith("svg:") ? raw.slice(4) : raw);

/** Parses XML leniently: unknown constructs are skipped, unclosed tags close at the end, DOCTYPE entities expand once. */
export function parseXml(src: string, maxElements = 250_000): XmlEl {
  const n = src.length;
  const doc: XmlEl = { tag: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlEl[] = [doc];
  const ents: Record<string, string> = {};
  let budget = ENTITY_BUDGET;
  let count = 0;
  const decode = (s: string) =>
    s.indexOf("&") < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|[\w.-]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
      }
      const v = XML_ENT[e] ?? ents[e];
      if (v === undefined || (budget -= v.length) < 0) return m;
      return v;
    });
  const keepText = (el: XmlEl) => el.tag === "style" || el.tag === "title";
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt < 0) break;
    if (lt > i && keepText(top)) top.text += decode(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt + 9);
      if (keepText(top)) top.text += src.slice(lt + 9, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith("<?", lt)) {
      const e = src.indexOf("?>", lt + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (src.startsWith("<!", lt)) {
      let j = lt + 2, depth = 0, q = "";
      for (; j < n; j++) {
        const ch = src[j];
        if (q) { if (ch === q) q = ""; } else if (ch === '"' || ch === "'") q = ch;
        else if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === ">" && depth <= 0) break;
      }
      for (const m of src.slice(lt, j).matchAll(/<!ENTITY\s+([\w.-]+)\s+(?:"([^"]*)"|'([^']*)')\s*>/g)) {
        const v = m[2] ?? m[3];
        if (v.length <= 512 && !v.includes("&")) ents[m[1]] = v;
      }
      i = j + 1;
      continue;
    }
    if (src[lt + 1] === "/") {
      const e = src.indexOf(">", lt);
      const name = localName(src.slice(lt + 2, e < 0 ? n : e).trim());
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      i = e < 0 ? n : e + 1;
      continue;
    }
    let j = lt + 1, q = "";
    for (; j < n; j++) {
      const ch = src[j];
      if (q) { if (ch === q) q = ""; } else if (ch === '"' || ch === "'") q = ch;
      else if (ch === ">") break;
    }
    let body = src.slice(lt + 1, j);
    const selfClose = body.endsWith("/");
    if (selfClose) body = body.slice(0, -1);
    const m = /^[^\s/>]+/.exec(body);
    i = j + 1;
    if (!m) continue;
    const el: XmlEl = { tag: localName(m[0]), attrs: {}, children: [], text: "" };
    for (const a of body.slice(m[0].length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) el.attrs[a[1]] = decode(a[2] ?? a[3]);
    if (++count > maxElements) throw new SvgImportError(`The file has more than ${maxElements.toLocaleString("en-US")} elements.`);
    top.children.push(el);
    if (!selfClose) stack.push(el);
  }
  return doc;
}

// ---------- CSS and colours ----------

type Style = Record<string, string>;

interface Rule { tag?: string; id?: string; classes: string[]; spec: number; order: number; decl: Style }

function parseDecls(s: string): Style {
  const out: Style = {};
  for (const part of s.split(";")) {
    const k = part.indexOf(":");
    if (k < 0) continue;
    const prop = part.slice(0, k).trim().toLowerCase();
    const val = part.slice(k + 1).replace(/!important/i, "").trim();
    if (prop && val) out[prop] = val;
  }
  return out;
}

/** Simple selectors only (tag, #id, .class and their compounds, comma lists); anything else is ignored. */
function parseCss(css: string, rules: Rule[]) {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    if (open < 0) break;
    const sel = s.slice(i, open).trim();
    let depth = 1, j = open + 1;
    for (; j < s.length && depth > 0; j++) { if (s[j] === "{") depth++; else if (s[j] === "}") depth--; }
    const body = s.slice(open + 1, j - 1);
    i = j;
    if (sel.startsWith("@")) continue;
    const decl = parseDecls(body);
    for (const one of sel.split(",")) {
      const t = one.trim();
      if (!t || !/^[\w-]*(?:[#.][\w-]+)*$/.test(t) || t === "*") {
        if (t === "*") rules.push({ classes: [], spec: 0, order: rules.length, decl });
        continue;
      }
      const tag = /^[\w-]+/.exec(t)?.[0];
      const id = /#([\w-]+)/.exec(t)?.[1];
      const classes = [...t.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      rules.push({ tag, id, classes, spec: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0), order: rules.length, decl });
    }
  }
}

const NAMED: Record<string, string> = {
  black: "#000000", white: "#FFFFFF", red: "#FF0000", green: "#008000", lime: "#00FF00", blue: "#0000FF", yellow: "#FFFF00",
  cyan: "#00FFFF", aqua: "#00FFFF", magenta: "#FF00FF", fuchsia: "#FF00FF", gray: "#808080", grey: "#808080", silver: "#C0C0C0",
  maroon: "#800000", olive: "#808000", purple: "#800080", teal: "#008080", navy: "#000080", orange: "#FFA500", brown: "#A52A2A",
  pink: "#FFC0CB", gold: "#FFD700", darkred: "#8B0000", darkgreen: "#006400", darkblue: "#00008B", lightgray: "#D3D3D3",
  lightgrey: "#D3D3D3", darkgray: "#A9A9A9", darkgrey: "#A9A9A9", violet: "#EE82EE", indigo: "#4B0082", coral: "#FF7F50",
  crimson: "#DC143C", tomato: "#FF6347", salmon: "#FA8072", khaki: "#F0E68C", tan: "#D2B48C", chocolate: "#D2691E",
  sienna: "#A0522D", beige: "#F5F5DC", ivory: "#FFFFF0", turquoise: "#40E0D0", skyblue: "#87CEEB", steelblue: "#4682B4",
  royalblue: "#4169E1", forestgreen: "#228B22", seagreen: "#2E8B57", limegreen: "#32CD32", orangered: "#FF4500", hotpink: "#FF69B4",
};

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase();

/** A CSS colour as #RRGGBB, `null` for none/transparent or fully transparent colours, `undefined` when unreadable. */
export function parseColor(v: string): string | null | undefined {
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "transparent") return null;
  if (s[0] === "#") {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return undefined;
    if (h.length === 3 || h.length === 4) {
      if (h.length === 4 && h[3] === "0") return null;
      return "#" + h.slice(0, 3).split("").map((c) => c + c).join("").toUpperCase();
    }
    if (h.length === 6 || h.length === 8) {
      if (h.length === 8 && h.slice(6) === "00") return null;
      return "#" + h.slice(0, 6).toUpperCase();
    }
    return undefined;
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (fn) {
    const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
    const num = (p: string, scale: number) => (p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p));
    if (parts.length >= 4 && num(parts[3], 1) === 0) return null;
    if (fn[1].startsWith("rgb")) {
      const [r, g, b] = parts.slice(0, 3).map((p) => num(p, 255));
      return [r, g, b].some((x) => !Number.isFinite(x)) ? undefined : `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    }
    const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360, sat = num(parts[1] ?? "0", 1), l = num(parts[2] ?? "0", 1);
    if (![h, sat, l].every(Number.isFinite)) return undefined;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
    const ch = (t: number) => {
      t = (t + 1) % 1;
      return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
    };
    return `#${hex2(ch(h + 1 / 3))}${hex2(ch(h))}${hex2(ch(h - 1 / 3))}`;
  }
  return NAMED[s];
}

// ---------- lengths and transforms ----------

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
const UNIT_PX: Record<string, number> = { "": 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 4 / 3, pc: 16, em: 16, ex: 8 };

function length(v: string | undefined, ref: number, def = 0): number {
  if (v == null) return def;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m) return def;
  const x = parseFloat(m[1]), u = m[2].toLowerCase();
  if (u === "%") return (x / 100) * ref;
  return x * (UNIT_PX[u] ?? 1);
}

/** A physical length in mm; px and unitless values use `dpi`. `null` for percentages and junk. */
function physicalMm(v: string | undefined, dpi: number): number | null {
  if (v == null) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m) return null;
  const x = parseFloat(m[1]);
  const mm: Record<string, number> = { "": 25.4 / dpi, px: 25.4 / dpi, mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
  const k = mm[m[2].toLowerCase()];
  return k && x > 0 ? x * k : null;
}

const numbers = (s: string | undefined) => (s ? (s.match(NUM) ?? []).map(Number) : []);

export function parseTransform(t: string | undefined): Mat {
  let m: Mat = I;
  if (!t) return m;
  for (const f of t.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi)) {
    const a = numbers(f[2]);
    const RAD = Math.PI / 180;
    let k: Mat | null = null;
    switch (f[1].toLowerCase()) {
      case "matrix": if (a.length >= 6) k = [a[0], a[1], a[2], a[3], a[4], a[5]]; break;
      case "translate": k = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; break;
      case "scale": k = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
      case "rotate": k = rotateAt(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0); break;
      case "skewx": k = [1, 0, Math.tan((a[0] ?? 0) * RAD), 1, 0, 0]; break;
      case "skewy": k = [1, Math.tan((a[0] ?? 0) * RAD), 0, 1, 0, 0]; break;
    }
    if (k && k.every(Number.isFinite)) m = mul(m, k);
  }
  return m;
}

/** viewBox → viewport matrix with preserveAspectRatio (meet/slice, xMin…xMax, YMin…YMax, none). */
function viewBoxMatrix(vb: number[], w: number, h: number, par: string | undefined): Mat {
  const [x, y, vw, vh] = vb;
  let sx = w / vw, sy = h / vh;
  const p = (par ?? "").trim();
  if (p.startsWith("none")) return [sx, 0, 0, sy, -x * sx, -y * sy];
  const s = /slice/.test(p) ? Math.max(sx, sy) : Math.min(sx, sy);
  sx = sy = s;
  const ax = /xMin/.test(p) ? 0 : /xMax/.test(p) ? 1 : 0.5;
  const ay = /YMin/.test(p) ? 0 : /YMax/.test(p) ? 1 : 0.5;
  return [s, 0, 0, s, -x * s + (w - vw * s) * ax, -y * s + (h - vh * s) * ay];
}

const viewBoxOf = (v: string | undefined) => {
  const a = numbers(v);
  return a.length === 4 && a[2] > 0 && a[3] > 0 ? a : null;
};

// ---------- path data ----------

const RAD = Math.PI / 180;

function arcTo(b: PathBuilder, x1: number, y1: number, rx: number, ry: number, phi: number, fa: number, fs: number, x2: number, y2: number) {
  if (Math.abs(x1 - x2) < 1e-12 && Math.abs(y1 - y2) < 1e-12) return;
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx < 1e-12 || ry < 1e-12) { b.line(x2, y2); return; }
  const cos = Math.cos(phi * RAD), sin = Math.sin(phi * RAD);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let co = den > 0 ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (fa === fs) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry, vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
  const t1 = ang(1, 0, ux, uy);
  let dt = ang(ux, uy, vx, vy);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const map = (x: number, y: number): [number, number] => [cx + rx * x * cos - ry * y * sin, cy + rx * x * sin + ry * y * cos];
  for (let s = 0; s < n; s++) {
    const a1 = t1 + s * step, a2 = a1 + step;
    const e1x = Math.cos(a1), e1y = Math.sin(a1), e2x = Math.cos(a2), e2y = Math.sin(a2);
    const c1 = map(e1x - k * e1y, e1y + k * e1x), c2 = map(e2x + k * e2y, e2y - k * e2x);
    const p = s === n - 1 ? [x2, y2] : map(e2x, e2y);
    b.cubic(c1[0], c1[1], c2[0], c2[1], p[0], p[1]);
  }
}

class Scanner {
  i = 0;
  private re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  constructor(private s: string) {}
  private ws() {
    const s = this.s;
    while (this.i < s.length) {
      const c = s.charCodeAt(this.i);
      if (c === 32 || c === 44 || c === 9 || c === 10 || c === 13 || c === 12) this.i++;
      else break;
    }
  }
  cmd(): string | null {
    this.ws();
    const c = this.s[this.i];
    if (c && /[A-Za-z]/.test(c)) { this.i++; return c; }
    return null;
  }
  hasNum(): boolean {
    this.ws();
    const c = this.s[this.i];
    return c !== undefined && /[0-9.+-]/.test(c);
  }
  num(): number {
    this.ws();
    this.re.lastIndex = this.i;
    const m = this.re.exec(this.s);
    if (!m) throw new SvgImportError("bad number");
    this.i = this.re.lastIndex;
    return parseFloat(m[0]);
  }
  flag(): number {
    this.ws();
    const c = this.s[this.i];
    if (c !== "0" && c !== "1") throw new SvgImportError("bad flag");
    this.i++;
    return c === "1" ? 1 : 0;
  }
}

/** SVG path data → subpaths (quadratics and arcs become cubics). Stops quietly at the first error, as browsers do. */
export function parsePathData(d: string): Subpath[] {
  const b = new PathBuilder();
  const sc = new Scanner(d);
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastC: [number, number] | null = null, lastQ: [number, number] | null = null;
  let needMove = false;
  let cmd: string | null = null;
  const ensure = () => { if (needMove) { b.move(x, y); needMove = false; } };
  try {
    for (;;) {
      const c = sc.cmd();
      if (c) cmd = c;
      else if (!cmd || !sc.hasNum()) break;
      else if (cmd === "M") cmd = "L";
      else if (cmd === "m") cmd = "l";
      else if (cmd === "Z" || cmd === "z") break;
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      let nextC: [number, number] | null = null, nextQ: [number, number] | null = null;
      switch (cmd.toUpperCase()) {
        case "M": {
          x = ox + sc.num(); y = oy + sc.num();
          b.move(x, y); sx = x; sy = y; needMove = false;
          break;
        }
        case "L": { const nx = ox + sc.num(), ny = oy + sc.num(); ensure(); b.line(nx, ny); x = nx; y = ny; break; }
        case "H": { const nx = (rel ? x : 0) + sc.num(); ensure(); b.line(nx, y); x = nx; break; }
        case "V": { const ny = (rel ? y : 0) + sc.num(); ensure(); b.line(x, ny); y = ny; break; }
        case "C": {
          const a = [sc.num(), sc.num(), sc.num(), sc.num(), sc.num(), sc.num()];
          ensure();
          b.cubic(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]);
          nextC = [ox + a[2], oy + a[3]]; x = ox + a[4]; y = oy + a[5];
          break;
        }
        case "S": {
          const a = [sc.num(), sc.num(), sc.num(), sc.num()];
          const c1: [number, number] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
          ensure();
          b.cubic(c1[0], c1[1], ox + a[0], oy + a[1], ox + a[2], oy + a[3]);
          nextC = [ox + a[0], oy + a[1]]; x = ox + a[2]; y = oy + a[3];
          break;
        }
        case "Q": {
          const a = [sc.num(), sc.num(), sc.num(), sc.num()];
          const qx = ox + a[0], qy = oy + a[1], nx = ox + a[2], ny = oy + a[3];
          ensure();
          b.cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny);
          nextQ = [qx, qy]; x = nx; y = ny;
          break;
        }
        case "T": {
          const nx = ox + sc.num(), ny = oy + sc.num();
          const qx: number = lastQ ? 2 * x - lastQ[0] : x, qy: number = lastQ ? 2 * y - lastQ[1] : y;
          ensure();
          b.cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny);
          nextQ = [qx, qy]; x = nx; y = ny;
          break;
        }
        case "A": {
          const rx = sc.num(), ry = sc.num(), phi = sc.num(), fa = sc.flag(), fs = sc.flag();
          const nx = ox + sc.num(), ny = oy + sc.num();
          ensure();
          arcTo(b, x, y, rx, ry, phi, fa, fs, nx, ny);
          x = nx; y = ny;
          break;
        }
        case "Z": {
          b.close(); x = sx; y = sy; needMove = true;
          break;
        }
        default:
          throw new SvgImportError("bad command");
      }
      lastC = nextC; lastQ = nextQ;
    }
  } catch {
    // keep what was read before the error
  }
  return b.done().filter((s) => s.nodes.length > 1);
}

// ---------- shapes ----------

function rectPath(x: number, y: number, w: number, h: number, rx: number, ry: number): Subpath[] {
  const b = new PathBuilder();
  if (rx <= 0 || ry <= 0) return b.move(x, y).line(x + w, y).line(x + w, y + h).line(x, y + h).close().done();
  b.move(x + rx, y).line(x + w - rx, y).arc(x + w - rx, y + ry, rx, ry, -90, 0)
    .line(x + w, y + h - ry).arc(x + w - rx, y + h - ry, rx, ry, 0, 90)
    .line(x + rx, y + h).arc(x + rx, y + h - ry, rx, ry, 90, 180)
    .line(x, y + ry).arc(x + rx, y + ry, rx, ry, 180, 270);
  return b.close().done();
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) => new PathBuilder().arc(cx, cy, rx, ry, 0, 360).close().done();

function pointsPath(pts: number[], closed: boolean): Subpath[] {
  const b = new PathBuilder();
  for (let k = 0; k + 1 < pts.length; k += 2) (k ? b.line(pts[k], pts[k + 1]) : b.move(pts[k], pts[k + 1]));
  if (closed) b.close();
  return b.done().filter((s) => s.nodes.length > 1);
}

// ---------- import ----------

export interface SvgImportOptions {
  /** Pixels per inch for px and unitless sizes. Default 96 (CSS, Inkscape, CorelDRAW), or 72 for Adobe Illustrator files. */
  dpi?: number;
  /** Fixed colour (#RRGGBB) → layer assignments for strokes, used before the automatic mapping. */
  layerMap?: Record<string, number>;
  /** Name for the imported group when the file has no <title>. */
  name?: string;
  maxObjects?: number;
  maxAnchors?: number;
  id?: () => string;
}

export interface SvgLayerUse { color: string; paint: "stroke" | "fill"; layer: number; objects: number }

export interface SvgImport {
  /** The imported paths in mm, grouped; the SVG page's top-left corner is (0, 0). Null when nothing was drawable. */
  group: GroupNode | null;
  /** The SVG page in mm (width/height, or viewBox), or the art's extent when the file sets neither. */
  page: { w: number; h: number };
  /** Bounds of the imported art in mm. */
  box: Box;
  title: string;
  dpi: number;
  layers: SvgLayerUse[];
  objects: number;
  /** Open paths on cut layers (the laser cuts them as lines, not parts). */
  openCuts: number;
  warnings: string[];
}

interface Item { subs: Subpath[]; color: string; paint: "stroke" | "fill"; name?: string }

const INHERITED = ["fill", "stroke", "stroke-width", "fill-opacity", "stroke-opacity", "visibility", "color", "fill-rule"];
const PRESENTATION = [...INHERITED, "display", "opacity"];
const SKIP = new Set([
  "defs", "symbol", "clipPath", "mask", "pattern", "marker", "linearGradient", "radialGradient", "filter", "style", "title", "desc",
  "metadata", "script", "foreignObject", "font", "font-face", "cursor", "view", "animate", "animateMotion", "animateTransform", "set",
]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const SHAPE_NAMES: Record<string, string> = {
  path: "Path", rect: "Rectangle", circle: "Circle", ellipse: "Ellipse", line: "Line", polyline: "Polyline", polygon: "Polygon",
};

const cleanName = (s: string | undefined) => {
  const t = (s ?? "").replace(/[^\p{L}\p{N}\p{Zs}_.,()#+-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return t || undefined;
};
const looksGenerated = (id: string) => /\d{2,}/.test(id) || /^(path|rect|circle|ellipse|line|polyline|polygon|g|layer|use|svg|shape)\d*$/i.test(id) || id.length > 40;

const round = (v: number) => Math.round(v * 1e4) / 1e4;
function roundSubs(subs: Subpath[]): Subpath[] {
  return subs.map((s) => ({
    closed: s.closed,
    nodes: s.nodes.map((a) => ({
      x: round(a.x), y: round(a.y),
      ...(a.i ? { i: { x: round(a.i.x), y: round(a.i.y) } } : {}),
      ...(a.o ? { o: { x: round(a.o.x), y: round(a.o.y) } } : {}),
    })),
  }));
}

/** Whether the file was written by Adobe Illustrator, whose px are points (72 per inch). */
export const isIllustratorSvg = (src: string) => /Adobe Illustrator|ns_ai|adobe:ns:meta|xmlns:i="&ns_ai;"/i.test(src.slice(0, 6000));

/** Converts SVG text to Studio paths in mm, cut layers chosen by colour. Throws SvgImportError when it is not an SVG. */
export function importSvg(src: string, o: SvgImportOptions = {}): SvgImport {
  const makeId = o.id ?? newId;
  const maxObjects = o.maxObjects ?? 20_000;
  const maxAnchors = o.maxAnchors ?? 600_000;
  const doc = parseXml(src);
  const root = doc.children.find((c) => c.tag === "svg");
  if (!root) throw new SvgImportError("This file is not an SVG drawing.");
  const dpi = o.dpi ?? (isIllustratorSvg(src) ? 72 : 96);
  const warnings: string[] = [];
  const skipped = { text: 0, image: 0, external: 0, hidden: 0 };

  // ids and stylesheets
  const ids = new Map<string, XmlEl>();
  const rules: Rule[] = [];
  const index = (el: XmlEl) => {
    if (el.attrs.id && !ids.has(el.attrs.id)) ids.set(el.attrs.id, el);
    if (el.tag === "style") parseCss(el.text, rules);
    el.children.forEach(index);
  };
  index(root);
  rules.sort((a, b) => a.spec - b.spec || a.order - b.order);

  // page and the user-units → mm matrix
  const vb = viewBoxOf(root.attrs.viewBox);
  const pxMm = 25.4 / dpi;
  let W = physicalMm(root.attrs.width, dpi), H = physicalMm(root.attrs.height, dpi);
  if (vb) {
    if (W == null && H == null) { W = vb[2] * pxMm; H = vb[3] * pxMm; }
    else if (W == null) W = (H! * vb[2]) / vb[3];
    else if (H == null) H = (W * vb[3]) / vb[2];
  }
  const rootM: Mat = vb ? viewBoxMatrix(vb, W!, H!, root.attrs.preserveAspectRatio) : [pxMm, 0, 0, pxMm, 0, 0];
  const userW = vb ? vb[2] : (W ?? 0) / pxMm, userH = vb ? vb[3] : (H ?? 0) / pxMm;

  const styleOf = (el: XmlEl, parent: Style): Style => {
    const s: Style = {};
    for (const k of INHERITED) if (parent[k] !== undefined) s[k] = parent[k];
    for (const k of PRESENTATION) if (el.attrs[k] !== undefined) s[k] = el.attrs[k].trim();
    if (rules.length) {
      const cls = (el.attrs.class ?? "").split(/\s+/).filter(Boolean);
      for (const r of rules) {
        if (r.tag && r.tag !== el.tag) continue;
        if (r.id && r.id !== el.attrs.id) continue;
        if (!r.classes.every((c) => cls.includes(c))) continue;
        Object.assign(s, r.decl);
      }
    }
    if (el.attrs.style) Object.assign(s, parseDecls(el.attrs.style));
    for (const k of INHERITED) if (s[k] === "inherit") { if (parent[k] !== undefined) s[k] = parent[k]; else delete s[k]; }
    return s;
  };

  const paintOf = (v: string | undefined, s: Style, def: string | null): string | null => {
    if (v === undefined) return def;
    const t = v.trim();
    if (t === "currentColor" || t === "currentcolor") return paintOf(s.color ?? "#000000", s, def);
    if (t.startsWith("url(")) {
      const fb = t.replace(/^url\([^)]*\)\s*/, "");
      return fb ? (parseColor(fb) ?? null) : "#000000";
    }
    const c = parseColor(t);
    return c === undefined ? "#000000" : c;
  };

  const items: Item[] = [];
  let anchors = 0, truncated = false;
  const useStack = new Set<XmlEl>();

  const add = (el: XmlEl, subs: Subpath[], m: Mat, s: Style) => {
    if (!subs.length) return;
    let stroke = paintOf(s.stroke, s, null);
    let fill = paintOf(s.fill, s, "#000000");
    if (stroke && (parseFloat(s["stroke-opacity"] ?? "1") === 0 || /^\s*0+(\.0*)?\s*[a-z%]*\s*$/i.test(s["stroke-width"] ?? "1"))) stroke = null;
    if (fill && parseFloat(s["fill-opacity"] ?? "1") === 0) fill = null;
    if (!stroke && !fill) { skipped.hidden++; return; }
    const out = transformSubpaths(subs, m);
    const n = out.reduce((a, sp) => a + sp.nodes.length, 0);
    if (items.length >= maxObjects || anchors + n > maxAnchors) { truncated = true; return; }
    anchors += n;
    const label = el.attrs["inkscape:label"] ?? (el.attrs.id && !looksGenerated(el.attrs.id) ? el.attrs.id : undefined);
    items.push({ subs: roundSubs(out), color: (stroke ?? fill)!, paint: stroke ? "stroke" : "fill", name: cleanName(label) ?? SHAPE_NAMES[el.tag] });
  };

  const walk = (el: XmlEl, m: Mat, parent: Style, depth: number) => {
    if (truncated || depth > 64) return;
    const tag = el.tag;
    if (SKIP.has(tag)) return;
    if (tag === "text") { skipped.text++; return; }
    if (tag === "image") { skipped.image++; return; }
    const s = styleOf(el, parent);
    if (s.display === "none" || parseFloat(s.opacity ?? "1") === 0) return;
    const local = mul(m, parseTransform(el.attrs.transform));
    if (tag === "g" || tag === "a" || tag === "switch") {
      for (const c of el.children) walk(c, local, s, depth + 1);
      return;
    }
    if (tag === "svg") {
      const w = length(el.attrs.width, userW, userW), h = length(el.attrs.height, userH, userH);
      const v = viewBoxOf(el.attrs.viewBox);
      const inner = mul(mul(m, [1, 0, 0, 1, length(el.attrs.x, userW), length(el.attrs.y, userH)]), v ? viewBoxMatrix(v, w, h, el.attrs.preserveAspectRatio) : I);
      for (const c of el.children) walk(c, inner, s, depth + 1);
      return;
    }
    if (tag === "use") {
      const href = (el.attrs.href ?? el.attrs["xlink:href"] ?? "").trim();
      if (!href.startsWith("#")) { if (href) skipped.external++; return; }
      const target = ids.get(href.slice(1));
      if (!target || useStack.has(target)) return;
      const at = mul(local, [1, 0, 0, 1, length(el.attrs.x, userW), length(el.attrs.y, userH)]);
      useStack.add(target);
      if (target.tag === "symbol") {
        const v = viewBoxOf(target.attrs.viewBox);
        const w = length(el.attrs.width ?? target.attrs.width, userW, v ? v[2] : userW);
        const h = length(el.attrs.height ?? target.attrs.height, userH, v ? v[3] : userH);
        const inner = v ? mul(at, viewBoxMatrix(v, w, h, target.attrs.preserveAspectRatio)) : at;
        const ss = styleOf(target, s);
        for (const c of target.children) walk(c, inner, ss, depth + 1);
      } else if (!SKIP.has(target.tag)) {
        walk(target, at, s, depth + 1);
      }
      useStack.delete(target);
      return;
    }
    if (!SHAPES.has(tag)) {
      return;
    }
    const a = el.attrs;
    let subs: Subpath[] = [];
    switch (tag) {
      case "path": subs = parsePathData(a.d ?? ""); break;
      case "rect": {
        const w = length(a.width, userW), h = length(a.height, userH);
        if (w <= 0 || h <= 0) break;
        let rx = a.rx != null && a.rx !== "auto" ? length(a.rx, userW) : NaN, ry = a.ry != null && a.ry !== "auto" ? length(a.ry, userH) : NaN;
        if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
        if (Number.isNaN(ry)) ry = rx;
        subs = rectPath(length(a.x, userW), length(a.y, userH), w, h, Math.min(Math.max(rx, 0), w / 2), Math.min(Math.max(ry, 0), h / 2));
        break;
      }
      case "circle": {
        const r = length(a.r, Math.hypot(userW, userH) / Math.SQRT2);
        if (r > 0) subs = ellipsePath(length(a.cx, userW), length(a.cy, userH), r, r);
        break;
      }
      case "ellipse": {
        let rx = a.rx != null && a.rx !== "auto" ? length(a.rx, userW) : NaN, ry = a.ry != null && a.ry !== "auto" ? length(a.ry, userH) : NaN;
        if (Number.isNaN(rx)) rx = ry;
        if (Number.isNaN(ry)) ry = rx;
        if (rx > 0 && ry > 0) subs = ellipsePath(length(a.cx, userW), length(a.cy, userH), rx, ry);
        break;
      }
      case "line": subs = pointsPath([length(a.x1, userW), length(a.y1, userH), length(a.x2, userW), length(a.y2, userH)], false); break;
      case "polyline": subs = pointsPath(numbers(a.points), false); break;
      case "polygon": subs = pointsPath(numbers(a.points), true); break;
    }
    if (s.visibility === "hidden" || s.visibility === "collapse") { skipped.hidden++; return; }
    add(el, subs, local, s);
  };

  for (const c of root.children) walk(c, rootM, styleOf(root, {}), 1);

  // colours → layers: exact LightBurn stroke colours keep their layer, other stroke colours take free cut layers from C02,
  // fills engrave on C00.
  const fixed = new Map(Object.entries(o.layerMap ?? {}).map(([k, v]) => [k.toUpperCase(), v]));
  const strokeColors: string[] = [];
  for (const it of items) if (it.paint === "stroke" && !strokeColors.includes(it.color)) strokeColors.push(it.color);
  const layerOf = new Map<string, number>();
  const taken = new Set<number>();
  for (const c of strokeColors) {
    const f = fixed.get(c);
    if (f !== undefined) { layerOf.set(c, f); taken.add(f); continue; }
    const exact = layerForColor(c);
    if (exact > 0 && !taken.has(exact)) { layerOf.set(c, exact); taken.add(exact); }
  }
  let next = 2;
  for (const c of strokeColors) {
    if (layerOf.has(c)) continue;
    while (next < LAYER_COUNT && taken.has(next)) next++;
    const L = next < LAYER_COUNT ? next : Math.max(2, nearestLayer(c));
    layerOf.set(c, L);
    taken.add(L);
  }

  const uses = new Map<string, SvgLayerUse>();
  let openCuts = 0;
  let box = emptyBox();
  const children: PathNode[] = items.map((it) => {
    const layer = it.paint === "fill" ? 0 : layerOf.get(it.color)!;
    const key = `${it.paint}${it.color}`;
    const u = uses.get(key) ?? { color: it.color, paint: it.paint, layer, objects: 0 };
    u.objects++;
    uses.set(key, u);
    if (it.paint === "stroke" && layer >= 2) openCuts += it.subs.filter((sp) => !sp.closed).length;
    box = unionBox(box, subpathsBox(it.subs));
    return { id: makeId(), type: "path", name: it.name, transform: [...I] as Mat, layer, subpaths: it.subs };
  });

  if (truncated) warnings.push(`The drawing is very large: only the first ${items.length.toLocaleString("en-US")} objects were imported.`);
  if (skipped.text) warnings.push(`${skipped.text} text object${skipped.text === 1 ? " was" : "s were"} skipped. Convert text to paths before exporting the SVG.`);
  if (skipped.image) warnings.push(`${skipped.image} embedded image${skipped.image === 1 ? " was" : "s were"} skipped. Use File ▸ Import image to trace bitmaps.`);
  if (skipped.external) warnings.push(`${skipped.external} reference${skipped.external === 1 ? "" : "s"} to other files ${skipped.external === 1 ? "was" : "were"} ignored.`);
  if (openCuts) warnings.push(`${openCuts} open path${openCuts === 1 ? "" : "s"} on cut layers: the laser cuts ${openCuts === 1 ? "it" : "them"} as lines, not closed parts.`);

  const titleEl = root.children.find((c) => c.tag === "title");
  const title = cleanName(titleEl?.text) ?? cleanName(o.name) ?? "Imported SVG";
  const page = W && H ? { w: round(W), h: round(H) } : { w: round(Math.max(0, box.maxX)), h: round(Math.max(0, box.maxY)) };
  const group: GroupNode | null = children.length
    ? { id: makeId(), type: "group", name: title, transform: [...I] as Mat, layer: children[0].layer, children }
    : null;
  return { group, page, box, title, dpi, layers: [...uses.values()], objects: children.length, openCuts, warnings };
}
