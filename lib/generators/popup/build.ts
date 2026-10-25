/**
 * The Pop-up build. One flat sheet: the outline, ring (or spiral) cuts with small bridges that hold
 * the rings in place until they are snapped, and the holes (arm slots, cord holes, a lamp ring or a
 * tealight). Arms stand under it with a stepped top: each ring rests on its step and a tab through
 * the ring's slot keeps it there, so the form is exactly the profile curve. Cords (hanging shades)
 * or an angled scroll-saw cut hold it instead.
 *
 * Everything is polar round the centre. "κ" is the continuous ring index: 0 is the centre's edge,
 * n the outline; ring k is the band from κ = k to k + 1. The spiral crosses each ray at κ values one
 * apart, so a ray meets bands the same way for rings and for spirals.
 */
import { shapeContours, unionShapes } from "@/lib/letters/polygon";
import { arcSegments, bboxOf, circle, pointInContour, stadium, TAU } from "../geom";
import { tagMarks } from "../items";
import { motif, motifSize } from "../motifs";
import { orient } from "../shapes";
import { bendAround } from "../textPath";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { textBlock } from "../weld";
import { N_DIR, outlineOf, polarOf, rho, type Polar } from "./outline";
import { LAMP_HOLES, TEALIGHT_HOLE, type PopupParams } from "./params";
import { centreLow, heightFn, ringStops } from "./profile";

export interface PopupInfo {
  /** Rings (bands) between the centre and the rim. */
  n: number;
  /** Narrowest ring anywhere, mm, and the narrowest centre (or the sleeve hole's room). */
  minBand: number;
  centreR: number;
  /** Largest and mean drop from one ring to the next, mm. */
  maxDrop: number;
  meanDrop: number;
  /** Scroll saw: table tilt, degrees. */
  tilt: number;
  /** Arm steps too short for a tab. */
  noTab: number;
  /** The outline is seen more than once from its centre in some direction. */
  folded: boolean;
  /** Centre text and motif block width, and the room on the centre. */
  textW: number;
  textRoom: number;
  /** Rim text: its arc, radians (more than about 2.6 runs into itself). */
  rimSpan: number;
  /** Holes that do not fit where they go. */
  bad: string[];
  /** Open size: across and tall, mm. */
  across: number;
  tall: number;
  /** Tallest arm, mm. */
  armH: number;
}

export type PopupOutput = GenOutput & { info?: PopupInfo };

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const frac = (v: number) => v - Math.floor(v);

interface Band { r0: number; r1: number; z: number; centre: boolean; rim: boolean; key: string }

/** One size of the design: everything except the parts for the set of smaller sizes. */
interface Built {
  parts: GenPart[];
  info: PopupInfo;
  loading: boolean;
  missing: string[];
  /** Cord length between one ring's knot and the next, mm, centre out. */
  knots: number[];
}

/** A rectangle centred on (cx, cy) along direction a: `len` along it, `wid` across. */
function slotAt(cx: number, cy: number, a: number, len: number, wid: number): Contour {
  const c = Math.cos(a), s = Math.sin(a), l = len / 2, w = wid / 2;
  return [[cx - c * l + s * w, cy - s * l - c * w], [cx + c * l + s * w, cy + s * l - c * w], [cx + c * l - s * w, cy + s * l + c * w], [cx - c * l - s * w, cy - s * l + c * w]];
}

const polar = (r: number, a: number): Pt => [r * Math.cos(a), r * Math.sin(a)];

/** Row-major 3 × 4 matrix of a flat piece lifted to z (its frame is the sheet's), moved by dx. */
const flatAt = (z: number, dx = 0): number[] => [1, 0, 0, dx, 0, 1, 0, 0, 0, 0, 1, z];

/** An arm standing on the table along direction a (its x is the distance from the centre, y down), height scaled by k. */
function armAt(a: number, T: number, k: number, dx = 0): number[] {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, s * T / 2 + dx, s, 0, c, -c * T / 2, 0, -k, 0, 0];
}

function buildOne(p: PopupParams, ctx: BuildContext, suffix: string, dx: number): Built | { error: string } {
  const T = p.T, sup = p.support, ex = p.extras;
  const outline = outlineOf(p);
  if (!outline) return { error: "The custom outline could not be read. Paste SVG path data with one closed shape." };
  const P: Polar = polarOf(outline);
  if (!(P.min > 5)) return { error: "The outline is too small or does not surround its centre." };
  const n = p.cut.rings;
  const sleeve = p.mode === "sleeve";
  // A sleeve's centre is the hole round the object, which only rings leave whole.
  const spiral = p.cut.pattern === "spiral" && !sleeve;
  const m = spiral ? p.cut.starts : 1;
  const ribs = sup.kind === "ribs";
  const saw = sup.kind === "saw";
  const round = p.cut.style === "round";
  const low = centreLow(p);
  const turn = (sup.turn * Math.PI) / 180;
  const phiS = turn + (spiral ? Math.PI / Math.max(3, sup.arms) / 2 : 0);

  // The centre: a solid disc, or on a sleeve the hole round the object.
  const holeR = (ex.object + ex.clear) / 2;
  const cR = sleeve ? holeR : Math.max(4, p.cut.centre / 2);
  const s0 = Math.min(0.85, Math.max(0.03, cR / P.min));
  const span = (1 - s0) * (P.min + P.max) / 2;
  const stops = ringStops(p, n, span);
  const sigma = (k: number) => {
    const x = Math.min(n, Math.max(0, k)), i = Math.min(n - 1, Math.floor(x));
    return stops[i] + (stops[i + 1] - stops[i]) * (x - i);
  };
  const scale = (k: number) => s0 + (1 - s0) * sigma(k);
  const hForm = heightFn(p);
  // Heights at κ: rings take their outer edge's height; a spiral's strip its inner edge's (so it
  // leaves the centre at the centre's height), stretched so the rim still reaches the full depth.
  const kEnd = n - 1;
  const hAt = (k: number) => hForm(sigma(k));
  const hSpiral = (k: number) => hForm(sigma(Math.min(n, (k * n) / Math.max(1, kEnd))));
  const base = Math.max(0, sup.base);

  // Edge waves on every cut (not the outline, not a sleeve's hole).
  const amp = p.cut.edge === "plain" ? 0 : Math.max(0, p.cut.amp);
  const W = p.cut.waves;
  const wave = (a: number): number => {
    switch (p.cut.edge) {
      case "wave": return Math.sin(W * a);
      case "scallop": return 2 * Math.abs(Math.cos((W * a) / 2)) - 1;
      case "zigzag": { const u = frac((W * a) / TAU); return 1 - 4 * Math.abs(u - 0.5); }
      default: return 0;
    }
  };
  /** Radius at κ in direction a; `cut` adds the edge waves to cut lines. */
  const R = (k: number, a: number, cut = true): number => {
    if (k >= n - 1e-9) return rho(P, a);
    const r = round ? scale(k) * P.min : scale(k) * rho(P, a);
    return r + (cut && amp && !(sleeve && k < 1e-9 && !spiral) ? amp * wave(a) : 0);
  };

  // Arms start clear of each other round the centre.
  const arms = sup.arms;
  const armAngles = ribs ? Array.from({ length: arms }, (_, i) => turn + (TAU * i) / arms) : [];
  const rStart = ribs ? (T / 2 + sup.fit + 0.5) / Math.sin(Math.PI / arms) + 1 : 0;

  /** The bands a ray at angle a crosses, centre first. */
  const bandsAt = (a: number): Band[] => {
    const out: Band[] = [];
    const zOf = (h: number) => base + h;
    if (!spiral) {
      if (!sleeve) out.push({ r0: 0, r1: R(0, a), z: zOf(hAt(0)), centre: true, rim: false, key: "c" });
      for (let k = 0; k < n; k++) out.push({ r0: R(k, a), r1: R(k + 1, a), z: zOf(hAt(k + 1)), centre: false, rim: k === n - 1, key: `r${k}` });
      return out;
    }
    const c0 = frac((m * (a - phiS)) / TAU);
    const xs: number[] = [];
    for (let k = c0; k <= kEnd + 1e-9; k += 1) xs.push(k);
    out.push({ r0: 0, r1: R(xs[0], a), z: zOf(hSpiral(0)), centre: true, rim: false, key: "c" });
    for (let i = 0; i + 1 < xs.length; i++) out.push({ r0: R(xs[i], a), r1: R(xs[i + 1], a), z: zOf(hSpiral(xs[i])), centre: false, rim: false, key: `s${i}` });
    out.push({ r0: R(xs[xs.length - 1], a), r1: rho(P, a), z: zOf(hSpiral(xs[xs.length - 1])), centre: false, rim: true, key: "rim" });
    return out;
  };

  // ---------------------------------------------------------------- cut lines
  const bridgeAngles: number[] = [];
  if (sup.hold && !saw) {
    const k = Math.max(3, arms);
    const off = p.cut.petals ? Math.PI / k / 2 : Math.PI / k;
    for (let i = 0; i < k; i++) bridgeAngles.push(turn + off + (TAU * i) / k);
  }
  const holdW = Math.max(0.2, sup.holdW);
  /**
   * A cut line t0 … t1 drawn as runs between the bridges' gaps: `f` gives the point at parameter t,
   * `n` samples span the whole line, and each gap's ends are exact (a bridge is far narrower than
   * the spacing of the samples).
   */
  const runsOf = (f: (t: number) => Pt, t0: number, t1: number, n: number, gaps: [number, number][]): Contour[] => {
    const spans: [number, number][] = [];
    let s0 = t0;
    for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (g1 <= t0 || g0 >= t1) continue;
      if (g0 > s0) spans.push([s0, g0]);
      s0 = Math.max(s0, g1);
    }
    if (t1 > s0) spans.push([s0, t1]);
    const step = (t1 - t0) / Math.max(1, n);
    return spans.map(([a, b]) => {
      const out: Contour = [f(a)];
      for (let t = t0 + Math.ceil((a - t0) / step + 1e-9) * step; t < b - 1e-12; t += step) out.push(f(t));
      out.push(f(b));
      return out;
    }).filter((c) => c.length > 1);
  };

  const loops: Contour[] = [];
  const cuts: Contour[] = [];
  const holes: Contour[] = [];
  // Smooth outlines are drawn to the chord tolerance; outlines with corners at every sampled direction.
  const smoothOutline = p.shape.kind === "circle" || p.shape.kind === "ellipse";
  const smooth = round || smoothOutline;
  const perTurn = (r: number, s = smooth) => (s ? Math.max(96, arcSegments(r, TAU, 0.02)) : Math.min(N_DIR, Math.max(240, Math.ceil((TAU * r) / 0.6))));
  const samplesOn = (k: number) => {
    const rMax = (round && k < n ? scale(k) * P.min : scale(Math.min(k, n)) * P.max) + amp;
    return Math.min(2880, Math.max(perTurn(rMax, k < n ? smooth : smoothOutline), amp ? W * 24 : 0));
  };
  if (!spiral) {
    for (let k = 0; k < n; k++) {
      const N = samplesOn(k);
      const at = (a: number): Pt => polar(R(k, a), a);
      const loop = Array.from({ length: N }, (_, i) => at((TAU * i) / N));
      loops.push(loop);
      if (sleeve && k === 0) { holes.push(loop); continue; }
      if (!bridgeAngles.length) { cuts.push([...loop, loop[0]]); continue; }
      // Start just past the first bridge, so no gap straddles the start of the loop.
      const half = (b: number) => holdW / 2 / Math.max(1, R(k, b));
      const b0 = bridgeAngles[0], t0 = b0 + half(b0), t1 = b0 - half(b0) + TAU;
      const gaps = bridgeAngles.slice(1).map((b): [number, number] => { const c = t0 + ((((b - t0) % TAU) + TAU) % TAU); return [c - half(b), c + half(b)]; });
      cuts.push(...runsOf(at, t0, t1, N, gaps));
    }
  } else {
    for (let j = 0; j < m; j++) {
      const a0 = phiS + (TAU * j) / m;
      const turns = kEnd / m, rMax = (round ? scale(kEnd) * P.min : scale(kEnd) * P.max) + amp;
      const N = Math.min(24000, Math.max(Math.ceil(turns * perTurn(rMax)), amp ? Math.ceil(turns * W * 24) : 0));
      const angle = (k: number) => a0 + (TAU * k) / m;
      const at = (k: number): Pt => polar(R(k, angle(k)), angle(k));
      // Where the spiral crosses each bridge's direction, in κ.
      const gaps: [number, number][] = [];
      for (const b of bridgeAngles) {
        for (let k = (m * ((((b - a0) % TAU) + TAU) % TAU)) / TAU; k <= kEnd; k += m) {
          const d = (m * (holdW / 2 / Math.max(1, R(k, b)))) / TAU;
          gaps.push([k - d, k + d]);
        }
      }
      cuts.push(...runsOf(at, 0, kEnd, N, gaps));
    }
  }
  if (p.cut.petals) {
    // Radial cuts between the arms, through every ring to the outline, each with a bridge mid-ring.
    const k = Math.max(3, arms);
    for (let i = 0; i < k; i++) {
      const a = turn + Math.PI / k + (TAU * i) / k;
      const bands = bandsAt(a).filter((b) => !b.centre);
      for (const b of bands) {
        const mid = (b.r0 + b.r1) / 2, g = sup.hold ? holdW / 2 : 0;
        if (g > 0) { cuts.push([polar(b.r0, a), polar(mid - g, a)], [polar(mid + g, a), polar(b.r1 + (b.rim ? 0.5 : 0), a)]); }
        else cuts.push([polar(b.r0, a), polar(b.r1 + (b.rim ? 0.5 : 0), a)]);
      }
    }
  }

  // ---------------------------------------------------------------- holes
  const bad: string[] = [];
  const centreRoom = Math.min(...Array.from({ length: 72 }, (_, i) => bandsAt((TAU * i) / 72)[0]?.r1 ?? 0));
  const centreHole = (d: number, what: string) => {
    if (sleeve) return;
    if (d / 2 > centreRoom - 2) bad.push(what);
    holes.push(circle(0, 0, d / 2));
  };
  const lampD = ex.lamp === "none" ? 0 : ex.lamp === "custom" ? ex.lampD : LAMP_HOLES[ex.lamp];
  const cHoleD = sleeve ? 0 : lampD > 0 ? lampD : ex.tealight ? TEALIGHT_HOLE : ex.loop ? 4 : 0;
  if (lampD > 0) centreHole(lampD, "Lamp ring hole");
  else if (ex.tealight) centreHole(TEALIGHT_HOLE, "Tealight hole");
  else if (ex.loop) centreHole(4, "Hanging hole");

  // Arm slots and the handles' posts.
  const tabFit = Math.max(0, sup.fit);
  const handleArms = new Set<number>();
  if (ribs && sup.handles && low) { handleArms.add(0); handleArms.add(Math.round(arms / 2) % arms); }
  let noTab = 0;
  const tabs = new Map<string, { r: number; len: number }>();
  const handleW = (b: Band) => Math.max(6, Math.min(b.r1 - b.r0 - 4, 18));
  armAngles.forEach((a, i) => {
    for (const b of bandsAt(a)) {
      const lo = b.centre ? Math.max(rStart, cHoleD / 2 + 2) : b.r0, w = b.r1 - lo;
      const post = b.rim && handleArms.has(i);
      const len = post ? handleW(b) : Math.min(sup.tab, w - 2 * Math.min(2, w * 0.2));
      if (len < 2.5 || w < 4) { noTab++; continue; }
      const r = (lo + b.r1) / 2;
      tabs.set(`${i}:${b.key}`, { r, len });
      const [cx, cy] = polar(r, a);
      holes.push(slotAt(cx, cy, a, len + tabFit, T + tabFit));
    }
  });

  // Cord holes in every ring (hanging), knotted under each ring.
  const cordAngles = sup.kind === "cords" ? Array.from({ length: sup.cords }, (_, i) => turn + (TAU * i) / sup.cords) : [];
  const knots: number[] = [];
  cordAngles.forEach((a, ci) => {
    const bands = bandsAt(a);
    let prev: { r: number; z: number } | null = null;
    for (const b of bands) {
      if (b.centre && sleeve) continue;
      const r = b.centre ? Math.max(b.r1 * 0.6, Math.min(b.r1 - sup.cordHole, b.r1 * 0.75)) : (b.r0 + b.r1) / 2;
      if (b.r1 - (b.centre ? 0 : b.r0) < sup.cordHole + 2) { bad.push("Cord hole"); continue; }
      const [cx, cy] = polar(r, a);
      holes.push(circle(cx, cy, sup.cordHole / 2));
      if (ci === 0 && prev) knots.push(Math.hypot(r - prev.r, b.z - prev.z));
      prev = { r, z: b.z };
    }
  });

  // Scroll saw: a drill hole to start each cut.
  if (saw) {
    const starts = spiral ? Array.from({ length: m }, (_, j) => phiS + (TAU * j) / m) : Array.from({ length: n }, () => phiS);
    starts.forEach((a, j) => { const [cx, cy] = polar(R(spiral ? 0 : j, a), a); holes.push(circle(cx, cy, 0.9)); });
  }

  // A finial on top of a tower stands in a slot in the centre.
  const finial = ex.finial !== "none" && !low && !sleeve;
  const finW = Math.max(6, ex.finialSize * 0.22);
  if (finial) {
    if (finW / 2 + 2 > centreRoom || lampD > 0 || ex.tealight) bad.push("Finial slot");
    else holes.push(slotAt(0, 0, 0, finW + tabFit, T + tabFit));
  }

  // ---------------------------------------------------------------- engraving
  const missing: string[] = [];
  let loading = false;
  const engrave: Contour[] = [];
  const t = textBlock(ctx, p.engrave.text, p.engrave.fontId, p.engrave.size, { missing });
  if (t.loading) loading = true;
  let content: Contour[] = [...t.contours];
  const motifCs: Contour[] = [];
  if (p.engrave.motif !== "none") {
    const s = motifSize(p.engrave.motif, p.engrave.motifSize);
    const y = content.length ? -t.height / 2 - 3 - s.h / 2 : 0;
    motifCs.push(...motif(p.engrave.motif, p.engrave.motifSize, 0, y));
  }
  let textW = 0;
  if (content.length || motifCs.length) {
    const all = [...content, ...motifCs];
    const b = bboxOf(all);
    const oy = -(b.y0 + b.y1) / 2;
    content = content.map((c) => c.map(([x, y]) => [x, y + oy] as Pt));
    const mc = motifCs.map((c) => c.map(([x, y]) => [x, y + oy] as Pt));
    motifCs.length = 0; motifCs.push(...mc);
    textW = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  }
  const rimBands = bandsAt(Math.PI / 2).filter((b) => b.rim);
  const rimText: Contour[] = [];
  let rimSpan = 0;
  if (p.engrave.rim.trim()) {
    const rt = textBlock(ctx, p.engrave.rim, p.engrave.fontId, p.engrave.rimSize, { missing });
    if (rt.loading) loading = true;
    const rb = rimBands[0];
    if (rt.contours.length && rb) {
      const Rm = (rb.r0 + rb.r1) / 2;
      rimSpan = rt.width / Rm;
      rimText.push(...bendAround(rt.contours, Rm, "bottom"));
    }
  }
  engrave.push(...shapeContours(unionShapes([...content, ...motifCs])), ...shapeContours(unionShapes(rimText)));
  tagMarks({ engrave }, [{ item: "Text", cs: content }, { item: "Motif", cs: motifCs }, { item: "Rim text", cs: rimText }]);

  // ---------------------------------------------------------------- 3D pieces
  const allBands = Array.from({ length: 180 }, (_, i) => bandsAt((TAU * i) / 180));
  const zs = allBands.flatMap((bs) => bs.map((b) => b.z));
  const zFlat = Math.min(...zs), zTop = Math.max(...zs);
  type View = NonNullable<GenPart["views3d"]>[number];
  const views: View[] = [];
  const centreOf = (c: Contour): Pt => { let x = 0, y = 0; for (const q of c) { x += q[0]; y += q[1]; } return [x / c.length, y / c.length]; };
  // Small holes and engraving go with the piece their middle falls on (a sleeve's hole is a ring's inside).
  const small = holes.filter((h) => !(sleeve && h === loops[0]));
  // In 3D an outline needs far fewer points than its cut: within 0.2 mm, corners kept.
  const thin = (c: Contour): Contour => simplifyClosed(c, 0.2);
  const piece = (outer: Contour, inner: Contour[], z: number) => {
    const on = (c: Contour) => { const q = centreOf(c); return pointInContour(q, outer) && !inner.some((i) => pointInContour(q, i)); };
    views.push({ outer: thin(outer), holes: [...inner.map(thin), ...small.filter(on)], engrave: engrave.filter(on), place: { x: 0, y: 0, z, m: flatAt(z, dx) }, frames: [flatAt(zFlat, dx), flatAt(z, dx)] });
  };
  const sector = (inner: (a: number) => number, outer: (a: number) => number, a0: number, a1: number): Contour => {
    const steps = Math.max(3, Math.ceil(((a1 - a0) * outer((a0 + a1) / 2)) / 3));
    const out: Contour = [];
    for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; out.push(polar(inner(a), a)); }
    for (let i = steps; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / steps; out.push(polar(outer(a), a)); }
    return out;
  };
  const nOuter = smoothOutline ? perTurn(P.max, true) : N_DIR;
  const outerLoop = Array.from({ length: nOuter }, (_, i) => { const a = (TAU * i) / nOuter; return polar(rho(P, a), a); });
  if (!spiral && !p.cut.petals) {
    if (!sleeve) piece(loops[0], [], base + hAt(0));
    for (let k = 0; k < n; k++) piece(k + 1 < n ? loops[k + 1] : outerLoop, [loops[k]], base + hAt(k + 1));
  } else if (!spiral) {
    if (!sleeve) piece(loops[0], [], base + hAt(0));
    const k = Math.max(3, arms);
    for (let i = 0; i < k; i++) {
      const a0 = turn + Math.PI / k + (TAU * (i - 1)) / k, a1 = a0 + TAU / k;
      for (let r = 0; r < n; r++) piece(sector((a) => R(r, a), (a) => R(r + 1, a), a0, a1), [], base + hAt(r + 1));
    }
  } else {
    // The centre: inside the first turn of each spiral.
    const cl: Contour = [];
    for (let j = 0; j < m; j++) {
      const a0 = phiS + (TAU * j) / m, steps = 90;
      for (let i = 0; i <= steps; i++) { const f = i / steps, a = a0 + (TAU * f) / m; cl.push(polar(R(f, a), a)); }
    }
    piece(cl, [], base + hSpiral(0));
    const K = Math.max(6, Math.ceil(16 / m));
    for (let j = 0; j < m * K; j++) {
      const a0 = phiS + (TAU * j) / (m * K), a1 = a0 + TAU / (m * K), am = (a0 + a1) / 2;
      const cOf = (a: number) => (m * (a - phiS)) / TAU - Math.floor((m * (am - phiS)) / TAU);
      const cm = cOf(am);
      const Q = Math.floor(kEnd - cm + 1e-9) + 1;
      for (let q = 0; q + 1 < Q; q++) piece(sector((a) => R(cOf(a) + q, a), (a) => R(cOf(a) + q + 1, a), a0, a1), [], base + hSpiral(cm + q));
      piece(sector((a) => R(cOf(a) + Q - 1, a), (a) => rho(P, a), a0, a1), [], base + hSpiral(cm + Q - 1));
    }
  }

  // ---------------------------------------------------------------- arms
  const parts: GenPart[] = [];
  let armH = 0;
  armAngles.forEach((a, i) => {
    const bands = bandsAt(a);
    const rects: Contour[] = [];
    const rEnd = rho(P, a) - 1.5;
    for (const b of bands) {
      const lo = b.centre ? rStart : b.r0, hi = Math.min(b.r1, rEnd);
      if (hi - lo < 0.2) continue;
      rects.push([[lo, -b.z], [hi, -b.z], [hi, 0], [lo, 0]]);
      armH = Math.max(armH, b.z);
      const tb = tabs.get(`${i}:${b.key}`);
      if (!tb) continue;
      if (b.rim && handleArms.has(i)) {
        // A handle: a post through the rim's slot, then an ear with a finger hole.
        const ew = Math.min(70, Math.max(30, rEnd * 0.35)), hh = Math.max(20, sup.handleH);
        const top = -b.z - T, x0 = tb.r - tb.len / 2, x1 = tb.r + tb.len / 2;
        rects.push([[x0, top - 0.1], [x1, top - 0.1], [x1, -b.z + 0.1], [x0, -b.z + 0.1]]);
        rects.push([[Math.min(rEnd - ew, x0), top - hh], [Math.max(rEnd, x1), top - hh], [Math.max(rEnd, x1), top], [Math.min(rEnd - ew, x0), top]]);
        armH = Math.max(armH, b.z + T + hh);
      } else rects.push([[tb.r - tb.len / 2, -b.z - T], [tb.r + tb.len / 2, -b.z - T], [tb.r + tb.len / 2, -b.z + 0.1], [tb.r - tb.len / 2, -b.z + 0.1]]);
    }
    if (!rects.length) return;
    const u = unionShapes(rects.map(orient));
    if (!u.length) return;
    const shape = u.reduce((x, y) => (y.area > x.area ? y : x));
    const armHoles: Contour[] = [];
    if (handleArms.has(i)) {
      const rb = bands.find((b) => b.rim);
      if (rb) {
        const ew = Math.min(70, Math.max(30, rEnd * 0.35)), hh = Math.max(20, sup.handleH), top = -rb.z - T;
        const fy = top - hh * 0.55, fw = Math.min(ew - 12, 40);
        if (hh > 26 && fw > 14) armHoles.push(stadium(rEnd - ew / 2 - fw / 2 + 9, fy, rEnd - ew / 2 + fw / 2 - 9, fy, 18));
      }
    }
    const id = `arm${i + 1}${suffix ? "-" + suffix : ""}`;
    parts.push({
      id, name: `Arm ${i + 1}${suffix ? ` (${suffix})` : ""}`, outer: shape.outer, holes: [...shape.holes, ...armHoles],
      views3d: [{ outer: shape.outer, holes: [...shape.holes, ...armHoles], place: { x: 0, y: 0, z: 0, m: armAt(a, T, 1, dx) }, frames: [armAt(a, T, 0.02, dx), armAt(a, T, 1, dx)], apart: [Math.cos(a) * 30, Math.sin(a) * 30, -20] }],
    });
  });

  // Finial.
  if (finial && !bad.includes("Finial slot")) {
    const S = Math.max(20, ex.finialSize);
    let body: Contour;
    switch (ex.finial) {
      case "star": body = starOutline(S); break;
      case "ball": body = circle(0, -S / 2, S / 2); break;
      default: body = [[-S * 0.3, 0], [S * 0.3, 0], [0, -S]];
    }
    const tab: Contour = [[-finW / 2, -1], [finW / 2, -1], [finW / 2, T], [-finW / 2, T]];
    const u = unionShapes([orient(body), orient(tab)]);
    if (u.length) {
      const f = u.reduce((x, y) => (y.area > x.area ? y : x));
      const zc = base + hAt(0);
      const mOf = (z: number) => [1, 0, 0, dx, 0, 0, 1, -T / 2, 0, -1, 0, z];
      parts.push({ id: `finial${suffix ? "-" + suffix : ""}`, name: `Finial${suffix ? ` (${suffix})` : ""}`, outer: f.outer, holes: f.holes, views3d: [{ outer: f.outer, holes: f.holes, place: { x: 0, y: 0, z: 0, m: mOf(zc + T) }, frames: [mOf(zFlat + T), mOf(zc + T)], apart: [0, 0, 40] }] });
    }
  }

  const sheet: GenPart = {
    id: `sheet${suffix ? "-" + suffix : ""}`, name: `Pop-up sheet${suffix ? ` (${suffix})` : ""}`,
    outer: outerLoop.slice(), holes, cuts, engrave, views3d: views,
  };
  parts.unshift(sheet);

  // ---------------------------------------------------------------- numbers for the checks
  let minBand = Infinity, maxDrop = 0, dropSum = 0, dropN = 0;
  for (const bs of allBands) {
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.centre) minBand = Math.min(minBand, b.r1 - b.r0);
      if (i) { const d = Math.abs(b.z - bs[i - 1].z); maxDrop = Math.max(maxDrop, d); dropSum += d; dropN++; }
    }
  }
  const meanDrop = dropN ? dropSum / dropN : 0;
  const blade = Math.max(0.05, sup.blade);
  const tilt = meanDrop > 0 ? (Math.atan(blade / meanDrop) * 180) / Math.PI : 0;
  const ob = bboxOf([outline]);
  const across = Math.max(ob.x1 - ob.x0, ob.y1 - ob.y0);
  const tall = (ribs ? zTop : zTop - zFlat) + T + (finial ? ex.finialSize : 0);
  return {
    parts, loading, missing, knots,
    info: {
      n, minBand: Number.isFinite(minBand) ? minBand : 0, centreR: centreRoom, maxDrop, meanDrop, tilt, noTab, folded: P.folded,
      textW, textRoom: sleeve ? 0 : centreRoom * 2 - 8, rimSpan, bad, across, tall, armH: armH + T,
    },
  };
}

/** Douglas–Peucker on an open polyline: the points that keep it within `tol`. */
function simplifyOpen(c: Contour, tol: number): Contour {
  if (c.length < 3) return c.slice();
  const keep = new Uint8Array(c.length);
  keep[0] = keep[c.length - 1] = 1;
  const stack: [number, number][] = [[0, c.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [ax, ay] = c[i], [bx, by] = c[j], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    let far = -1, fd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((c[k][0] - ax) * dy - (c[k][1] - ay) * dx) / L;
      if (d > fd) { fd = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return c.filter((_, i) => keep[i]);
}

/** Douglas–Peucker on a closed outline, split at its two farthest-apart points. */
function simplifyClosed(c: Contour, tol: number): Contour {
  if (c.length < 8) return c;
  let j = 0, best = -1;
  for (let k = 1; k < c.length; k++) { const d = (c[k][0] - c[0][0]) ** 2 + (c[k][1] - c[0][1]) ** 2; if (d > best) { best = d; j = k; } }
  const a = simplifyOpen(c.slice(0, j + 1), tol), b = simplifyOpen([...c.slice(j), c[0]], tol);
  const out = [...a, ...b.slice(1, -1)];
  return out.length >= 3 ? out : c;
}

/** A five-pointed star standing on its lowest points, S tall, its base on y = 0. */
function starOutline(S: number): Contour {
  const R = S / 1.81, c: Contour = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 5, r = i % 2 ? R * 0.45 : R;
    c.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const yMax = Math.max(...c.map(([, y]) => y));
  return c.map(([x, y]) => [x, y - yMax] as Pt);
}

/** The design scaled by s (the set of smaller sizes). */
export function scalePopup(p: PopupParams, s: number): PopupParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    shape: { ...p.shape, size: k(p.shape.size), height: k(p.shape.height), corner: k(p.shape.corner) },
    cut: { ...p.cut, centre: k(p.cut.centre), amp: r1(Math.max(0.5, p.cut.amp * s)) },
    form: { ...p.form, depth: k(p.form.depth) },
    support: { ...p.support, base: Math.max(3, k(p.support.base)), handleH: k(p.support.handleH) },
    extras: { ...p.extras, finialSize: k(p.extras.finialSize), object: k(p.extras.object) },
    engrave: { ...p.engrave, size: Math.max(4, k(p.engrave.size)), rimSize: Math.max(3, k(p.engrave.rimSize)), motifSize: Math.max(8, k(p.engrave.motifSize)) },
  };
}

const SUPPORT_NAMES = { ribs: "slotted arms", cords: "cords", saw: "scroll-saw cut" } as const;

export function buildPopup(p: PopupParams, ctx: BuildContext): PopupOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const first = buildOne(p, ctx, "", 0);
  if ("error" in first) return { parts: [], stats: [], error: first.error };
  const parts = [...first.parts];
  const missing = [...first.missing];
  let loading = first.loading;
  // The set: each smaller size beside the last in 3D, its parts named by size.
  let s = 1, x = first.info.across / 2;
  for (let i = 1; i < p.extras.sizes; i++) {
    s *= Math.min(0.95, Math.max(0.4, p.extras.step / 100));
    const q = scalePopup(p, s);
    const w = q.shape.size;
    const b = buildOne(q, ctx, `size ${i + 1}`, x + 30 + w / 2);
    x += 30 + w;
    if ("error" in b) continue;
    parts.push(...b.parts);
    loading ||= b.loading;
    for (const c of b.missing) if (!missing.includes(c)) missing.push(c);
  }
  const info = first.info;
  const sup = p.support;
  const arms = parts.filter((pt) => /^arm/.test(pt.id)).length;
  const stats = [
    { label: "Flat sheet", value: `${r0(bboxOf([parts[0].outer]).x1 - bboxOf([parts[0].outer]).x0)} × ${r0(bboxOf([parts[0].outer]).y1 - bboxOf([parts[0].outer]).y0)} mm` },
    { label: "Open", value: `${r0(info.across)} mm across, ${r0(info.tall)} mm tall` },
    { label: p.cut.pattern === "spiral" ? "Spiral" : "Rings", value: p.cut.pattern === "spiral" ? `${info.n - 1} turns${p.cut.starts > 1 ? `, ${p.cut.starts} arms` : ""}` : `${info.n}, narrowest ${r1(info.minBand)} mm` },
    { label: "Held by", value: sup.kind === "ribs" ? `${sup.arms} slotted arms, ${r0(info.armH)} mm tall` : SUPPORT_NAMES[sup.kind] },
    ...(sup.kind === "saw" ? [{ label: "Saw table tilt", value: `${r1(info.tilt)}° (${r1(info.meanDrop)} mm drop per ring)` }] : []),
    ...(sup.kind === "cords" ? [{ label: "Knot spacing", value: knotText(first.knots) }] : []),
    ...(p.extras.sizes > 1 ? [{ label: "Set", value: `${p.extras.sizes} sizes` }] : []),
  ];
  const assembly = [
    ...(sup.kind !== "saw" && sup.hold ? ["Cut the sheet, then snap the small bridges between the rings with a craft knife; the sheet stays flat for storing and posting."] : []),
    ...(sup.kind === "ribs" ? [
      `Stand the ${arms === 1 ? "arm" : `${arms} arms`} on the table, each along its own line out from the centre.`,
      "Lift the rings one at a time from the centre out and drop each ring's slots over its arms' tabs; every ring rests on its own step.",
      ...(sup.handles && p.mode !== "tower" ? ["The two handle arms' posts go up through the rim; lift the bowl by the ears."] : []),
      "A dot of glue on each tab makes it permanent; leave it dry to fold the form flat again.",
    ] : []),
    ...(sup.kind === "cords" ? [
      `Thread ${sup.cords} cords from the centre out, one through each line of holes, and tie a knot under each ring at the spacing shown.`,
      "Hang it from the centre and let the rings drop until the knots hold them.",
    ] : []),
    ...(sup.kind === "saw" ? [
      `Glue the printed pattern onto the board, drill the start holes and tilt the scroll saw's table ${r1(info.tilt)}°.`,
      "Cut with the centre always on the same side of the blade (the table tilted the same way) so every ring wedges on the next.",
      "Push the rings down or up into shape and glue them where they touch.",
    ] : []),
    ...(p.extras.finial !== "none" && p.mode === "tower" ? ["Push the finial's tab into the slot at the top."] : []),
    ...(p.extras.lamp !== "none" ? ["Clamp the lamp holder's ring through the centre hole. Use an LED bulb only."] : []),
  ];
  return {
    parts, stats, assembly,
    fold: { label: "Open", title: "Open the form: 0 % is the flat sheet, 100 % fully open" },
    notice: loading ? "Loading the font." : undefined,
    missing: missing.length ? missing : undefined,
    info,
  };
}

function knotText(list: number[]): string {
  if (!list.length) return "none";
  const lo = Math.min(...list), hi = Math.max(...list);
  return Math.abs(hi - lo) < 1 ? `${r0(lo)} mm` : `${r0(lo)} to ${r0(hi)} mm`;
}
