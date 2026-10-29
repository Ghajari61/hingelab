/**
 * The dollhouse and building generator.
 *
 * Construction (see kit.ts for the tabbed frame and the axes):
 * - Two side walls are the frame's end panels. They stand on a base that overhangs them by the
 *   plinth, with tabs down through it, and carry the roof profile on top.
 * - The floors and the top plate are flat members tabbed through the side walls and, along their
 *   back edge, into the back wall. Partitions stand between two floors, tabbed into both.
 * - The back wall (and the facade panel when the front is closed) is an upright member tabbed
 *   through the side walls. It sits a few millimetres in from their back edge so its slots have wood
 *   behind them.
 * - Gable, shed and gambrel roofs rest on the side walls' sloped top edges, which pass tabs into
 *   them. Hip and mansard roofs are panels glued on the top plate.
 * - Stairs are their own little frame: two sawtooth stringers with treads tabbed between them,
 *   standing in the first room and rising toward the back wall under a stairwell in the floor above.
 *
 * Every size is the finished part's size; kerf is the export's business, joint fit is build.ts's.
 */
import { boxPanels } from "../boxes/joints";
import { deg, rect, stadium } from "../geom";
import type { Contour, GenOutput, GenPart, Pt } from "../types";
import {
  clamp, clipScore, openingHoles, openingShape, outerOf, planar, r1, roofFinish, tabSpans, tabbedFrame, trimLine, wallFinish,
  type Divider, type FlatMember, type UprightMember, type V3,
} from "./kit";
import type { MiniatureParams } from "./params";
import { ROOF_NAMES } from "./params";
import { traditionOf } from "./traditions";

export interface HouseInfo {
  size: [number, number, number];
  roomW: number;
  stairs: "none" | "built" | "too-narrow" | "too-shallow";
  windowFit: boolean;
  tower: "none" | "built" | "needs-flat";
  parts: number;
}
export type MiniOutput = GenOutput & { info?: HouseInfo & Record<string, unknown> };

/** Width of the wood left round an opening and between bars, mm. */
const BAR = 1.6;

export function buildHouse(p: MiniatureParams): MiniOutput {
  const T = p.T, h = p.house, trad = traditionOf(p.tradition);
  const W = Math.max(60, h.width), D = Math.max(60, h.depth), N = clamp(Math.round(h.floors), 1, 6), fh = Math.max(30, h.floorH);
  const Wc = W - 2 * T;
  const mb = Math.max(4, T + 1), mf = Math.max(4, T + 1);
  const closed = h.front === "panel";
  const yi0 = mb + T, yi1 = closed ? D - mf - T : D;
  const zFloor = (k: number) => k * (fh + T);
  const He = zFloor(N) + T; // top of the top plate: the eaves
  const pitch = deg(clamp(h.pitch, 5, 70)), ov = Math.max(0, h.overhang);
  const par = h.roof === "flat" ? Math.max(0, h.parapet) : 0;

  // ---- side wall profile (y up, y from the back edge 0 to the front D) and the roof line on it
  const segments: [Pt, Pt][] = []; // sloped top edges, each from its low end to its high end
  let top: Pt[];
  switch (h.roof) {
    case "gable": { const r = (D / 2) * Math.tan(pitch); top = [[D, He], [D / 2, He + r], [0, He]]; segments.push([[0, He], [D / 2, He + r]], [[D, He], [D / 2, He + r]]); break; }
    case "shed": { const r = D * Math.tan(pitch) * 0.5; top = [[D, He], [0, He + r]]; segments.push([[D, He], [0, He + r]]); break; }
    case "gambrel": {
      const a = D * 0.2, h1 = a * Math.tan(deg(68)), h2 = (D / 2 - a) * Math.tan(pitch);
      top = [[D, He], [D - a, He + h1], [D / 2, He + h1 + h2], [a, He + h1], [0, He]];
      segments.push([[0, He], [a, He + h1]], [[a, He + h1], [D / 2, He + h1 + h2]], [[D, He], [D - a, He + h1]], [[D - a, He + h1], [D / 2, He + h1 + h2]]);
      break;
    }
    case "flat": top = [[D, He + par], [0, He + par]]; break;
    default: top = [[D, He], [0, He]];
  }
  // Tabs on the sloped edges, up into the roof panels.
  const roofTabs: { seg: number; s0: number; s1: number; poly: Contour }[] = [];
  segments.forEach(([A, B], i) => {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), d: Pt = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    let n: Pt = [-d[1], d[0]];
    if (n[1] < 0) n = [-n[0], -n[1]];
    for (const [s0, s1] of tabSpans(6, L - 6, T)) {
      const P = (s: number): Pt => [A[0] + d[0] * s, A[1] + d[1] * s];
      const a = P(s0), b = P(s1);
      roofTabs.push({ seg: i, s0, s1, poly: [a, b, [b[0] + n[0] * T, b[1] + n[1] * T], [a[0] + n[0] * T, a[1] + n[1] * T]] });
    }
  });
  const profile = outerOf([[[0, 0], [D, 0], ...top], ...roofTabs.map((t) => t.poly)]);

  // ---- openings
  const ww = clamp(h.winW, 8, 200), wh = clamp(h.winH, 8, fh - 10);
  const windowFit = h.winH <= fh - 10;
  const sill = (k: number) => zFloor(k) + T + Math.max(4, (fh - wh) * 0.55);
  const evenly = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);
  const lattice = h.lattice;
  const cut = (shape: Contour) => openingHoles(shape, h.panes, BAR, lattice);
  /** Holes, frames and shutters for openings at (centre, sill) positions, y up. */
  function openings(at: [number, number][], w: number, hh: number, shape = h.opening, panes = true) {
    const holes: Contour[] = [], marks: Contour[] = [];
    for (const [cx, z0] of at) {
      const s = openingShape(shape, cx, z0, w, hh);
      holes.push(...(panes ? cut(s) : [s]));
      if (h.trim) marks.push(trimLine(s, 1.5));
      if (h.shutters && shape !== "round") for (const side of [-1, 1]) {
        const sx = side < 0 ? cx - w / 2 - 2 - w * 0.42 : cx + w / 2 + 2, sh = rect(sx, z0, w * 0.42, hh * 0.9);
        marks.push([...sh, sh[0]]);
      }
    }
    return { holes, marks };
  }
  const floors = Array.from({ length: N }, (_, k) => k);
  const sideAt: [number, number][] = floors.flatMap((k) => evenly(yi0 + 6, yi1 - 6, clamp(Math.round(h.sideWindows), 0, 4)).map((y) => [y, sill(k)] as [number, number]));
  const sideOpen = openings(sideAt, Math.min(ww, (yi1 - yi0) / Math.max(1, h.sideWindows) - 8), wh);

  // ---- floors, top plate, stairs
  const rooms = clamp(Math.round(h.rooms), 1, 5);
  const roomW = (Wc - (rooms - 1) * T) / rooms;
  const flats: FlatMember[] = floors.map((k) => ({ id: k ? `floor${k}` : "ground", name: k ? `Floor ${k + 1}` : "Ground floor", y0: yi0, y1: yi1, z: zFloor(k), holes: [] }));
  flats.push({ id: "ceiling", name: N > 1 || h.roof !== "flat" ? "Top floor ceiling" : "Ceiling", y0: yi0, y1: yi1, z: zFloor(N), holes: [] });

  let stairs: HouseInfo["stairs"] = "none";
  const stairParts: GenPart[] = [];
  if (h.stairs && N > 1) {
    const sw = clamp(roomW - 2 * T - 6, 0, 34), rise = fh, steps = clamp(Math.round(rise / 11), 4, 18), sh = rise / steps, g = Math.max(3 * T + 1, Math.min(14, sh * 1.1)), L = steps * g;
    if (sw < 14) stairs = "too-narrow";
    else if (L > yi1 - yi0 - 8) stairs = "too-shallow";
    else {
      stairs = "built";
      const xs = T + 2, c = 1.2;
      // sawtooth stringer: rises from the front (y = L) to the back wall (y = 0)
      const saw: Pt[] = [[0, 0], [L, 0]];
      for (let i = 1; i <= steps; i++) saw.push([L - (i - 1) * g, i * sh], [L - i * g, i * sh]);
      for (let k = 0; k + 1 < N; k++) {
        const treads: FlatMember[] = Array.from({ length: steps - 1 }, (_, j) => ({ id: `t${j + 1}`, name: `Tread ${j + 1} (floor ${k + 1})`, y0: L - (j + 1) * g + 0.5, y1: L - j * g - 0.5, z: (j + 1) * sh - T - c }));
        stairParts.push(...tabbedFrame({ T, W: sw, at: [xs, yi0, zFloor(k) + T], profile: saw, ends: [`Stringer (floor ${k + 1}, left)`, `Stringer (floor ${k + 1}, right)`], idPrefix: `stair${k + 1}-`, flats: treads }));
        // the stairwell over the stair's upper half
        flats[k + 1].holes!.push(rect(xs, yi0 + 3, sw + 2 * T, L * 0.7));
      }
    }
  }

  // ---- partitions with doorways
  const dividers: Divider[] = [];
  for (let k = 0; k < N; k++) for (let i = 1; i < rooms; i++) {
    const x = T + i * roomW + (i - 1) * T;
    const outline: Contour = rect(yi0, zFloor(k) + T, yi1 - yi0, fh);
    const holes: Contour[] = [];
    if (h.doorways) {
      const dw = clamp(h.doorW * 0.8, 14, (yi1 - yi0) * 0.4), dh = clamp(h.doorH, 20, fh - 8);
      holes.push(openingShape(h.opening === "round" ? "arch" : h.opening, yi0 + (yi1 - yi0) * 0.62, zFloor(k) + T, dw, dh));
    }
    dividers.push({ id: `part${k + 1}-${i}`, name: `Partition ${i} (floor ${k + 1})`, x, outline, z0: zFloor(k) + T, z1: zFloor(k + 1), holes, up: k === N - 1 });
  }

  // ---- back wall and facade
  const backTop = h.roof === "flat" ? He + par : h.roof === "shed" ? He + (D * Math.tan(pitch) * 0.5) * (1 - (mb + T) / D) : He;
  const backAt: [number, number][] = floors.flatMap((k) => evenly(T + 6, T + Wc - 6, clamp(Math.round(h.backWindows), 0, 6)).map((x) => [x, sill(k)] as [number, number]));
  const backOpen = openings(backAt, Math.min(ww, Wc / Math.max(1, h.backWindows) - 8), wh);
  const toMember = (c: Contour, z1: number): Contour => c.map(([x, z]) => [x, z1 - z] as Pt);
  const finishLines = (x0: number, x1: number, z0: number, z1: number) => wallFinish(h.wall, x0, x1, z0, z1, floors.map((k) => zFloor(k) + T / 2));
  const uprights: UprightMember[] = [];
  {
    const outer = rect(T, 0, Wc, backTop), holes = backOpen.holes;
    const lines = clipScore([...finishLines(T, T + Wc, 0, backTop), ...backOpen.marks], outer, holes);
    uprights.push({ id: "back", name: "Back wall", y: mb, z0: 0, z1: backTop, holes: holes.map((c) => toMember(c, backTop)), score: lines.map((c) => toMember(c, backTop)) });
  }
  if (closed) {
    const ftop = h.roof === "flat" ? He + par : He;
    const n = clamp(Math.round(h.frontWindows), 0, 6);
    const at: [number, number][] = floors.flatMap((k) => evenly(T + 6, T + Wc - 6, n).map((x) => [x, sill(k)] as [number, number])).filter(([x, z]) => !(z < zFloor(1) && Math.abs(x - (T + Wc / 2)) < Math.max(ww, h.doorW) * 0.9));
    const win = openings(at, Math.min(ww, Wc / Math.max(1, n) - 8), wh);
    const door = openings([[T + Wc / 2, T]], clamp(h.doorW, 14, Wc * 0.4), clamp(h.doorH, 20, fh - 4), h.opening === "round" ? "arch" : h.opening, false);
    const holes = [...win.holes, ...door.holes], outer = rect(T, 0, Wc, ftop);
    const lines = clipScore([...finishLines(T, T + Wc, 0, ftop), ...win.marks, ...door.marks], outer, holes);
    uprights.push({ id: "facade", name: "Facade", y: D - mf - T, z0: 0, z1: ftop, holes: holes.map((c) => toMember(c, ftop)), score: lines.map((c) => toMember(c, ftop)) });
  }

  // ---- the frame
  const P = Math.max(0, h.plinth);
  const sideLines = clipScore([...finishLines(0, D, 0, Math.max(...top.map((q) => q[1]))), ...sideOpen.marks], profile, sideOpen.holes);
  const parts = tabbedFrame({
    T, W: Wc, profile, endHoles: sideOpen.holes, endScore: sideLines, ends: ["Left wall", "Right wall"],
    flats, uprights, dividers,
    caps: [{ id: "base", name: "Base", at: "bottom", z: 0, x0: -P, x1: W + P, y0: -P, y1: D + P }],
  });
  // Floors also tab into the back wall along their back edge.
  const back = parts.find((q) => q.id === "back")!;
  for (const m of flats) {
    const part = parts.find((q) => q.id === m.id)!;
    const spans = tabSpans(T, T + Wc, T);
    part.outer = outerOf([part.outer, ...spans.map(([s, e]) => rect(s, mb, e - s, T + 0.01))]);
    for (const [s, e] of spans) back.holes.push(rect(s, backTop - (m.z + T), e - s, T));
  }
  parts.push(...stairParts);

  // ---- roof
  const roof: GenPart[] = [];
  const cx = W / 2, cy = D / 2;
  const outward = (pts: V3[]): V3 => { const c = pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length, a[2] + q[2] / pts.length] as V3, [0, 0, 0] as V3); return [c[0] - cx, c[1] - cy, Math.max(1, c[2] - He) * 2]; };
  const roofPanel = (id: string, name: string, pts: V3[], slots: V3[][] = []) => {
    const pl = planar(pts, outward(pts));
    const holes = slots.map((s) => s.map(pl.uv));
    const outer = outerOf([pl.outline]);
    const us = outer.map((q) => q[0]), vs = outer.map((q) => q[1]);
    const lines = clipScore(roofFinish(h.roofFinish, Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)), outer, holes);
    roof.push({ id, name, outer, holes, ...(lines.length ? { score: lines } : {}), place: { x: 0, y: 0, z: 0, m: pl.m } });
  };
  if (segments.length) {
    // Each sloped edge carries a panel from x = -ov to W + ov, its low end reaching ov past the eave
    // (or the knuckle below), and the panel above a ridge or knuckle overlapping the one below by
    // the material's thickness over the joint.
    segments.forEach(([A, B], i) => {
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), d: Pt = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
      const atEave = Math.abs(A[1] - He) < 1e-6;
      const lo: Pt = atEave ? [A[0] - d[0] * ov, A[1] - d[1] * ov] : A;
      // past the ridge (both halves of a gable): the second panel covers the first's end
      const isRidge = segments.some(([, B2], j) => j !== i && Math.abs(B2[0] - B[0]) < 1e-6 && Math.abs(B2[1] - B[1]) < 1e-6);
      const first = segments.findIndex(([, B2]) => Math.abs(B2[0] - B[0]) < 1e-6 && Math.abs(B2[1] - B[1]) < 1e-6);
      const knuckle = segments.some(([A2]) => Math.abs(A2[0] - B[0]) < 1e-6 && Math.abs(A2[1] - B[1]) < 1e-6);
      // a free high end (a shed roof's back) overhangs as the eaves do
      let hi: Pt = !isRidge && !knuckle ? [B[0] + d[0] * ov, B[1] + d[1] * ov] : B;
      if (isRidge && first !== i) {
        const [A2, B2] = segments[first];
        const L2 = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]), d2: Pt = [(B2[0] - A2[0]) / L2, (B2[1] - A2[1]) / L2];
        const s = Math.abs(d[0] * d2[1] - d[1] * d2[0]);
        const e = clamp(T / Math.max(0.2, s), 0, 4 * T);
        hi = [B[0] + d[0] * e, B[1] + d[1] * e];
      } else if (isRidge) {
        // the covered panel stops where its outer face meets the other panel's inner face, which on
        // a pitch under 45 degrees is short of the ridge line
        const j = segments.findIndex(([, B2], k) => k !== i && Math.abs(B2[0] - B[0]) < 1e-6 && Math.abs(B2[1] - B[1]) < 1e-6);
        const [A2, B2] = segments[j];
        const L2 = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]), d2: Pt = [(B2[0] - A2[0]) / L2, (B2[1] - A2[1]) / L2];
        // the upward (outward) normal of a slope in the (y, z) profile
        const up = (q: Pt): Pt => (q[0] >= 0 ? [-q[1], q[0]] : [q[1], -q[0]]);
        const n1 = up(d), n2 = up(d2);
        const dn = d[0] * n2[0] + d[1] * n2[1];
        const c = dn > 1e-6 ? Math.max(0, (T * (n1[0] * n2[0] + n1[1] * n2[1])) / dn) : 0;
        hi = [B[0] - d[0] * c, B[1] - d[1] * c];
      }
      const pts: V3[] = [[-ov, lo[0], lo[1]], [W + ov, lo[0], lo[1]], [W + ov, hi[0], hi[1]], [-ov, hi[0], hi[1]]];
      const slots = roofTabs.filter((t) => t.seg === i).flatMap((t) => {
        const a: Pt = [A[0] + d[0] * t.s0, A[1] + d[1] * t.s0], b: Pt = [A[0] + d[0] * t.s1, A[1] + d[1] * t.s1];
        return [0, W - T].map((x): V3[] => [[x, a[0], a[1]], [x + T, a[0], a[1]], [x + T, b[0], b[1]], [x, b[0], b[1]]]);
      });
      const face = Math.abs(lo[0] - D) < Math.abs(lo[0]) ? "front" : "back";
      const tier = h.roof === "gambrel" ? (i % 2 ? " upper" : " lower") : "";
      roofPanel(`roof-${face}${tier.trim() ? "-" + tier.trim() : ""}`, `Roof (${face}${tier})`, pts, slots);
    });
  } else if (h.roof === "hip" || h.roof === "mansard") {
    const x0 = -ov, x1 = W + ov, y0 = -ov, y1 = D + ov, z = He;
    const steep = h.roof === "mansard" ? deg(72) : pitch;
    const half = Math.min(x1 - x0, y1 - y0) / 2;
    const rise = h.roof === "mansard" ? Math.min(fh * 0.75, half * Math.tan(steep) * 0.85) : half * Math.tan(steep);
    const inset = rise / Math.tan(steep);
    const ix0 = x0 + inset, ix1 = x1 - inset, iy0 = y0 + inset, iy1 = y1 - inset, zt = z + rise;
    // a hip roof's ridge (zero width one way); a mansard's flat top
    const q: V3[] = [[x0, y1, z], [x1, y1, z], [x1, y0, z], [x0, y0, z]];
    const r: V3[] = [[ix0, iy1, zt], [ix1, iy1, zt], [ix1, iy0, zt], [ix0, iy0, zt]];
    const degenerate = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
    const names = ["front", "right", "back", "left"];
    for (let i = 0; i < 4; i++) {
      const pts: V3[] = [q[i], q[(i + 1) % 4], r[(i + 1) % 4], r[i]];
      roofPanel(`roof-${names[i]}`, `Roof (${names[i]})`, degenerate(pts[2], pts[3]) ? [pts[0], pts[1], pts[2]] : pts);
    }
    if (h.roof === "mansard" && ix1 - ix0 > 4 && iy1 - iy0 > 4) roof.push({ id: "roof-top", name: "Roof (top)", outer: rect(ix0, iy0, ix1 - ix0, iy1 - iy0), holes: [], place: { x: 0, y: 0, z: zt } });
  }

  // ---- windcatcher tower on a flat roof
  let tower: HouseInfo["tower"] = "none";
  if (h.tower) {
    if (h.roof !== "flat") tower = "needs-flat";
    else {
      tower = "built";
      const tw = clamp(Wc * 0.22, 30, 60), th = clamp(fh * 0.9, 50, 140), f = tw / 5;
      const k = boxPanels(tw, tw, th, T, f, true);
      const ox = T + 6, oy = yi0 + 6, oz = He;
      const slits = (w: number): Contour[] => [0.3, 0.5, 0.7].map((t) => stadium(w * t, th * 0.18, w * t, th * 0.42, Math.min(5, w * 0.1)));
      roof.push(
        { id: "tower-front", name: "Windcatcher (front)", outer: k.face, holes: slits(tw), place: { x: ox, y: -(oz + th), z: oy + tw - T, upright: true } },
        { id: "tower-back", name: "Windcatcher (back)", outer: k.face, holes: slits(tw), place: { x: ox, y: -(oz + th), z: oy, upright: true } },
        { id: "tower-left", name: "Windcatcher (left)", outer: k.side, holes: slits(tw), place: { x: ox + T, y: -(oz + th), z: oy, upright: true, yaw: 90 } },
        { id: "tower-right", name: "Windcatcher (right)", outer: k.side, holes: slits(tw), place: { x: ox + tw, y: -(oz + th), z: oy, upright: true, yaw: 90 } },
        { id: "tower-floor", name: "Windcatcher (floor)", outer: k.bottom, holes: [], place: { x: ox, y: oy, z: oz } },
        { id: "tower-cap", name: "Windcatcher (cap)", outer: k.top!, holes: [], place: { x: ox, y: oy, z: oz + th - T } },
      );
    }
  }
  parts.push(...roof);

  const Htot = Math.max(...profile.map((q) => q[1]), ...roof.flatMap((pt) => (pt.place?.m ? pt.outer.map(([u, v]) => pt.place!.m![8] * u + pt.place!.m![9] * v + pt.place!.m![11]) : [pt.place?.z ?? 0]))) + T;
  return {
    parts,
    stats: [
      { label: "Footprint", value: `${r1(W)} × ${r1(D)} mm on a ${r1(W + 2 * P)} × ${r1(D + 2 * P)} mm base` },
      { label: "Height", value: `${r1(Htot)} mm, ${N} ${N === 1 ? "floor" : "floors"} of ${r1(fh)} mm` },
      { label: "Rooms", value: `${rooms} per floor, ${r1(roomW)} mm wide` },
      { label: "Roof", value: `${ROOF_NAMES[h.roof]}${segments.length || h.roof === "hip" || h.roof === "mansard" ? `, ${r1(h.roof === "mansard" ? 72 : clamp(h.pitch, 5, 70))}°` : ""}` },
      { label: "Style", value: `${trad.name}${trad.fictional ? " (fictional)" : ""}` },
    ],
    assembly: [
      "Push the side walls' bottom tabs into the base, then slide the floors, the top plate and the back wall in between them; every tab has one slot.",
      ...(dividers.length ? ["Stand the partitions in their slots as each floor goes in; they lock the floor above."] : []),
      ...(stairs === "built" ? ["Build each stair: push the treads into one stringer, press the other on, and stand it in the first room against the back wall under the stairwell."] : []),
      ...(closed ? ["The facade goes in with the back wall, before the top plate."] : ["The front stays open for play; dry-fit before gluing."]),
      ...(segments.length ? ["Lay the roof panels on the side walls' tabs; the panel over the ridge covers the other's edge. Glue along the tabs."] : h.roof === "hip" || h.roof === "mansard" ? ["Glue the roof panels on the top plate, edge to edge; sand the hips flush."] : []),
      ...(tower === "built" ? ["Glue the windcatcher's finger joints and stand it on the roof at the back."] : []),
      "Wood glue in every slot makes it permanent; engrave and score before cutting so nothing moves between jobs.",
    ],
    info: { size: [W + 2 * P, D + 2 * P, Htot], roomW, stairs, windowFit, tower, parts: parts.length },
  };
}
