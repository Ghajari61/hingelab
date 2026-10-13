/**
 * Reads the outlines of an ASCII DXF drawing (R12 to 2018): lines, arcs, circles, ellipses,
 * polylines with bulges, splines and block inserts become polylines in mm with y pointing down.
 * Text, hatches, images, dimensions and paper-space entities are left out.
 */

export class DxfError extends Error {}

type Pt = [number, number];
export interface DxfLine { pts: Pt[]; closed: boolean }
export interface DxfDrawing {
  lines: DxfLine[];
  /** Size of the drawing, mm. */
  width: number;
  height: number;
  /** Entity types that were left out, with how many. */
  skipped: Record<string, number>;
}

export interface DxfOptions {
  /** More points than this and the drawing is refused. */
  maxPoints?: number;
}

type Pair = [number, string];
interface Ent { type: string; g: Pair[]; verts?: Pair[][] }
interface Block { base: Pt; ents: Ent[] }
type Mat = [number, number, number, number, number, number];

const ID: Mat = [1, 0, 0, 1, 0, 0];
const UNIT_MM: Record<string, number> = { "1": 25.4, "2": 304.8, "4": 1, "5": 10, "6": 1000, "8": 0.0000254, "9": 0.0254, "10": 914.4 };
const TOL_MM = 0.05;

const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: Mat, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

function pairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new DxfError("This is not an ASCII DXF file.");
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

const num = (g: Pair[], code: number, d = 0) => {
  const p = g.find((x) => x[0] === code);
  const v = p ? Number(p[1]) : d;
  return Number.isFinite(v) ? v : d;
};
const all = (g: Pair[], code: number) => g.filter((x) => x[0] === code).map((x) => Number(x[1]));

/** The drawing's sections: header unit, blocks and model-space entities. */
function read(text: string) {
  const ps = pairs(text);
  let units = "";
  const blocks = new Map<string, Block>();
  const ents: Ent[] = [];
  let section = "";
  let block: { name: string; base: Pt; ents: Ent[] } | null = null;
  let cur: Ent | null = null;
  let poly: Ent | null = null;
  const flush = () => {
    if (!cur) return;
    if (cur.type === "VERTEX" && poly) poly.verts!.push(cur.g);
    else if (cur.type === "SEQEND") poly = null;
    else if (cur.type === "BLOCK") block = { name: cur.g.find((x) => x[0] === 2)?.[1] ?? "", base: [num(cur.g, 10), num(cur.g, 20)], ents: [] };
    else if (cur.type === "ENDBLK") {
      if (block) blocks.set(block.name, { base: block.base, ents: block.ents });
      block = null;
    } else if (section === "ENTITIES" || (section === "BLOCKS" && block)) {
      if (cur.type === "POLYLINE") { cur.verts = []; poly = cur; } else poly = null;
      if (num(cur.g, 67) !== 1) (block ? block.ents : ents).push(cur);
    }
    cur = null;
  };
  for (let i = 0; i < ps.length; i++) {
    const [c, v] = ps[i];
    if (c === 0) {
      flush();
      if (v === "SECTION") { section = ps[i + 1]?.[0] === 2 ? ps[i + 1][1] : ""; i++; continue; }
      if (v === "ENDSEC") { section = ""; continue; }
      if (v === "EOF") break;
      if (section === "ENTITIES" || section === "BLOCKS") cur = { type: v, g: [] };
      continue;
    }
    if (section === "HEADER" && c === 9 && v === "$INSUNITS") units = ps[i + 1]?.[1] ?? "";
    if (cur) cur.g.push([c, v]);
  }
  flush();
  return { units, blocks, ents };
}

/** Points along an arc around `c` from angle a0 through sweep `da` (radians), within `tol` of the curve. */
function arcPts(c: Pt, r: number, a0: number, da: number, tol: number, out: Pt[], first = true) {
  const step = r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / r)) : Math.PI / 2;
  const n = Math.min(720, Math.max(2, Math.ceil(Math.abs(da) / Math.max(step, 1e-3))));
  for (let i = first ? 0 : 1; i <= n; i++) {
    const a = a0 + (da * i) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
}

/** A polyline through vertices with bulges (arc segments). */
function bulgePts(vs: { p: Pt; b: number }[], closed: boolean, tol: number): Pt[] {
  const out: Pt[] = [];
  if (!vs.length) return out;
  out.push(vs[0].p);
  const n = closed ? vs.length : vs.length - 1;
  for (let i = 0; i < n; i++) {
    const a = vs[i], z = vs[(i + 1) % vs.length];
    const dx = z.p[0] - a.p[0], dy = z.p[1] - a.p[1], d = Math.hypot(dx, dy);
    if (Math.abs(a.b) < 1e-9 || d < 1e-12) { out.push(z.p); continue; }
    const th = 4 * Math.atan(a.b);
    const off = ((d / 2) * (1 - a.b * a.b)) / (2 * a.b);
    const c: Pt = [(a.p[0] + z.p[0]) / 2 - (dy / d) * off, (a.p[1] + z.p[1]) / 2 + (dx / d) * off];
    const r = Math.hypot(a.p[0] - c[0], a.p[1] - c[1]);
    arcPts(c, r, Math.atan2(a.p[1] - c[1], a.p[0] - c[0]), th, tol, out, false);
  }
  if (closed && out.length > 2) {
    const [f, l] = [out[0], out[out.length - 1]];
    if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
  }
  return out;
}

/** Points along a NURBS curve: de Boor's algorithm in homogeneous coordinates, a few samples per knot span. */
function nurbsPts(deg: number, knots: number[], ctrl: Pt[], w: number[]): Pt[] {
  const n = ctrl.length;
  const t0 = knots[deg], t1 = knots[n];
  const out: Pt[] = [];
  const at = (t: number): Pt => {
    let k = deg;
    while (k < n - 1 && knots[k + 1] <= t) k++;
    const d = Array.from({ length: deg + 1 }, (_, j) => {
      const i = k - deg + j, wi = w[i] ?? 1;
      return [ctrl[i][0] * wi, ctrl[i][1] * wi, wi];
    });
    for (let r = 1; r <= deg; r++) {
      for (let j = deg; j >= r; j--) {
        const i = k - deg + j;
        const den = knots[i + deg - r + 1] - knots[i];
        const a = den === 0 ? 0 : (t - knots[i]) / den;
        for (let q = 0; q < 3; q++) d[j][q] = (1 - a) * d[j - 1][q] + a * d[j][q];
      }
    }
    const h = d[deg];
    return h[2] ? [h[0] / h[2], h[1] / h[2]] : [h[0], h[1]];
  };
  for (let k = deg; k < n; k++) {
    const a = knots[k], b = knots[k + 1];
    if (!(b > a)) continue;
    let len = 0;
    for (let i = k - deg; i < k; i++) len += Math.hypot(ctrl[i + 1][0] - ctrl[i][0], ctrl[i + 1][1] - ctrl[i][1]);
    const steps = deg === 1 ? 1 : Math.min(32, Math.max(4, Math.ceil(len / 2)));
    for (let s = out.length ? 1 : 0; s <= steps; s++) out.push(at(Math.min(t1, a + ((b - a) * s) / steps)));
  }
  if (!out.length && n) out.push(at(t0));
  return out;
}

/** Outlines of one entity in drawing units (y up), transformed by `m`. */
function outline(e: Ent, m: Mat, blocks: Map<string, Block>, tol: number, depth: number, put: (l: DxfLine) => void, skip: (t: string) => void) {
  const g = e.g;
  // Arbitrary axis: entities drawn from below (extrusion z < 0) mirror x.
  const ocs: Mat = num(g, 230, 1) < 0 ? mul(m, [-1, 0, 0, 1, 0, 0]) : m;
  const emit = (pts: Pt[], closed: boolean, mm: Mat) => {
    if (pts.length >= 2) put({ pts: pts.map((p) => apply(mm, p)), closed });
  };
  switch (e.type) {
    case "LINE":
      return emit([[num(g, 10), num(g, 20)], [num(g, 11), num(g, 21)]], false, m);
    case "CIRCLE":
    case "ARC": {
      const c: Pt = [num(g, 10), num(g, 20)], r = num(g, 40);
      if (!(r > 0)) return;
      const out: Pt[] = [];
      if (e.type === "CIRCLE") {
        arcPts(c, r, 0, 2 * Math.PI, tol, out);
        out.pop();
        return emit(out, true, ocs);
      }
      const a0 = (num(g, 50) * Math.PI) / 180;
      let a1 = (num(g, 51) * Math.PI) / 180;
      while (a1 <= a0) a1 += 2 * Math.PI;
      arcPts(c, r, a0, a1 - a0, tol, out);
      return emit(out, false, ocs);
    }
    case "ELLIPSE": {
      const c: Pt = [num(g, 10), num(g, 20)], mx = num(g, 11), my = num(g, 21), ratio = num(g, 40, 1);
      const R = Math.hypot(mx, my);
      if (!(R > 0)) return;
      const s = num(g, 41, 0);
      let t = num(g, 42, 2 * Math.PI);
      while (t <= s) t += 2 * Math.PI;
      const flip = num(g, 230, 1) < 0 ? -1 : 1;
      const step = 2 * Math.acos(Math.max(-1, 1 - tol / R));
      const n = Math.min(720, Math.max(8, Math.ceil((t - s) / Math.max(step, 1e-3))));
      const pts: Pt[] = [];
      for (let i = 0; i <= n; i++) {
        const a = s + ((t - s) * i) / n;
        pts.push([c[0] + mx * Math.cos(a) - flip * ratio * my * Math.sin(a), c[1] + my * Math.cos(a) + flip * ratio * mx * Math.sin(a)]);
      }
      const whole = Math.abs(t - s - 2 * Math.PI) < 1e-6;
      if (whole) pts.pop();
      return emit(pts, whole, m);
    }
    case "LWPOLYLINE": {
      const vs: { p: Pt; b: number }[] = [];
      for (const [c, v] of g) {
        if (c === 10) vs.push({ p: [Number(v), 0], b: 0 });
        else if (c === 20 && vs.length) vs[vs.length - 1].p[1] = Number(v);
        else if (c === 42 && vs.length) vs[vs.length - 1].b = Number(v) || 0;
      }
      const closed = (num(g, 70) & 1) === 1;
      return emit(bulgePts(vs, closed, tol), closed, ocs);
    }
    case "POLYLINE": {
      const flags = num(g, 70);
      if (flags & (16 | 64)) return skip("MESH");
      const vs = (e.verts ?? []).filter((v) => !(num(v, 70) & 16)).map((v) => ({ p: [num(v, 10), num(v, 20)] as Pt, b: num(v, 42) }));
      const closed = (flags & 1) === 1;
      return emit(bulgePts(vs, closed, tol), closed, flags & 8 ? m : ocs);
    }
    case "SPLINE": {
      const deg = num(g, 71, 3);
      const knots = all(g, 40), w = all(g, 41);
      const cx = all(g, 10), cy = all(g, 20);
      const ctrl: Pt[] = cx.map((x, i) => [x, cy[i] ?? 0]);
      const closed = (num(g, 70) & 1) === 1;
      if (deg >= 1 && ctrl.length > deg && knots.length === ctrl.length + deg + 1) return emit(nurbsPts(deg, knots, ctrl, w), closed, m);
      const fx = all(g, 11), fy = all(g, 21);
      return emit(fx.map((x, i) => [x, fy[i] ?? 0]), closed, m);
    }
    case "INSERT": {
      const b = blocks.get(g.find((x) => x[0] === 2)?.[1] ?? "");
      if (!b || depth > 8) return skip("INSERT");
      const sx = num(g, 41, 1), sy = num(g, 42, 1), rot = (num(g, 50) * Math.PI) / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const local: Mat = [cos * sx, sin * sx, -sin * sy, cos * sy, num(g, 10), num(g, 20)];
      const mm = mul(ocs, mul(local, [1, 0, 0, 1, -b.base[0], -b.base[1]]));
      for (const be of b.ents) outline(be, mm, blocks, tol, depth + 1, put, skip);
      return;
    }
    default:
      return skip(e.type);
  }
}

/** The drawing's outlines in mm, y down, moved so the top-left corner is at 0,0. */
export function readDxf(text: string, opts: DxfOptions = {}): DxfDrawing {
  const maxPoints = opts.maxPoints ?? 400_000;
  const { units, blocks, ents } = read(text);
  const raw: DxfLine[] = [];
  const skipped: Record<string, number> = {};
  let count = 0;
  let scale = UNIT_MM[units] ?? 1;
  const tol = TOL_MM / scale;
  for (const e of ents) {
    outline(e, ID, blocks, tol, 0, (l) => {
      count += l.pts.length;
      if (count > maxPoints) throw new DxfError("The drawing is too detailed.");
      raw.push(l);
    }, (t) => { skipped[t] = (skipped[t] ?? 0) + 1; });
  }
  if (!raw.length) throw new DxfError("The DXF has no outlines.");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of raw) for (const [x, y] of l.pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const big = Math.max(maxX - minX, maxY - minY);
  // Some programs label millimetre drawings as centimetres: trust the unit only when the size stays believable.
  if (scale !== 1 && big * scale > 5000 && big <= 5000) scale = 1;
  const lines = raw.map((l) => ({
    closed: l.closed,
    pts: l.pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y]): Pt => [(x - minX) * scale, (maxY - y) * scale]),
  })).filter((l) => l.pts.length >= 2);
  return { lines, width: (maxX - minX) * scale, height: (maxY - minY) * scale, skipped };
}

const f2 = (v: number) => String(Math.round(v * 100) / 100);

/** The outlines as an SVG in mm, red cut lines, a few hundred subpaths per path. */
export function dxfToSvg(d: DxfDrawing): string {
  const paths: string[] = [];
  let cur: string[] = [];
  for (const l of d.lines) {
    let s = "", last = "";
    for (const [x, y] of l.pts) {
      const xy = `${f2(x)} ${f2(y)}`;
      if (xy === last) continue;
      s += s ? `L${xy}` : `M${xy}`;
      last = xy;
    }
    if (!s.includes("L")) continue;
    cur.push(l.closed ? `${s}Z` : s);
    if (cur.length >= 400) { paths.push(cur.join("")); cur = []; }
  }
  if (cur.length) paths.push(cur.join(""));
  const w = f2(Math.max(d.width, 0.01)), h = f2(Math.max(d.height, 0.01));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`
    + paths.map((p) => `<path d="${p}" fill="none" stroke="#FF0000" stroke-width="0.2"/>`).join("") + `</svg>`;
}
