/**
 * DXF from any of HingeLab's layered SVGs (R12 ASCII, mm, y up). Each Inkscape layer becomes a DXF
 * layer of the nearest standard colour (black engrave, blue score, red outline, green inner cuts,
 * as laser software expects); paths, rects, circles and lines become polylines (curves and arcs
 * flattened to 0.02 mm), text stays text. Pictures cannot go into a DXF and are counted as skipped.
 */

type M = [number, number, number, number, number, number];
type P = [number, number];

export interface DxfResult {
  dxf: string;
  layers: string[];
  polylines: number;
  texts: number;
  /** Elements a DXF cannot hold (pictures). */
  skipped: number;
}

const TOL = 0.02;
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const ap = (m: M, [x, y]: P): P => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(s: string | undefined): M {
  let m = ID;
  if (!s) return m;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let t: M = ID;
    if (fn === "translate") t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === "scale") t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === "matrix" && a.length === 6) t = a as M;
    else if (fn === "rotate") {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      t = [c, sn, -sn, c, 0, 0];
      if (a.length >= 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    }
    m = mul(m, t);
  }
  return m;
}

const attrsOf = (s: string) => {
  const o: Record<string, string> = {};
  for (const [, k, v1, v2] of s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) o[k] = v1 ?? v2;
  return o;
};

const segs = (len: number) => Math.max(4, Math.min(256, Math.ceil(Math.sqrt(len / TOL) * 0.7)));

/** SVG path data → subpaths of points, curves and arcs flattened. */
export function flattenPath(d: string): { pts: P[]; closed: boolean }[] {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: { pts: P[]; closed: boolean }[] = [];
  let cur: P[] = [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = "", lc: P | null = null, lq: P | null = null;
  let i = 0;
  const num = () => Number(toks[i++]);
  const end = (closed: boolean) => {
    if (cur.length > 1) out.push({ pts: cur, closed });
    cur = [];
  };
  const add = (p: P) => { if (!cur.length) cur.push([x, y]); cur.push(p); };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const C = cmd.toUpperCase();
    if (C === "Z") {
      if (cur.length) { x = sx; y = sy; end(true); }
      lc = lq = null;
      continue;
    }
    if (C === "M") {
      end(false);
      x = ox + num(); y = oy + num(); sx = x; sy = y;
      cur = [[x, y]];
      cmd = rel ? "l" : "L";
      lc = lq = null;
      continue;
    }
    if (C === "L") { const p: P = [ox + num(), oy + num()]; add(p); [x, y] = p; lc = lq = null; continue; }
    if (C === "H") { const p: P = [ox + num(), y]; add(p); [x, y] = p; lc = lq = null; continue; }
    if (C === "V") { const p: P = [x, oy + num()]; add(p); [x, y] = p; lc = lq = null; continue; }
    if (C === "C" || C === "S") {
      const c1: P = C === "C" ? [ox + num(), oy + num()] : lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const c2: P = [ox + num(), oy + num()], p: P = [ox + num(), oy + num()];
      const n = segs(Math.hypot(c1[0] - x, c1[1] - y) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(p[0] - c2[0], p[1] - c2[1]));
      const p0: P = [x, y];
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        add([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p[1]]);
      }
      [x, y] = p; lc = c2; lq = null;
      continue;
    }
    if (C === "Q" || C === "T") {
      const c: P = C === "Q" ? [ox + num(), oy + num()] : lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
      const p: P = [ox + num(), oy + num()];
      const n = segs(Math.hypot(c[0] - x, c[1] - y) + Math.hypot(p[0] - c[0], p[1] - c[1]));
      const p0: P = [x, y];
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        add([u * u * p0[0] + 2 * u * t * c[0] + t * t * p[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p[1]]);
      }
      [x, y] = p; lq = c; lc = null;
      continue;
    }
    if (C === "A") {
      let rx = Math.abs(num()), ry = Math.abs(num());
      const phi = (num() * Math.PI) / 180, large = num() !== 0, sweep = num() !== 0;
      const p: P = [ox + num(), oy + num()];
      lc = lq = null;
      if ((p[0] === x && p[1] === y)) continue;
      if (!rx || !ry) { add(p); [x, y] = p; continue; }
      // Endpoint to centre parameterisation (SVG 1.1, F.6.5).
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const dx = (x - p[0]) / 2, dy = (y - p[1]) / 2;
      const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
      const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
      const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
      const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
      const cx = cp * cx1 - sp * cy1 + (x + p[0]) / 2, cy = sp * cx1 + cp * cy1 + (y + p[1]) / 2;
      const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
      let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI;
      if (sweep && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(4, Math.min(256, Math.ceil(Math.abs(dt) / (2 * Math.acos(Math.max(-1, 1 - TOL / Math.max(rx, ry)))))));
      for (let j = 1; j <= n; j++) {
        const t = t1 + (dt * j) / n;
        add(j === n ? p : [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp]);
      }
      [x, y] = p;
      continue;
    }
    i++; // unknown command: skip a token
  }
  end(false);
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): P[] {
  const n = Math.max(12, Math.min(256, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - TOL / Math.max(rx, ry, TOL))))));
  return Array.from({ length: n }, (_, k) => [cx + rx * Math.cos((2 * Math.PI * k) / n), cy + ry * Math.sin((2 * Math.PI * k) / n)] as P);
}

/** Standard AutoCAD colours laser software maps to layers. */
const ACI: [number, number, number, number][] = [
  [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [7, 0, 0, 0], [8, 128, 128, 128], [9, 192, 192, 192],
  [30, 255, 127, 0], [40, 255, 191, 0], [140, 0, 127, 255], [200, 191, 0, 255], [210, 255, 0, 191],
];
export function aciOf(hex: string | undefined): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return 7;
  const v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255;
  let best = 7, bd = Infinity;
  for (const [i, R, G, B] of ACI) {
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const layerName = (s: string) => s.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "0";
const f = (v: number) => (Math.round(v * 10000) / 10000).toString();
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export function svgToDXF(svg: string): DxfResult {
  const head = /<svg\b([^>]*)>/.exec(svg);
  const sa = attrsOf(head?.[1] ?? "");
  const vb = (sa.viewBox ?? "").split(/[\s,]+/).map(Number);
  const H = vb.length === 4 && Number.isFinite(vb[3]) ? vb[3] : parseFloat(sa.height ?? "0");
  const W = vb.length === 4 && Number.isFinite(vb[2]) ? vb[2] : parseFloat(sa.width ?? "0");
  const root: M = vb.length === 4 ? [1, 0, 0, -1, -vb[0], H + vb[1]] : [1, 0, 0, -1, 0, H];

  type Frame = { tag: string; m: M; layer: string | null; color?: string; hidden: boolean };
  const stack: Frame[] = [{ tag: "svg", m: root, layer: null, hidden: false }];
  const layers = new Map<string, number>();
  const ents: string[] = [];
  let polylines = 0, texts = 0, skipped = 0;
  const top = () => stack[stack.length - 1];
  const layerFor = (fr: Frame, a: Record<string, string>) => {
    const name = fr.layer ?? "0";
    if (!layers.has(name)) layers.set(name, aciOf(fr.color ?? a.stroke ?? a.fill));
    return name;
  };
  const poly = (layer: string, pts: P[], closed: boolean, m: M) => {
    let q = pts.map((p) => ap(m, p));
    if (q.length > 2 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 1e-6) { q = q.slice(0, -1); closed = true; }
    if (q.length < 2) return;
    let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n${closed ? 1 : 0}\n10\n0\n20\n0\n30\n0\n`;
    for (const [x, y] of q) s += `0\nVERTEX\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n`;
    ents.push(s + `0\nSEQEND\n8\n${layer}\n`);
    polylines++;
  };

  const re = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let pendingText: { a: Record<string, string>; fr: Frame; m: M; text: string } | null = null;
  for (const mt of svg.slice(head ? head.index + head[0].length : 0).matchAll(re)) {
    const [, close, tag, rest, self, textNode] = mt;
    if (textNode !== undefined) { if (pendingText) pendingText.text += textNode; continue; }
    if (tag.startsWith("?") || tag.startsWith("!")) continue;
    if (close) {
      if (tag === "text" && pendingText) {
        const { a, fr, m } = pendingText;
        const str = decode(pendingText.text).trim();
        pendingText = null;
        if (str && !fr.hidden) {
          const layer = layerFor(fr, a);
          const at = ap(m, [parseFloat(a.x ?? "0"), parseFloat(a.y ?? "0")]);
          const size = parseFloat(a["font-size"] ?? "4") * Math.hypot(m[0], m[1]);
          const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
          const h = a["text-anchor"] === "middle" ? 1 : a["text-anchor"] === "end" ? 2 : 0;
          const v = a["dominant-baseline"] === "middle" || a["dominant-baseline"] === "central" ? 2 : 0;
          let s = `0\nTEXT\n8\n${layer}\n10\n${f(at[0])}\n20\n${f(at[1])}\n30\n0\n40\n${f(size * 0.7)}\n1\n${str.replace(/[\r\n]+/g, " ")}\n`;
          if (Math.abs(rot) > 1e-6) s += `50\n${f(rot)}\n`;
          if (h) s += `72\n${h}\n`;
          if (h || v) s += `11\n${f(at[0])}\n21\n${f(at[1])}\n31\n0\n`;
          if (v) s += `73\n${v}\n`;
          ents.push(s);
          texts++;
        }
      }
      if (stack.length > 1 && top().tag === tag) stack.pop();
      continue;
    }
    const a = attrsOf(rest);
    const parent = top();
    const m = mul(parent.m, parseTransform(a.transform));
    const hidden = parent.hidden || tag === "defs" || tag === "clipPath" || tag === "mask" || tag === "symbol" || a.display === "none";
    const isLayer = tag === "g" && a["inkscape:groupmode"] === "layer";
    const fr: Frame = {
      tag, m, hidden,
      layer: isLayer ? layerName(a["inkscape:label"] ?? a.id ?? "0") : parent.layer,
      color: isLayer ? (a.stroke && a.stroke !== "none" ? a.stroke : a.fill) : parent.color,
    };
    if (!self) stack.push(fr);
    if (hidden) continue;
    if (tag === "path" && a.d) {
      const layer = layerFor(fr, a);
      for (const sp of flattenPath(a.d)) poly(layer, sp.pts, sp.closed, m);
    } else if (tag === "polygon" || tag === "polyline") {
      const n = (a.points ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      const pts: P[] = [];
      for (let k = 0; k + 1 < n.length; k += 2) pts.push([n[k], n[k + 1]]);
      poly(layerFor(fr, a), pts, tag === "polygon", m);
    } else if (tag === "line") {
      poly(layerFor(fr, a), [[+(a.x1 ?? 0), +(a.y1 ?? 0)], [+(a.x2 ?? 0), +(a.y2 ?? 0)]], false, m);
    } else if (tag === "rect" && !/%/.test((a.width ?? "") + (a.height ?? ""))) {
      const x = +(a.x ?? 0), y = +(a.y ?? 0), w = +(a.width ?? 0), h = +(a.height ?? 0);
      if (w > 0 && h > 0) poly(layerFor(fr, a), [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, m);
    } else if (tag === "circle" || tag === "ellipse") {
      const rx = +(a.r ?? a.rx ?? 0), ry = +(a.r ?? a.ry ?? 0);
      if (rx > 0 && ry > 0) poly(layerFor(fr, a), ellipse(+(a.cx ?? 0), +(a.cy ?? 0), rx, ry), true, m);
    } else if (tag === "text") {
      pendingText = { a, fr, m, text: "" };
    } else if (tag === "image") skipped++;
  }

  const names = [...layers.keys()];
  let s = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n";
  s += `9\n$EXTMIN\n10\n0\n20\n0\n30\n0\n9\n$EXTMAX\n10\n${f(W)}\n20\n${f(H)}\n30\n0\n0\nENDSEC\n`;
  s += "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0\n0\nENDTAB\n";
  s += `0\nTABLE\n2\nLAYER\n70\n${names.length + 1}\n0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
  for (const n of names) if (n !== "0") s += `0\nLAYER\n2\n${n}\n70\n0\n62\n${layers.get(n)}\n6\nCONTINUOUS\n`;
  s += "0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n" + ents.join("") + "0\nENDSEC\n0\nEOF\n";
  return { dxf: s, layers: names, polylines, texts, skipped };
}
