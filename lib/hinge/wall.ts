/** The unfolded wall: tabs, outline (with slot-style edge notches), strip pieces and the bend test strip. */
import type { Edge, HingeCol, HingeSegments, Params, Point, Seg, WallPart } from "./types";
import { bboxOf, offsetPolyXY, offsetRect, offsetRectXY, polyD, simplify } from "./polygon";
import { colSegments, hingeSegments, honeyRise, kerfY, makeCols, mergesEdgeCuts, slotLike } from "./hinge";
import { r3 } from "./util";

/** How many tabs fit on a flat of length `len`. Seam flats keep an even count so the seam stays clear. */
export function tabCount(len: number, tabW: number, seam: boolean) {
  const m = 1.5;
  let n = Math.floor((len - 2 * m + 2 * tabW) / (3 * tabW));
  if (len < tabW + 2 * m) n = 0;
  n = Math.max(0, n);
  if (seam && n % 2 === 1) n -= 1;
  return n;
}

/* Wall outline: body rectangle, tabs, and (in slot mode) rounded notches for edge-reaching cuts. */
export function wallOutline(w: number, h: number, topTabs: number[], bottomTabs: number[], cols: HingeCol[], p: Params, hs: HingeSegments) {
  const t = p.T, k = p.K, ky = kerfY(p), a = p.tabW, r = p.slotW / 2;
  const top: { x: number; d: number }[] = [], bot: { x: number; d: number }[] = [];
  if (mergesEdgeCuts(p)) for (const c of cols) for (const [y1, y2] of colSegments(c.kind, hs, h, p.bridge)) {
    if (y1 < 0 && y2 > 0) top.push({ x: c.x, d: y2 });
    if (y2 > h && y1 < h) bot.push({ x: c.x, d: h - y1 });
  }
  type Ev = { x: number; tab: true } | { x: number; d: number; tab?: undefined };
  const ev = (list: { x: number; d: number }[], tabs: number[]): Ev[] => [...tabs.map(x => ({ x, tab: true as const })), ...list].sort((m, n) => m.x - n.x);
  const pts: Point[] = [[0, 0]];
  // Honeycomb edge cells are half hexagons: the notch is the cut-away shape, pointed at its far end.
  const honey = p.pattern === "honeycomb", rise = honeyRise(r);
  for (const e of ev(top, topTabs)) {
    if (e.tab) pts.push([e.x - a / 2, 0], [e.x - a / 2, -t], [e.x + a / 2, -t], [e.x + a / 2, 0]);
    else if (honey) { const yc = Math.max(0.2, e.d - rise); pts.push([e.x - r, 0], [e.x - r, yc], [e.x, yc + rise], [e.x + r, yc], [e.x + r, 0]); }
    else { const yc = Math.max(0.2, e.d - r + ky / 2); pts.push([e.x - r, 0], [e.x - r, yc], [e.x + r, yc], [e.x + r, 0]); }
  }
  pts.push([w, 0], [w, h]);
  for (const e of ev(bot, bottomTabs).reverse()) {
    if (e.tab) pts.push([e.x + a / 2, h], [e.x + a / 2, h + t], [e.x - a / 2, h + t], [e.x - a / 2, h]);
    else if (honey) { const yc = h - Math.max(0.2, e.d - rise); pts.push([e.x + r, h], [e.x + r, yc], [e.x, yc - rise], [e.x - r, yc], [e.x - r, h]); }
    else { const yc = h - Math.max(0.2, e.d - r + ky / 2); pts.push([e.x + r, h], [e.x + r, yc], [e.x - r, yc], [e.x - r, h]); }
  }
  pts.push([0, h]);
  if (honey) return { outline: offsetPolyXY(simplify(pts), k, ky), caps: [] };
  const outline = ky === k ? offsetRect(simplify(pts), k / 2) : offsetRectXY(simplify(pts), k / 2, ky / 2);
  const caps: number[] = [], capLen = p.slotW - k, xs = [...top, ...bot].map(e => e.x);
  for (let i = 0; i < outline.length; i++) {
    const A = outline[i], B = outline[(i + 1) % outline.length];
    if (Math.abs(A[1] - B[1]) > 1e-9 || Math.abs(Math.abs(B[0] - A[0]) - capLen) > 1e-6) continue;
    const mx = (A[0] + B[0]) / 2;
    if (xs.some(x => Math.abs(x - mx) < 1e-6)) caps.push(i);
  }
  return { outline, caps };
}

/** SVG path of a wall outline; notch caps become half-circle arcs. */
export function outlinePath(pt: Pick<WallPart, "outline" | "caps">, ox: number, oy: number) {
  if (!pt.caps || !pt.caps.length) return polyD(pt.outline, ox, oy);
  const o = pt.outline, rr = (P_slotW(pt) ) / 2, set = new Set(pt.caps);
  let d = `M${r3(o[0][0] + ox)},${r3(o[0][1] + oy)}`;
  for (let i = 0; i < o.length; i++) {
    const nx = o[(i + 1) % o.length];
    d += set.has(i) ? ` A${r3(rr)},${r3(rr)} 0 0 0 ${r3(nx[0] + ox)},${r3(nx[1] + oy)}` : ` L${r3(nx[0] + ox)},${r3(nx[1] + oy)}`;
  }
  return d + " Z";
}

/** Width of the first notch cap, measured on the compensated outline. */
export function P_slotW(pt: Pick<WallPart, "outline" | "caps">) { const o = pt.outline, i = pt.caps[0], A = o[i], B = o[(i + 1) % o.length]; return Math.abs(B[0] - A[0]); }

/**
 * Unfold the wall centerline into one strip (or two halves) and place the hinge zones.
 * Mutates `edges` (seam flags and tab positions), matching the prototype.
 */
export function buildWalls(p: Params, edges: Edge[], rN: number, hBody: number, topTabs: boolean):
  { error: string } | { parts: WallPart[]; cols: HingeCol[]; hs: HingeSegments; L: number; zoneLen: number } {
  const N = edges.length;

  // ---- strip layout along the wall centerline
  const seamEdges = p.split === 2 ? [0, Math.floor(N / 2)] : [0];
  edges.forEach((e, i) => {
    e.seam = seamEdges.includes(i);
    const n = tabCount(e.len, p.tabW, e.seam);
    e.tabs = []; for (let j = 0; j < n; j++) e.tabs.push(e.len * (j + 0.5) / n);
  });
  const segs: Seg[] = []; let x = 0;
  const pushEdge = (i: number, from: number, to: number) => { segs.push({ kind: "edge", i, from, to, x0: x }); x += to - from; };
  pushEdge(0, edges[0].len / 2, edges[0].len);
  for (let i = 0; i < N; i++) {
    const arcLen = edges[i].sweep * rN / (1 + (p.stretch || 0) / 100);
    segs.push({ kind: "arc", i, x0: x, len: arcLen }); x += arcLen;
    if (i + 1 < N) pushEdge(i + 1, 0, edges[i + 1].len);
  }
  pushEdge(0, 0, edges[0].len / 2);
  const L = x;

  // tabs in strip coords
  const tabX: number[] = [];
  for (const s of segs) if (s.kind === "edge") for (const u of edges[s.i].tabs) if (u - p.tabW / 2 >= s.from - 1e-6 && u + p.tabW / 2 <= s.to + 1e-6) tabX.push(s.x0 + u - s.from);

  // hinge intervals around arcs
  const freeStart = (e: Edge) => e.tabs.length ? e.tabs[0] - p.tabW / 2 : (e.seam ? e.len / 2 - 2 : e.len / 2);
  const freeEnd = (e: Edge) => e.tabs.length ? e.len - (e.tabs[e.tabs.length - 1] + p.tabW / 2) : (e.seam ? e.len / 2 - 2 : e.len / 2);
  const ivals: [number, number][] = [];
  segs.forEach(s => {
    if (s.kind !== "arc") return;
    const before = Math.max(0, Math.min(p.overrun, freeEnd(edges[s.i]) - 1.5));
    const after = Math.max(0, Math.min(p.overrun, freeStart(edges[(s.i + 1) % N]) - 1.5));
    ivals.push([s.x0 - before, s.x0 + s.len + after]);
  });
  ivals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of ivals) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1] + p.pitch) last[1] = Math.max(last[1], iv[1]); else merged.push(iv.slice() as [number, number]); }
  const hs = hingeSegments(hBody, p.slit, p.bridge);
  // Unreachable while computeModel rejects hBody < 2*bridge + 6; kept as in the prototype.
  if (p.pattern === "serpentine" && hBody - 2 * p.bridge < 4) return { error: "The wall is too short for serpentine cuts with this bridge size." };
  const cols: HingeCol[] = [];
  for (const [a, b] of merged) cols.push(...makeCols(a, b, p));
  const zoneLen = merged.length ? Math.max(...merged.map(([a, b]) => b - a)) : 0;

  // pieces
  let cuts: [number, number][] = [[0, L]];
  if (p.split === 2) {
    const m = seamEdges[1];
    const s = segs.find(sg => sg.kind === "edge" && sg.i === m);
    if (!s) throw new Error("missing seam edge");
    const xs = s.x0 + edges[m].len / 2;
    cuts = [[0, xs], [xs, L]];
  }
  const parts: WallPart[] = [];
  const edgeMargin = slotLike(p) ? Math.max(0.4, p.slotW) : 0.4;
  cuts.forEach(([x0, x1], pi) => {
    const w = x1 - x0;
    const tabsHere = tabX.filter(tx => tx > x0 && tx < x1).map(tx => tx - x0).sort((m, n) => m - n);
    const myCols = cols.filter(c => c.x > x0 + edgeMargin && c.x < x1 - edgeMargin).map(c => ({ x: c.x - x0, kind: c.kind }));
    const wo = wallOutline(w, hBody, topTabs ? tabsHere : [], tabsHere, myCols, p, hs);
    const outline = wo.outline;
    // label on the longest straight
    let lab: number | null = null, best = 0;
    for (const s of segs) if (s.kind === "edge") { const sx0 = Math.max(s.x0, x0), sx1 = Math.min(s.x0 + s.to - s.from, x1); if (sx1 - sx0 > best) { best = sx1 - sx0; lab = (sx0 + sx1) / 2 - x0; } }
    parts.push({
      kind: "wall", name: cuts.length > 1 ? `WALL ${pi === 0 ? "A" : "B"}` : "WALL",
      outline, caps: wo.caps, cols: myCols, hBody, w,
      label: best > 18 && lab != null ? { x: lab, y: hBody / 2 } : null,
      bbox: bboxOf(outline),
    });
  });
  return { parts, cols, hs, L, zoneLen };
}

/** Bend test strip: one corner's hinge zone plus 15 mm of flat on each side. */
export function buildTestStrip(p: Params, zoneLen: number, hBody: number, hs: HingeSegments): WallPart {
  const flat = 15, tw = zoneLen + 2 * flat, th = hBody;
  const tcols = makeCols(flat, flat + zoneLen, p);
  const wo = wallOutline(tw, th, [], [], tcols, p, hs), outline = wo.outline;
  return { kind: "wall", name: "BEND TEST", outline, caps: wo.caps, cols: tcols, hBody: th, w: tw, label: { x: flat / 2, y: th / 2, vertical: true }, bbox: bboxOf(outline), test: true };
}
