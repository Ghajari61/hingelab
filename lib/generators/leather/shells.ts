/**
 * Bags with other constructions:
 * - end panels with the body wrapped all the way round them (duffel, toiletry bag, round pencil
 *   case): the body's two ends overlap under the bottom and are stitched across; its stitch lines
 *   run once round each end panel's closed stitch loop;
 * - the bucket bag: a round or oval base with the body wrapped round it, joined by a side seam;
 * - the sculptural folded bag: one piece, front, base and back, with side wings that fold in and are
 *   stitched to the base's ends and to each other.
 */
import { rect } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { decorate } from "./decor";
import { frame, Pattern } from "./kit";
import { strapEnd, strapPart } from "./boxbag";
import { clamp, loopFrom, offsetContour, pathLength, pointAt, roundRect } from "./path";
import type { LeatherParams } from "./params";

type V3 = [number, number, number];

/** Pieces of a strip laid along a closed or open path in 3D (for the preview only). */
function stripViews(name: string, path: Pt[], uOf: (s: number) => number, width: number, map: (q: Pt) => V3, across: V3, K: number) {
  const L = pathLength(path);
  return Array.from({ length: K }, (_, j) => {
    const s0 = (L * j) / K, s1 = (L * (j + 1)) / K, a = map(pointAt(path, s0).pt), b = map(pointAt(path, s1).pt);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, U: V3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len];
    const u0 = uOf(s0), u1 = uOf(s1);
    return { name, outer: rect(u0, 0, u1 - u0, width), holes: [], soft: true, place: { x: 0, y: 0, z: 0, m: frame(U, across, [a[0] - U[0] * u0, a[1] - U[1] * u0, a[2] - U[2] * u0]) } };
  });
}

export function buildWrap(p: LeatherParams, pat: Pattern) {
  const s = pat.s, e = s.edge, k = p.product;
  const round = k === "penroll";
  const W = round ? clamp(p.size.depth, 30, 120) : clamp(p.size.depth, 60, 400), H = round ? W : clamp(p.size.height, 50, 400), Lb = clamp(p.size.width, 120, 900);
  const r = round ? W / 2 : clamp(p.size.corner, 5, Math.min(W, H) / 2);
  const end: Contour = round ? roundRect(0, 0, W, W, [W / 2, W / 2, W / 2, W / 2], 24) : roundRect(0, 0, W, H, [r, r, r * 0.6, r * 0.6]);
  const loop = loopFrom(offsetContour(end, -e)!, [W / 2, H]);
  const Ll = pathLength(loop), ov = 20, u0 = ov / 2, Ls = Ll + ov;
  const ends: GenPart[] = [0, 1].map((i) => pat.add({ id: `end${i + 1}`, name: `End panel ${i + 1}`, outer: end, holes: [], score: [], place: { x: 0, y: 0, z: 0, m: frame([0, 1, 0], [0, 0, -1], [i ? Lb : 0, 0, H]) } }));
  const body: GenPart = pat.add({ id: "body", name: "Body", outer: rect(0, 0, Ls, Lb), holes: [], score: [] });
  const edgeLoop = loopFrom(end, [W / 2, H]);
  body.views3d = stripViews("Body", edgeLoop, (sv) => u0 + (sv / pathLength(edgeLoop)) * Ll, Lb, ([y, v]) => [0, y, H - v], [1, 0, 0], Math.max(10, Math.round(Ll / 18)));
  for (const [i, v] of [[0, e], [1, Lb - e]] as const) pat.seam(`End panel ${i + 1} to the body`, [{ part: ends[i], rows: [loop] }, { part: body, rows: [[[u0, v], [u0 + Ll, v]]] }]);
  // the overlap under the bottom: two rows across, through both ends of the body
  for (const f of [0.25, 0.75]) pat.seam("Body overlap", [{ part: body, rows: [[[ov * f, e + 4], [ov * f, Lb - e - 4]]] }, { part: body, rows: [[[Ll + ov * f, e + 4], [Ll + ov * f, Lb - e - 4]]] }], { ticks: false });
  // the zip along the top, running the bag's length
  const uTop = u0 + Ll / 2, zl = clamp(p.build.zipLen, 60, Lb - 2 * e - 30), zw = p.build.zipGauge === 3 ? 6 : 8, v0 = (Lb - zl) / 2;
  body.holes.push(rect(uTop - zw / 2, v0, zw, zl));
  for (const sgn of [-1, 1]) pat.line("Zip tape", body, [[[uTop + sgn * (zw / 2 + 3.5), v0 - 3], [uTop + sgn * (zw / 2 + 3.5), v0 + zl + 3]]], 2);
  pat.count("zipper", 1, `#${p.build.zipGauge}, ${Math.round(zl + 20)} mm or longer`);
  // handles either side of the zip, lying along the bag
  if (p.build.handles > 0 && !round) {
    const hw = clamp(p.build.handleW, 10, 40), hl = clamp(p.build.handleLen, 120, 600), spread = Math.min(hl * 0.45, Lb - 60);
    for (const [i, sgn] of [[1, -1], [2, 1]] as const) {
      const hp = strapPart(pat, `handle${i}`, `Handle ${i}`, hl, hw);
      const u = uTop + sgn * (zw / 2 + 12 + hw / 2);
      for (const [vBase, dir] of [[Lb / 2 - spread / 2, 1], [Lb / 2 + spread / 2, -1]] as const) for (const a of [8, 22]) {
        pat.mount("rivet", body, [u, vBase + dir * a], 0, "handles");
        pat.mount("rivet", hp, [dir > 0 ? a : hl - a, hw / 2], 0, "", 20, false);
      }
      const va = Lb / 2 - spread / 2, vb = Lb / 2 + spread / 2;
      pat.rigs.push({ kind: "handle", part: hp, length: hl, width: hw, ends: [{ host: body, anchor: [u, va], rise: [u, va + 30] }, { host: body, anchor: [u, vb], rise: [u, vb - 30] }] });
    }
  }
  // shoulder strap on D-ring tabs riveted to the end panels
  if (p.build.strap && !round) {
    const sw = clamp(p.build.strapW, 15, 50);
    for (const i of [0, 1]) {
      const tab = pat.add({ id: `dtab${i + 1}`, name: `D-ring tab ${i + 1}`, outer: roundRect(0, 0, 60, sw - 4, [3, 3, 3, 3]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } });
      pat.fold(tab, [30, 0], [30, sw - 4]);
      for (const u of [10, 50]) pat.mount("rivet", tab, [u, (sw - 4) / 2], 0, "", 20, false);
      pat.mount("rivet", ends[i], [W / 2, e + 18], 0, "strap tabs");
      pat.count("dring", 1, `${sw} mm inside`);
      pat.rigs.push({ kind: "lie", part: tab, on: { host: ends[i], pt: [W / 2, e + 18] }, dir: [0, -1], anchor: [10, (sw - 4) / 2], outer: roundRect(0, 0, 36, sw - 4, [3, 3, 3, 3]) });
      pat.rigs.push({ kind: "ring", on: { host: ends[i], pt: [W / 2, e - 6] }, dir: [0, 1], r: sw / 2 + 1, lift: 2 });
    }
    const sLen = clamp(p.build.strapLen, 600, 1800), sa = strapPart(pat, "strap", "Shoulder strap", sLen, sw), sb = pat.splits.get("strap");
    const la = sa.outer.reduce((m, q) => Math.max(m, q[0]), 0);
    pat.rigs.push({ kind: "strap", up: "z", length: sLen, width: sw, a: { host: ends[0], pt: [W / 2, e - 6] }, b: { host: ends[1], pt: [W / 2, e - 6] },
      parts: sb ? [{ part: sa, from: 0, to: la }, { part: sb.part, from: sb.off, to: sLen }] : [{ part: sa, from: 0, to: sLen }] });
    pat.count("slider", 1, `${sw} mm`);
  }
  if (p.build.reinforce && !round) {
    const sw0 = Math.max(30, W - 2 * r * 0.6 - 6), sl0 = Lb - 2 * e - 4;
    const st = pat.add({ id: "stiffener", name: "Base stiffener (leatherboard)", outer: rect(0, 0, sw0, sl0), holes: [], place: { x: 0, y: 0, z: 0 } });
    pat.rigs.push({ kind: "lie", part: st, on: { host: body, pt: [u0 + 1, Lb / 2] }, dir: [1, 0], anchor: [sw0 / 2, sl0 / 2], inside: true });
  }
  if (p.build.feet && !round) {
    const fx = clamp(W / 2 - r * 0.6 - 14, 8, W / 2);
    for (const uu of [u0 + fx, u0 + Ll - fx]) for (const v of [0.14, 0.86]) pat.mount("foot", body, [uu, Lb * v], 0, "bag feet");
  }
  decorate(p, pat, ends[0], end, 0);
  pat.steps.push(
    "Stitch the zip under its slot first.",
    "Overlap the body's ends under the bottom and stitch the two rows across them.",
    "Stitch each end panel round its loop to the body, starting under the bottom where the body's ends overlap; the first and last holes go through both ends.",
    ...(p.build.handles > 0 && !round ? ["Rivet the handles either side of the zip before closing the ends."] : []),
  );
  return { size: [Lb, W, H] as V3 };
}

export function buildBucket(p: LeatherParams, pat: Pattern) {
  const e = pat.s.edge;
  const W = clamp(p.size.width, 80, 500), D = clamp(p.size.depth, 60, 500), H = clamp(p.size.height, 80, 500);
  const base: Contour = Array.from({ length: 96 }, (_, i) => { const a = (2 * Math.PI * i) / 96; return [W / 2 + (W / 2) * Math.cos(a), D / 2 + (D / 2) * Math.sin(a)] as Pt; });
  const loop = loopFrom(offsetContour(base, -e)!, [W / 2, D]);
  const Ll = pathLength(loop), ov = 22, u0 = ov / 2, Ls = Ll + ov;
  const bp = pat.add({ id: "base", name: "Base", outer: base, holes: [], score: [], place: { x: 0, y: 0, z: 0 } });
  pat.keep.add(bp.id);
  const body = pat.add({ id: "body", name: "Body", outer: rect(0, 0, Ls, H), holes: [], score: [] });
  const edgeLoop = loopFrom(base, [W / 2, D]);
  body.views3d = stripViews("Body", edgeLoop, (sv) => u0 + (sv / pathLength(edgeLoop)) * Ll, H, ([x, y]) => [x, y, H], [0, 0, -1], 32);
  pat.seam("Base to the body", [{ part: bp, rows: [loop] }, { part: body, rows: [[[u0, H - e], [u0 + Ll, H - e]]] }]);
  for (const f of [0.25, 0.75]) pat.seam("Side seam", [{ part: body, rows: [[[ov * f, e + 2], [ov * f, H - e - 6]]] }, { part: body, rows: [[[Ll + ov * f, e + 2], [Ll + ov * f, H - e - 6]]] }], { ticks: false });
  // grommets for a drawstring round the top, evenly
  const n = Math.max(6, Math.round(Ll / 45) & ~1);
  for (let i = 0; i < n; i++) pat.mount("grommet", body, [u0 + (Ll * (i + 0.5)) / n, 20], 0, "drawstring");
  pat.notes.push(`A drawstring about ${Math.round(Ll * 1.25 + 300)} mm long threads through the grommets.`);
  if (p.build.strap) {
    const sw = clamp(p.build.strapW, 15, 40);
    for (const uu of [u0 + Ll * 0.25, u0 + Ll * 0.75]) for (const v of [36, 50]) pat.mount("rivet", body, [uu, v], 0, "strap");
    const sl = clamp(p.build.strapLen, 400, 1500), st = strapPart(pat, "strap", "Shoulder strap", sl, sw);
    for (const u of [8, 22, sl - 8, sl - 22]) { const at = strapEnd(pat, st, u); pat.mount("rivet", at.part, [at.u, sw / 2], 0, "", 20, false); }
    const sb = pat.splits.get("strap"), la = st.outer.reduce((m, q) => Math.max(m, q[0]), 0);
    pat.rigs.push({ kind: "strap", up: "z", length: sl, width: sw, a: { host: body, pt: [u0 + Ll * 0.25, 30] }, b: { host: body, pt: [u0 + Ll * 0.75, 30] },
      parts: sb ? [{ part: st, from: 0, to: la }, { part: sb.part, from: sb.off, to: sl }] : [{ part: st, from: 0, to: sl }] });
  }
  if (p.build.reinforce) {
    const st = pat.add({ id: "stiffener", name: "Base stiffener (leatherboard)", outer: offsetContour(base, -(e + 2))!, holes: [], place: { x: 0, y: 0, z: 0 } });
    pat.rigs.push({ kind: "stand", part: st, m: frame([1, 0, 0], [0, 1, 0], [0, 0, p.T + 0.05]) });
  }
  decorate(p, pat, body, rect(Ll * 0.3, 30, Ll * 0.4, H - 60), 0);
  pat.steps.push("Stitch the side seam through the overlap, then the base round its loop to the body, starting at the side seam.", "Set the grommets and thread the drawstring.");
  return { size: [W, D, H] as V3 };
}

export function buildSculpt(p: LeatherParams, pat: Pattern) {
  const e = pat.s.edge;
  const W = clamp(p.size.width, 100, 500), H = clamp(p.size.height, 80, 400), D = clamp(p.size.depth, 40, 250), h = D / 2;
  const outline: Contour = [[-h, 0], [W + h, 0], [W + h, H], [W, H], [W, H + D], [W + h, H + D], [W + h, 2 * H + D], [-h, 2 * H + D], [-h, H + D], [0, H + D], [0, H]] as Contour;
  outline.push([-h, H]);
  const net = pat.add({ id: "net", name: "Bag (one piece)", outer: outline, holes: [], score: [] });
  for (const x of [0, W]) { pat.fold(net, [x, 0], [x, H]); pat.fold(net, [x, H + D], [x, 2 * H + D]); }
  for (const v of [H, H + D]) pat.fold(net, [0, v], [W, v]);
  for (const [sx, x0] of [[-1, 0], [1, W]] as const) {
    const wx = (t: number) => x0 + sx * t; // across a wing, from the fold out
    // front wing's lower edge to the first half of the base's end; back wing's to the second half
    pat.seam("Wing to the base", [{ part: net, rows: [[[wx(e), H - e], [wx(h - e), H - e]]] }, { part: net, rows: [[[x0 - sx * e, H + e], [x0 - sx * e, H + h - e]]] }]);
    pat.seam("Wing to the base", [{ part: net, rows: [[[wx(e), H + D + e], [wx(h - e), H + D + e]]] }, { part: net, rows: [[[x0 - sx * e, H + D - e], [x0 - sx * e, H + h + e]]] }]);
    // the two wings' outer edges to each other, up the middle of the side
    const st = e + pat.s.pitch;
    pat.seam("Side seam", [{ part: net, rows: [[[wx(h - e), H - st], [wx(h - e), e]]] }, { part: net, rows: [[[wx(h - e), H + D + st], [wx(h - e), 2 * H + D - e]]] }]);
  }
  const fv = (U: V3, V: V3, O: V3) => ({ x: 0, y: 0, z: 0, m: frame(U, V, O) });
  net.views3d = [
    { name: "Front", outer: rect(0, 0, W, H), holes: [], place: fv([1, 0, 0], [0, 0, -1], [0, D, H]) },
    { name: "Base", outer: rect(0, H, W, D), holes: [], place: fv([1, 0, 0], [0, -1, 0], [0, D + H, 0]) },
    { name: "Back", outer: rect(0, H + D, W, H), holes: [], place: fv([1, 0, 0], [0, 0, 1], [0, 0, -(H + D)]) },
    { name: "Wing", outer: rect(-h, 0, h, H), holes: [], place: fv([0, 1, 0], [0, 0, -1], [0, D, H]) },
    { name: "Wing", outer: rect(-h, H + D, h, H), holes: [], place: fv([0, -1, 0], [0, 0, 1], [0, 0, -(H + D)]) },
    { name: "Wing", outer: rect(W, 0, h, H), holes: [], place: fv([0, -1, 0], [0, 0, -1], [W, D + W, H]) },
    { name: "Wing", outer: rect(W, H + D, h, H), holes: [], place: fv([0, 1, 0], [0, 0, 1], [W, -W, -(H + D)]) },
  ];
  if (p.build.handles > 0) {
    const hw = clamp(p.build.handleW, 10, 40), hl = clamp(p.build.handleLen, 120, 600), spread = clamp(W * 0.4, 40, W - 40);
    for (const [i, v0, dir] of [[1, e + 8, 1], [2, 2 * H + D - e - 8, -1]] as const) {
      const hp = strapPart(pat, `handle${i}`, `Handle ${i}`, hl, hw);
      for (const [x, end] of [[W / 2 - spread / 2, 0], [W / 2 + spread / 2, 1]] as const) for (const a of [6, 18]) {
        pat.mount("rivet", net, [x, v0 + dir * a], 0, "handles");
        pat.mount("rivet", hp, [end ? hl - a : a, hw / 2], 0, "", 20, false);
      }
      const low = v0 + dir * 26, top = i === 1 ? 0 : 2 * H + D;
      pat.rigs.push({ kind: "handle", part: hp, length: hl, width: hw, ends: [{ host: net, anchor: [W / 2 - spread / 2, low], rise: [W / 2 - spread / 2, top] }, { host: net, anchor: [W / 2 + spread / 2, low], rise: [W / 2 + spread / 2, top] }] });
    }
  }
  if (p.build.closure === "magnet" || p.build.closure === "snap") {
    pat.mount(p.build.closure, net, [W / 2, e + 30], 0, "top closure");
    pat.mount(p.build.closure, net, [W / 2, 2 * H + D - e - 30], 0, "top closure", 20, false);
  }
  decorate(p, pat, net, rect(0, 0, W, H), 40);
  pat.steps.push(
    "Score the folds on the flesh side and dampen veg-tan leather before folding.",
    "Fold the base up and the wings in; stitch each wing's lower edge to its half of the base's end.",
    "Stitch the front and back wings to each other up the middle of each side.",
  );
  return { size: [W, D, H] as V3 };
}
