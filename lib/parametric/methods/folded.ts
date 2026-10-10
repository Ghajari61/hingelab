/**
 * Folded (papercraft): the model is simplified to a low-poly solid and its faces are unfolded into
 * flat nets. Each net grows from its largest face across the longest edges first (coplanar faces
 * always stay joined, so they read as one flat face), and a face joins only if it overlaps nothing
 * already in the net and the net still fits the sheet. Joined edges become fold lines (scored:
 * mountain solid, valley dashed), every other edge is cut, numbered on both sides and given a glue
 * tab on one side. The engraved side is the outside of the model.
 */
import { differenceShapes, pointInContour, unionShapes } from "@/lib/letters/polygon";
import { strokeText, textWidth } from "../label";
import { decimate, weld, type IndexedMesh } from "../simplify";
import type { Contour, MeshData, ParametricParams, Part, Point, Warning } from "../types";
import { finId, type MethodOut } from "./common";
import { CAL_STRIP } from "@/lib/fit/calibration";

type V2 = [number, number];
type V3 = [number, number, number];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Coplanar faces: normals within 1°. */
const FLAT_COS = Math.cos((1 * Math.PI) / 180);
const DASH = 2.5, DASH_GAP = 1.5;
const WEDGE = (6 * Math.PI) / 180;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** The model with at most `target` faces (quadric edge collapse). */
export function lowPoly(mesh: MeshData, target: number): { lp: IndexedMesh; from: number } {
  const w = weld(mesh);
  return { lp: decimate(w, target), from: w.tris.length / 3 };
}
/** Separating-axis overlap of two convex polygons, by more than `eps` mm. */
function convexOverlap(a: V2[], b: V2[], eps = 0.01): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1], ny = p[0] - q[0];
      const l = Math.hypot(nx, ny);
      if (l < 1e-12) continue;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const r of a) { const d = (r[0] * nx + r[1] * ny) / l; amin = Math.min(amin, d); amax = Math.max(amax, d); }
      for (const r of b) { const d = (r[0] * nx + r[1] * ny) / l; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
      if (amax - bmin <= eps || bmax - amin <= eps) return false;
    }
  }
  return true;
}

const boxOf = (ps: V2[]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ps) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};
const boxesMeet = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const near = (p: V2, q: V2) => Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3;

interface Poly2 { pts: V2[]; box: [number, number, number, number]; convex: boolean }

/** Dashes along a segment (a valley fold), ending in a dash at both ends. */
function dashes(a: Point, b: Point): Contour[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round((L + DASH_GAP) / (DASH + DASH_GAP)));
  const dl = n > 1 ? (L - (n - 1) * DASH_GAP) / n : L;
  if (dl <= 0.4) return [[a, b]];
  const out: Contour[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i * (dl + DASH_GAP)) / L, e = (i * (dl + DASH_GAP) + dl) / L;
    out.push([[a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s], [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]]);
  }
  return out;
}

/** Sheet (SVG, y down) point for a net point (y up). */
const flip = ([x, y]: V2): Point => [x, -y];

/**
 * Engrave `text` centred at `c` (net coordinates) with its baseline along `dir` and its top toward
 * `up`, if the text box fits inside `poly`. Tries the sizes in order.
 */
function placeText(text: string, c0: (h: number) => V2, dir: V2, up: V2, poly: V2[], sizes: number[], maxW: number): Contour[] | null {
  const ring = poly.map(flip);
  for (const h of sizes) {
    const w = textWidth(text, h);
    if (w > maxW) continue;
    const c = flip(c0(h));
    // SVG frame: the baseline direction, flipped so the text's top points along `up`.
    let d: V2 = [dir[0], -dir[1]];
    const u: V2 = [up[0], -up[1]];
    if (d[1] * u[0] - d[0] * u[1] < 0) d = [-d[0], -d[1]];
    const l = Math.hypot(d[0], d[1]);
    d = [d[0] / l, d[1] / l];
    const top: V2 = [d[1], -d[0]];
    const hw = w / 2 + 0.3, hh = h / 2 + 0.3;
    const corners: V2[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([a, b]) => [c[0] + d[0] * a - top[0] * b, c[1] + d[1] * a - top[1] * b]);
    if (!corners.every((q) => pointInContour(q, ring))) continue;
    return strokeText(text, h, c[0], c[1], (-Math.atan2(d[1], d[0]) * 180) / Math.PI);
  }
  return null;
}

export function sliceFolded(p: ParametricParams, mesh: MeshData): MethodOut {
  const o = p.folded;
  const warnings: Warning[] = [];
  const { lp, from } = lowPoly(mesh, Math.max(4, Math.round(o.faces)));
  const { pos, tris } = lp;
  const nT = tris.length / 3, nV = pos.length / 3;
  const V = (i: number): V3 => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const vt = (t: number, k: number) => tris[3 * t + (k % 3)];
  const normal: V3[] = [], area: number[] = [];
  for (let t = 0; t < nT; t++) {
    const c = crossV(sub(V(vt(t, 1)), V(vt(t, 0))), sub(V(vt(t, 2)), V(vt(t, 0))));
    const l = len3(c);
    area.push(l / 2);
    normal.push(l > 0 ? [c[0] / l, c[1] / l, c[2] / l] : [0, 0, 1]);
  }
  const ok = (t: number) => area[t] > 1e-6;
  const ekey = (a: number, b: number) => (a < b ? a * nV + b : b * nV + a);
  const sides = new Map<number, { t: number; k: number }[]>();
  for (let t = 0; t < nT; t++) {
    if (!ok(t)) continue;
    for (let k = 0; k < 3; k++) {
      const key = ekey(vt(t, k), vt(t, k + 1));
      const list = sides.get(key);
      if (list) list.push({ t, k }); else sides.set(key, [{ t, k }]);
    }
  }
  /** The face across edge k of t (only for edges with exactly two faces, oppositely wound). */
  const across = (t: number, k: number): { u: number; m: number } | null => {
    const list = sides.get(ekey(vt(t, k), vt(t, k + 1)));
    if (!list || list.length !== 2) return null;
    const o2 = list[0].t === t ? list[1] : list[0];
    if (o2.t === t || vt(o2.t, o2.k) !== vt(t, k + 1)) return null;
    return { u: o2.t, m: o2.k };
  };
  const edgeLen = (t: number, k: number) => len3(sub(V(vt(t, k + 1)), V(vt(t, k))));
  const isFlat = (t: number, u: number) => dot3(normal[t], normal[u]) > FLAT_COS;

  // The usable sheet, less room for tabs round the net, the calibration strip and the nesting grid.
  const { sheetW, sheetMargin } = p.material;
  const sheetH = p.material.sheetH - (p.material.calibration ? CAL_STRIP : 0);
  const room = (o.tabs ? 2 * o.tabWidth : 0) + 3;
  const lim = [sheetW - 2 * sheetMargin - room, sheetH - 2 * sheetMargin - room].sort((a, b) => b - a);
  const fitsSheet = (b: number[]) => { const d = [b[2] - b[0], b[3] - b[1]].sort((x, y) => y - x); return d[0] <= lim[0] && d[1] <= lim[1]; };

  const at: (V2[] | null)[] = new Array(nT).fill(null);
  const netOf = new Int32Array(nT).fill(-1);
  const joined = new Set<number>();
  const nets: { tris: number[]; polys: Poly2[]; box: number[] }[] = [];
  const order = Array.from({ length: nT }, (_, t) => t).filter(ok).sort((a, b) => area[b] - area[a] || a - b);
  let tooBigFaces = 0;

  for (const seed of order) {
    if (netOf[seed] >= 0) continue;
    const a = V(vt(seed, 0)), b = V(vt(seed, 1)), c = V(vt(seed, 2));
    const L = len3(sub(b, a));
    const along = dot3(sub(c, a), sub(b, a)) / L;
    const h = Math.sqrt(Math.max(0, dot3(sub(c, a), sub(c, a)) - along * along));
    const pts: V2[] = [[0, 0], [L, 0], [along, h]];
    const ni = nets.length;
    const net = { tris: [seed], polys: [{ pts, box: boxOf(pts), convex: true }], box: boxOf(pts) as number[] };
    nets.push(net);
    at[seed] = pts;
    netOf[seed] = ni;
    if (!fitsSheet(net.box)) tooBigFaces++;
    const cand: { t: number; k: number; w: number }[] = [];
    const pushFrom = (t: number) => {
      for (let k = 0; k < 3; k++) {
        const x = across(t, k);
        if (!x || netOf[x.u] >= 0 || !ok(x.u)) continue;
        cand.push({ t, k, w: (isFlat(t, x.u) ? 1e9 : 0) + edgeLen(t, k) });
      }
    };
    pushFrom(seed);
    while (cand.length) {
      let bi = 0;
      for (let i = 1; i < cand.length; i++) if (cand[i].w > cand[bi].w) bi = i;
      const { t, k } = cand[bi];
      cand.splice(bi, 1);
      const x = across(t, k)!;
      if (netOf[x.u] >= 0) continue;
      const u = x.u, m = x.m;
      const A2 = at[t]![k % 3], B2 = at[t]![(k + 1) % 3];
      const pa = V(vt(t, k)), pb = V(vt(t, k + 1)), pc = V(vt(u, m + 2));
      const ab = sub(pa, pb), Lab = len3(ab);
      const al = dot3(sub(pc, pb), ab) / Lab;
      const hh = Math.sqrt(Math.max(0, dot3(sub(pc, pb), sub(pc, pb)) - al * al));
      const e: V2 = [(A2[0] - B2[0]) / Lab, (A2[1] - B2[1]) / Lab];
      const C2: V2 = [B2[0] + al * e[0] - hh * e[1], B2[1] + al * e[1] + hh * e[0]];
      const tri: V2[] = [];
      tri[m % 3] = B2; tri[(m + 1) % 3] = A2; tri[(m + 2) % 3] = C2;
      const box = boxOf(tri);
      const grown = [Math.min(net.box[0], box[0]), Math.min(net.box[1], box[1]), Math.max(net.box[2], box[2]), Math.max(net.box[3], box[3])];
      if (!fitsSheet(grown)) continue;
      let clash = false;
      for (let i = 0; i < net.tris.length && !clash; i++) {
        const q = net.tris[i];
        if (q === t) continue;
        const pq = net.polys[i];
        if (!boxesMeet(pq.box, [box[0] - 0.01, box[1] - 0.01, box[2] + 0.01, box[3] + 0.01])) continue;
        if (convexOverlap(pq.pts, tri)) { clash = true; break; }
        // Faces meeting at a point may not leave a wedge under 6° between them: it would close into a
        // hairline slit (or vanish) in the outline.
        for (const [X, Y] of [[A2, C2], [B2, C2], [C2, A2], [C2, B2]]) for (let j = 0; j < 3 && !clash; j++) {
          if (!near(X, pq.pts[j])) continue;
          for (const Z of [pq.pts[(j + 1) % 3], pq.pts[(j + 2) % 3]]) {
            const ux = Y[0] - X[0], uy = Y[1] - X[1], vx = Z[0] - X[0], vy = Z[1] - X[1];
            const ang = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
            if (ang < WEDGE) clash = true;
          }
        }
      }
      if (clash) continue;
      at[u] = tri;
      netOf[u] = ni;
      net.tris.push(u);
      net.polys.push({ pts: tri, box, convex: true });
      net.box = grown;
      joined.add(ekey(vt(t, k), vt(t, k + 1)));
      pushFrom(u);
    }
  }
  if (tooBigFaces) warnings.push({ code: "PART_TOO_BIG", message: `${tooBigFaces} face${tooBigFaces === 1 ? " is" : "s are"} larger than the sheet. Scale the model down or use a bigger sheet.` });

  // Edges: folds (joined), cuts between two faces (numbered, one glue tab), open edges.
  const folds: { net: number; a: V2; b: V2; kind: "mountain" | "valley" }[] = [];
  const cuts: { n: number; s1: { t: number; k: number }; s2: { t: number; k: number } }[] = [];
  const done = new Set<number>();
  for (const net of nets) for (const t of net.tris) for (let k = 0; k < 3; k++) {
    const key = ekey(vt(t, k), vt(t, k + 1));
    if (done.has(key)) continue;
    const x = across(t, k);
    if (!x || !ok(x.u) || netOf[x.u] < 0) { done.add(key); continue; }
    done.add(key);
    if (joined.has(key)) {
      if (isFlat(t, x.u)) continue;
      const s = dot3(sub(V(vt(x.u, x.m + 2)), V(vt(t, k))), normal[t]);
      folds.push({ net: netOf[t], a: at[t]![k % 3], b: at[t]![(k + 1) % 3], kind: s < 0 ? "mountain" : "valley" });
    } else {
      cuts.push({ n: cuts.length + 1, s1: { t, k }, s2: { t: x.u, k: x.m } });
    }
  }

  // Glue tabs, then edge numbers on both sides of every cut.
  const tabs: Poly2[][] = nets.map(() => []);
  const engr: Contour[][] = nets.map(() => []);
  const score: Contour[][] = nets.map(() => []);
  let untabbed = 0;
  const edgeOf = (s: { t: number; k: number }) => ({ P: at[s.t]![s.k % 3], Q: at[s.t]![(s.k + 1) % 3] });
  /** A trapezoid tab on the outside of the edge, trimmed where it would cover the net; `frac` is the part kept. */
  const tryTab = (s: { t: number; k: number }): { poly: V2[]; w: number; frac: number } | null => {
    const { P, Q } = edgeOf(s);
    const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    const e: V2 = [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L];
    const out: V2 = [e[1], -e[0]];
    const w = Math.min(o.tabWidth, L * 0.45);
    if (w < 1.5) return null;
    const sl = Math.min(w * 0.8, L * 0.35);
    const poly: V2[] = [P, [P[0] + out[0] * w + e[0] * sl, P[1] + out[1] * w + e[1] * sl], [Q[0] + out[0] * w - e[0] * sl, Q[1] + out[1] * w - e[1] * sl], Q];
    const box = boxOf(poly);
    const ni = netOf[s.t];
    const close = [...nets[ni].polys, ...tabs[ni]].filter((pq) => boxesMeet(pq.box, box));
    if (!close.some((pq) => !pq.convex || convexOverlap(pq.pts, poly))) return { poly, w, frac: 1 };
    const full = w * (L - sl);
    const keep = differenceShapes([poly], close.map((pq) => pq.pts));
    const probes: V2[] = [0.25, 0.5, 0.75].map((f) => [P[0] + (Q[0] - P[0]) * f + out[0] * 0.3, P[1] + (Q[1] - P[1]) * f + out[1] * 0.3]);
    const piece = keep.filter((sh) => probes.some((q) => pointInContour(q, sh.outer))).sort((a, b) => b.area - a.area)[0];
    if (!piece) return null;
    return { poly: piece.outer.map(([x, y]) => [x, y] as V2), w, frac: piece.area / full };
  };
  for (const c of cuts) {
    let side: { t: number; k: number } | null = null, tab: { poly: V2[]; w: number; frac: number } | null = null;
    if (o.tabs) {
      for (const s of [c.s1, c.s2]) {
        const r = tryTab(s);
        if (r && (!tab || r.frac > tab.frac)) { tab = r; side = s; }
        if (tab && tab.frac >= 0.999) break;
      }
      if (!tab || tab.frac < 0.4) { untabbed++; side = null; tab = null; }
    }
    if (tab && side) {
      tabs[netOf[side.t]].push({ pts: tab.poly, box: boxOf(tab.poly), convex: tab.frac >= 0.999 });
      const { P, Q } = edgeOf(side);
      score[netOf[side.t]].push([flip(P), flip(Q)]);
    }
    if (!o.numbers) continue;
    const label = String(c.n);
    for (const s of [c.s1, c.s2]) {
      const { P, Q } = edgeOf(s);
      const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
      const e: V2 = [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L];
      const inw: V2 = [-e[1], e[0]];
      const mid: V2 = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
      let paths: Contour[] | null;
      if (tab && s === side) {
        paths = placeText(label, (h) => [mid[0] - inw[0] * tab!.w * 0.5, mid[1] - inw[1] * tab!.w * 0.5], e, [-inw[0], -inw[1]], tab.poly, [3, 2.5, 2, 1.5, 1.2], L * 0.6);
      } else {
        paths = placeText(label, (h) => [mid[0] + inw[0] * (h / 2 + 0.8), mid[1] + inw[1] * (h / 2 + 0.8)], e, [-inw[0], -inw[1]], at[s.t]!, [3, 2.5, 2, 1.5, 1.2], L * 0.7);
      }
      if (paths) engr[netOf[s.t]].push(...paths);
    }
  }
  if (untabbed) warnings.push({ code: "NO_TAB", message: `${untabbed} cut edge${untabbed === 1 ? " has" : "s have"} no room for a glue tab; join ${untabbed === 1 ? "it" : "them"} with tape from the inside.` });

  for (const f of folds) {
    const a = flip(f.a), b = flip(f.b);
    if (f.kind === "mountain") score[f.net].push([a, b]);
    else score[f.net].push(...dashes(a, b));
  }

  // Parts: one per net.
  const parts: Part[] = [];
  const partOf: (Part | undefined)[] = [];
  nets.forEach((net, ni) => {
    const id = finId(ni, nets.length, "N");
    const contours = [...net.polys, ...tabs[ni]].map((q) => q.pts.map(flip));
    const shapes = unionShapes(contours, [], false);
    if (!shapes.length) return;
    const shape = shapes.reduce((a, b) => (b.area > a.area ? b : a));
    const engrave = [...engr[ni]];
    if (p.labels.enabled) {
      const big = net.tris.map((t, i) => ({ i, a: area[t] })).sort((x, y) => y.a - x.a)[0];
      const tri = net.polys[big.i].pts;
      const c: V2 = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
      const lab = placeText(p.labels.prefix + id, () => c, [1, 0], [0, 1], tri, [4, 3, 2.5, 2], Infinity);
      if (lab) engrave.push(...lab);
    }
    const faces3d: number[] = [];
    for (const t of net.tris) for (let k = 0; k < 3; k++) faces3d.push(...V(vt(t, k)));
    partOf[ni] = { id, kind: "net", shape, innerCuts: [], engrave, score: score[ni], placement: IDENTITY.slice(), plane: -1, neighbors: [], faces3d };
    parts.push(partOf[ni]!);
  });
  for (const c of cuts) {
    const a = partOf[netOf[c.s1.t]], b = partOf[netOf[c.s2.t]];
    if (!a || !b || a === b) continue;
    if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
    if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
  }

  const simplified = from > nT ? ` (simplified from ${from})` : "";
  const guide = [
    `The model has ${nT} faces${simplified}, unfolded into ${parts.length} net${parts.length === 1 ? "" : "s"} with ${cuts.length} numbered edges to glue.`,
    "Score lines first: fold solid lines away from you (mountain) and dashed lines toward you (valley). The engraved side is the outside.",
    o.tabs ? "Glue each tab under the edge with the same number, starting from N01 and working outward." : "Join each edge to the edge with the same number with tape from the inside.",
    "Close the last edges from the inside with tweezers or a pencil end.",
  ];
  return { planes: [], sections: [], parts, warnings, guide };
}
