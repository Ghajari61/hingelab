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
import { circle, deg, pointInContour, rect, stadium } from "../geom";
import type { Contour, GenOutput, GenPart, Pt } from "../types";
import {
  clamp, clipScore, crossPair, crossProfile, grow, hull, move, openingHoles, openingShape, outerOf, planar, r1, roofFinish, screenPanel, tabSpans, tabbedFrame, trimLine, wallFinish, yUp,
  type CrossKind, type Divider, type FenceStyle, type FlatMember, type OpeningShape, type UprightMember, type V3,
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
  /** Front features asked for: built, or left out because the front is open. */
  front: "none" | "built" | "needs-facade";
  porch: "none" | "canopy" | "veranda";
  /** The door was made shorter to fit under the porch canopy. */
  doorCut: boolean;
  chimney: "none" | "built" | "no-room";
  trees: number; lamps: number;
}
export type MiniOutput = GenOutput & { info?: HouseInfo & Record<string, unknown> };
/** The house-only fields of the info, for the other designs. */
export const NOT_A_HOUSE = { roomW: 0, stairs: "none", windowFit: true, tower: "none", front: "none", porch: "none", doorCut: false, chimney: "none", trees: 0, lamps: 0 } as const;

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
  function openings(at: [number, number][], w: number, hh: number, shape = h.opening, panes = true, shutters = panes) {
    const holes: Contour[] = [], marks: Contour[] = [];
    for (const [cx, z0] of at) {
      const s = openingShape(shape, cx, z0, w, hh);
      holes.push(...(panes ? cut(s) : [s]));
      if (h.trim) marks.push(trimLine(s, 1.5));
      if (shutters && h.shutters && shape !== "round") for (const side of [-1, 1]) {
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

  // ---- the front: windows, the door, a shopfront, balconies and a porch (on a closed facade)
  const P = Math.max(0, h.plinth);
  const extra: GenPart[] = [];
  const facadeSlots: Contour[] = []; // y up in the facade's (x, z) plane
  const baseHoles: Contour[] = [], baseScore: Contour[] = [];
  /** Plan boxes on the base that something already stands on: [x0, y0, x1, y1]. */
  const occupied: [number, number, number, number][] = [[-0.5, -0.5, W + 0.5, D + 0.5]];
  const hits = (b: [number, number, number, number]) => occupied.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const yF = D - mf, cxD = T + Wc / 2;
  const dShape: OpeningShape = h.opening === "round" ? "arch" : h.opening;
  const dW = clamp(h.doorW, 14, Wc * 0.4);
  let dH = clamp(h.doorH, 20, fh - 4);
  const frontWanted = h.door !== "open" || h.shopfront || h.balcony !== "none" || h.porch !== "none";
  const front: HouseInfo["front"] = !frontWanted ? "none" : closed ? "built" : "needs-facade";
  const ftop = h.roof === "flat" ? He + par : He;

  // windows on the facade, the shopfront's display windows and the balcony doors
  const nf = clamp(Math.round(h.frontWindows), 0, 6);
  const fw = Math.min(ww, Wc / Math.max(1, nf) - 8);
  const g6 = 6, shopW = (Wc - dW - 4 * g6) / 2, shopH = clamp(fh * 0.6, 20, fh - 16);
  const shop = closed && h.shopfront && shopW >= 16;
  const balc = closed && N > 1 && h.balcony !== "none";
  const bw = h.balcony === "full" ? Wc - 1 : clamp(Wc * 0.45, Math.min(Wc - 2, dW + 16), Wc - 2);
  const bx0 = T + (Wc - bw) / 2, bd = clamp(h.balconyDepth, 12, 60);
  const bdW = clamp(dW, 14, bw - 8), bdH = clamp(h.doorH, 20, fh - 6);
  const balconyFloors = balc ? floors.slice(1) : [];
  const frontAt: [number, number][] = floors.flatMap((k) => evenly(T + 6, T + Wc - 6, nf).map((x) => [x, sill(k), k] as const))
    .filter(([x, , k]) => (k === 0 ? !shop && Math.abs(x - cxD) >= Math.max(ww, h.doorW) * 0.9 : !balconyFloors.includes(k) || Math.abs(x - cxD) >= fw / 2 + bdW / 2 + 4))
    .map(([x, z]) => [x, z] as [number, number]);
  const shopAt: [number, number][] = shop ? [[T + g6 + shopW / 2, T + 6], [T + Wc - g6 - shopW / 2, T + 6]] : [];
  /** The ground floor's openings beside the door: [x0, x1, top]. */
  const groundWins: [number, number, number][] = shop ? shopAt.map(([x, z]) => [x - shopW / 2, x + shopW / 2, z + shopH]) : frontAt.filter(([, z]) => z < zFloor(1)).map(([x, z]) => [x - fw / 2, x + fw / 2, z + wh]);

  // the grounds: a base grown into a yard or a pavement in front and at the sides
  const grounds = h.grounds;
  const S = grounds !== "none" ? clamp(h.yardSides, 0, 150) : 0, Yd = grounds !== "none" ? clamp(h.yard, 0, 250) : 0;
  const gx0 = -P - S, gx1 = W + P + S, gy0 = -P;
  let gy1 = D + P + Yd;
  const fenced = grounds === "garden" && h.fence !== "none" && Yd >= 14;
  const yff = gy1 - 2 - T; // the front fence's back face

  // porch: a canopy over the door on two posts, or a veranda along the front on posts with railings
  let porch: HouseInfo["porch"] = closed ? (h.porch === "none" ? "none" : h.porch) : "none";
  let doorCut = false;
  const zcMax = (N > 1 ? zFloor(1) : ftop) - T - 2;
  let pd = clamp(h.porchDepth, 14, 80);
  if (porch !== "none") {
    const limit = fenced ? yff - 3 : grounds !== "none" ? gy1 - 3 : Infinity;
    pd = Math.min(pd, limit - yF);
    if (pd < 14) porch = "none";
  }
  if (porch === "veranda" && Math.max(T + dH, ...groundWins.map((g) => g[2])) + 4 > zcMax) porch = "canopy";
  let zc = 0, cx0 = 0, cx1 = 0;
  if (porch === "veranda") { zc = Math.max(T + dH, ...groundWins.map((g) => g[2])) + 4; cx0 = T + 0.5; cx1 = T + Wc - 0.5; }
  if (porch === "canopy") {
    zc = Math.min(T + dH + 5, zcMax);
    if (zc < T + dH + 2) { dH = Math.max(20, zc - 2 - T); doorCut = true; }
    let half = Math.min(dW / 2 + 10, Wc / 2 - 1);
    for (const [a, b, top] of groundWins) if (top > zc - 1) half = Math.min(half, (a > cxD ? a - cxD : cxD - b) - 3);
    if (half < dW / 2 + 2 || zc < 24) porch = "none";
    cx0 = cxD - half; cx1 = cxD + half;
  }
  if (porch !== "none") {
    if (grounds === "none") gy1 = Math.max(gy1, yF + pd + 4);
    const pw = Math.max(T + 4, 6), yp = yF + pd - 2 - T, tw = pw - 2;
    // posts: at both ends, and for a veranda beside the door and between, no more than 60 mm apart
    let xs = [cx0 + 2, cx1 - 2 - pw];
    if (porch === "veranda") {
      const l = cxD - dW / 2 - 4 - pw, r = cxD + dW / 2 + 4;
      const fill = (a: number, b: number) => { const n = Math.floor((b - a) / 60); return Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / (n + 1)); };
      xs = [cx0 + 2, ...fill(cx0 + 2, l), l, r, ...fill(r, cx1 - 2 - pw), cx1 - 2 - pw].filter((x, i, a) => i === 0 || x > a[i - 1] + pw + 1);
    }
    const spans = tabSpans(cx0, cx1, T);
    const canopyHoles = xs.map((x) => rect(x + 1, yp, tw, T));
    const canopyOuter = outerOf([rect(cx0, yF, cx1 - cx0, pd), ...spans.map(([s, e]) => rect(s, yF - T, e - s, T + 0.01))]);
    for (const [s, e] of spans) facadeSlots.push(rect(s, zc, e - s, T));
    const finish = clipScore(roofFinish(h.roofFinish === "seams" ? "seams" : "plain", cx0, cx1, yF, yF + pd), canopyOuter, canopyHoles);
    extra.push({ id: "porch-roof", name: porch === "veranda" ? "Veranda roof" : "Porch canopy", outer: canopyOuter, holes: canopyHoles, ...(finish.length ? { score: finish } : {}), place: { x: 0, y: 0, z: zc } });
    xs.forEach((x, i) => {
      const H = zc + T;
      const out = yUp(outerOf([rect(0, 0, pw, zc), rect(1, zc - 0.01, tw, T + 0.01), rect(1, -T, tw, T + 0.01)]), H);
      const rings: Contour[] = [[[0, H - zc + 3], [pw, H - zc + 3]], [[0, H - 4], [pw, H - 4]]];
      extra.push({ id: `porch-post${i + 1}`, name: `Porch post ${i + 1}`, outer: out, holes: [], score: rings, place: { x, y: -H, z: yp, upright: true } });
      baseHoles.push(rect(x + 1, yp, tw, T));
    });
    // railings between the veranda's posts, leaving the door's bay open
    if (porch === "veranda") {
      const rh = Math.min(clamp(fh * 0.3, 12, 35), zc - 4);
      for (let i = 0; i + 1 < xs.length; i++) {
        const a = xs[i] + pw, b = xs[i + 1], L = b - a;
        if (L < 3 * T + 2 || (a < cxD && b > cxD)) continue;
        const r = screenPanel(L, rh, h.rail, T);
        extra.push({ id: `porch-rail${i + 1}`, name: `Veranda railing ${i + 1}`, outer: r.outer, holes: r.holes, ...(r.score.length ? { score: r.score } : {}), place: { x: a, y: -rh, z: yp, upright: true } });
        for (const [s, e] of tabSpans(0, L, T)) baseHoles.push(rect(a + s, yp, e - s, T));
      }
    }
    occupied.push([cx0, yF, cx1, yF + pd]);
  }

  /** Every opening in the facade, [x0, x1, z0, z1], for what is tabbed into it. */
  const openBoxes: [number, number, number, number][] = [
    ...frontAt.map(([x, z]): [number, number, number, number] => [x - fw / 2, x + fw / 2, z, z + wh]),
    ...shopAt.map(([x, z]): [number, number, number, number] => [x - shopW / 2, x + shopW / 2, z, z + shopH]),
    [cxD - dW / 2, cxD + dW / 2, T, T + dH],
    ...balconyFloors.map((k): [number, number, number, number] => [cxD - bdW / 2, cxD + bdW / 2, zFloor(k) + T, zFloor(k) + T + bdH]),
  ];
  // balconies: a slab tabbed into the facade, railings tabbed into the slab, brackets under it
  if (balc) for (const k of balconyFloors) {
    const z = zFloor(k), mr = Math.max(1.6, T * 0.5), yr = yF + bd - mr - T, rh = clamp(fh * 0.32, 12, 40);
    const spans = tabSpans(bx0, bx0 + bw, T);
    const slabHoles: Contour[] = [];
    for (const [s, e] of spans) facadeSlots.push(rect(s, z, e - s, T));
    const pre = `balcony${k + 1}`;
    // front railing and the two side railings
    const fr = screenPanel(bw - 2 * mr, rh, h.rail, T);
    extra.push({ id: `${pre}-rail`, name: `Balcony railing (floor ${k + 1})`, outer: fr.outer, holes: fr.holes, ...(fr.score.length ? { score: fr.score } : {}), place: { x: bx0 + mr, y: -(z + T + rh), z: yr, upright: true } });
    for (const [s, e] of tabSpans(0, bw - 2 * mr, T)) slabHoles.push(rect(bx0 + mr + s, yr, e - s, T));
    const Ls = yr - yF;
    if (Ls >= 3 * T) for (const [side, xs] of [["left", bx0 + mr], ["right", bx0 + bw - mr - T]] as const) {
      const sr = screenPanel(Ls, rh, h.rail, T);
      extra.push({ id: `${pre}-rail-${side}`, name: `Balcony railing (floor ${k + 1}, ${side})`, outer: sr.outer, holes: sr.holes, ...(sr.score.length ? { score: sr.score } : {}), place: { x: xs + T, y: -(z + T + rh), z: yF, upright: true, yaw: 90 } });
      for (const [s, e] of tabSpans(0, Ls, T)) slabHoles.push(rect(xs, yF + s, T, e - s));
    }
    // brackets, where the facade under them is solid
    const below = (k === 1 && porch !== "none" ? zc + T : sill(k - 1) + wh) + 3;
    const bh = Math.min(bd * 0.7, z - below);
    const tw = Math.min(bd * 0.4, 10);
    const bxs = [bx0 + Math.max(bw * 0.2, mr + T + 2), bx0 + bw - Math.max(bw * 0.2, mr + T + 2) - T];
    const solid = (x: number) => !openBoxes.some(([a, b, z0, z1]) => z0 < z - 1.5 && z1 > z - bh + 0.5 && x + T > a - 1.5 && x < b + 1.5) && !(k === 1 && porch !== "none" && x + T > cx0 - 1 && x < cx1 + 1);
    if (bh >= 6 && bxs.every(solid)) bxs.forEach((xb, i) => {
      const y0 = yF - T, Htop = z + T;
      const tri: Contour = [[yF, z], [yF + bd * 0.75, z], [yF, z - bh]];
      const prof = outerOf([tri, rect(yF + 1.5, z - 0.01, tw, T + 0.01), rect(yF - T, z - bh + 2, T + 0.01, bh - 4)]);
      extra.push({ id: `${pre}-bracket${i + 1}`, name: `Balcony bracket ${i + 1} (floor ${k + 1})`, outer: yUp(move(prof, -y0, 0), Htop), holes: [], place: { x: xb + T, y: -Htop, z: y0, upright: true, yaw: 90 } });
      slabHoles.push(rect(xb, yF + 1.5, T, tw));
      facadeSlots.push(rect(xb, z - bh + 2, T, bh - 4));
    });
    const slab = outerOf([rect(bx0, yF, bw, bd), ...spans.map(([s, e]) => rect(s, yF - T, e - s, T + 0.01))]);
    extra.push({ id: `${pre}-floor`, name: `Balcony (floor ${k + 1})`, outer: slab, holes: slabHoles, score: clipScore(wallFinish("boards", bx0, bx0 + bw, yF, yF + bd), slab, slabHoles), place: { x: 0, y: 0, z } });
  }

  // a door leaf in an opening: inset 0.5 mm all round, panels scored or glass cut out, and a knob
  function doorLeaf(id: string, name: string, cx: number, z0: number, w: number, hh: number): GenPart {
    const shape = openingShape(dShape, cx, z0, w, hh), leaf = grow(shape, -0.5);
    const x0 = cx - w / 2 + 0.5, x1 = cx + w / 2 - 0.5, zt = z0 + hh - 0.5, m = Math.min(3, w * 0.12);
    const holes: Contour[] = [], marks: Contour[] = [];
    const panel = (za: number, zb: number) => { const r = rect(x0 + m, za, x1 - x0 - 2 * m, zb - za); return [...r, r[0]]; };
    switch (h.door) {
      case "panelled": marks.push(panel(z0 + m, z0 + hh * 0.42), panel(z0 + hh * 0.5, zt - m - (dShape === "rect" ? 0 : w * 0.3))); break;
      case "planked": for (let x = x0 + 3.5; x < x1 - 1; x += 3.5) marks.push([[x, z0 + 0.5], [x, zt]]); marks.push([[x0, z0 + hh * 0.25], [x1, z0 + hh * 0.25]], [[x0, z0 + hh * 0.7], [x1, z0 + hh * 0.7]]); break;
      case "glazed": {
        const gz0 = z0 + hh * 0.45, glass = openingShape(dShape, cx, gz0, w - 2 * m - 1, Math.max(6, zt - gz0 - m));
        if (w - 2 * m - 1 >= 8) holes.push(...openingHoles(glass, "cross", BAR));
        marks.push(panel(z0 + m, z0 + hh * 0.38));
        break;
      }
    }
    const knob = circle(x1 - Math.max(2.2, w * 0.12), z0 + hh * 0.45, 0.9, 0.2);
    marks.push([...knob, knob[0]]);
    const lines = clipScore(marks, leaf, holes);
    return { id, name, outer: toMember(leaf, ftop), holes: holes.map((c) => toMember(c, ftop)), ...(lines.length ? { score: lines.map((c) => toMember(c, ftop)) } : {}), place: { x: 0, y: -ftop, z: yF - T, upright: true } };
  }

  // ---- back wall and facade
  const backTop = h.roof === "flat" ? He + par : h.roof === "shed" ? He + (D * Math.tan(pitch) * 0.5) * (1 - (mb + T) / D) : He;
  const backAt: [number, number][] = floors.flatMap((k) => evenly(T + 6, T + Wc - 6, clamp(Math.round(h.backWindows), 0, 6)).map((x) => [x, sill(k)] as [number, number]));
  const backOpen = openings(backAt, Math.min(ww, Wc / Math.max(1, h.backWindows) - 8), wh);
  function toMember(c: Contour, z1: number): Contour { return c.map(([x, z]) => [x, z1 - z] as Pt); }
  const finishLines = (x0: number, x1: number, z0: number, z1: number) => wallFinish(h.wall, x0, x1, z0, z1, floors.map((k) => zFloor(k) + T / 2));
  const uprights: UprightMember[] = [];
  {
    const outer = rect(T, 0, Wc, backTop), holes = backOpen.holes;
    const lines = clipScore([...finishLines(T, T + Wc, 0, backTop), ...backOpen.marks], outer, holes);
    uprights.push({ id: "back", name: "Back wall", y: mb, z0: 0, z1: backTop, holes: holes.map((c) => toMember(c, backTop)), score: lines.map((c) => toMember(c, backTop)) });
  }
  if (closed) {
    const win = openings(frontAt, fw, wh);
    const shopO = openings(shopAt, shopW, shopH, h.opening === "arch" || h.opening === "rect" ? "rect" : h.opening === "round" ? "rect" : h.opening, h.panes !== "lattice", false);
    const door = openings([[cxD, T]], dW, dH, dShape, false);
    const bdoors = openings(balconyFloors.map((k) => [cxD, zFloor(k) + T] as [number, number]), bdW, bdH, dShape, false);
    const sign: Contour[] = [];
    if (shop) {
      const z0 = T + 6 + shopH + 4, z1 = Math.min(z0 + 10, (N > 1 ? zFloor(1) : ftop) - 3);
      if (z1 - z0 >= 4) { const r = rect(T + 4, z0, Wc - 8, z1 - z0); sign.push([...r, r[0]]); }
    }
    const holes = [...win.holes, ...shopO.holes, ...door.holes, ...bdoors.holes], outer = rect(T, 0, Wc, ftop);
    const lines = clipScore([...finishLines(T, T + Wc, 0, ftop), ...win.marks, ...shopO.marks, ...door.marks, ...bdoors.marks, ...sign], outer, [...holes, ...facadeSlots]);
    uprights.push({ id: "facade", name: "Facade", y: D - mf - T, z0: 0, z1: ftop, holes: [...holes, ...facadeSlots].map((c) => toMember(c, ftop)), score: lines.map((c) => toMember(c, ftop)) });
    if (h.door !== "open") {
      extra.push(doorLeaf("door", "Front door", cxD, T, dW, dH));
      balconyFloors.forEach((k) => extra.push(doorLeaf(`door${k + 1}`, `Balcony door (floor ${k + 1})`, cxD, zFloor(k) + T, bdW, bdH)));
    }
    if (h.step) {
      const sd = porch !== "none" ? Math.min(8, pd - T - 5) : Math.min(8, gy1 - yF - 1);
      if (sd >= 3) { extra.push({ id: "step", name: "Front step", outer: rect(cxD - dW / 2 - 3, yF, dW + 6, sd), holes: [], place: { x: 0, y: 0, z: 0 } }); occupied.push([cxD - dW / 2 - 3, yF, cxD + dW / 2 + 3, yF + sd]); }
    }
  }

  // ---- the grounds: fences, a path, flower beds, trees; or a pavement with street lamps
  const pathW = Math.min(dW * 0.9, 30), gw = clamp(dW * 1.3, Math.max(20, pathW + 4), (gx1 - gx0) * 0.4);
  const houseFront = Math.max(D, porch !== "none" ? yF + pd : D);
  let fenceParts = 0;
  if (fenced) {
    const Hf = clamp(fh * 0.32, 14, 40) * (h.fence === "wall" ? 0.75 : 1);
    const panel = (id: string, name: string, x: number, y: number, L: number, alongY: boolean) => {
      if (L < 3 * T) return;
      const r = screenPanel(L, Hf, h.fence as FenceStyle, T);
      extra.push({ id, name, outer: r.outer, holes: r.holes, ...(r.score.length ? { score: r.score } : {}), place: alongY ? { x: x + T, y: -Hf, z: y, upright: true, yaw: 90 } : { x, y: -Hf, z: y, upright: true } });
      for (const [s, e] of tabSpans(0, L, T)) baseHoles.push(alongY ? rect(x, y + s, T, e - s) : rect(x + s, y, e - s, T));
      occupied.push(alongY ? [x, y, x + T, y + L] : [x, y, x + L, y + T]);
      fenceParts++;
    };
    const fl = gx0 + 2, fr = gx1 - 2;
    panel("fence-front-l", "Fence (front, left)", fl, yff, cxD - gw / 2 - fl, false);
    panel("fence-front-r", "Fence (front, right)", cxD + gw / 2, yff, fr - (cxD + gw / 2), false);
    if (h.gate) panel("gate", "Garden gate", cxD - gw / 2 + 0.6, yff, gw - 1.2, false);
    if (S >= T + 6) {
      panel("fence-left", "Fence (left)", fl, gy0 + 2, yff - (gy0 + 2), true);
      panel("fence-right", "Fence (right)", fr - T, gy0 + 2, yff - (gy0 + 2), true);
    }
  }
  const stepFront = Math.max(houseFront, yF + 8);
  if (grounds === "garden" && h.path && gy1 - stepFront > 6) {
    // stepping stones, two to a row with the joint alternating
    const x0 = cxD - pathW / 2, x1 = cxD + pathW / 2;
    let k = 0;
    for (let y = stepFront + 1; y + 3 < gy1 - 1; y += 6.2, k++) {
      const y1 = Math.min(y + 5, gy1 - 1), split = x0 + pathW * (k % 2 ? 0.38 : 0.62);
      for (const [a, b] of [[x0, split - 0.6], [split + 0.6, x1]]) {
        const c = 0.8;
        baseScore.push([[a + c, y], [b - c, y], [b, y + c], [b, y1 - c], [b - c, y1], [a + c, y1], [a, y1 - c], [a, y + c], [a + c, y]]);
      }
    }
    occupied.push([x0, stepFront, x1, gy1]);
  }
  if (grounds === "garden" && h.beds) {
    const edge = fenced ? yff - 3 : gy1 - 3, bedD = clamp(Yd * 0.3, 6, 14), y0 = edge - bedD;
    if (y0 >= houseFront + 3) for (const [a, b] of [[gx0 + 2 + (S >= T + 6 ? T : 0) + 3, cxD - pathW / 2 - 3], [cxD + pathW / 2 + 3, gx1 - 2 - (S >= T + 6 ? T : 0) - 3]]) {
      if (b - a < 12) continue;
      const c = 2;
      baseScore.push([[a + c, y0], [b - c, y0], [b, y0 + c], [b, edge - c], [b - c, edge], [a + c, edge], [a, edge - c], [a, y0 + c], [a + c, y0]]);
      for (let x = a + 3.5, i = 0; x < b - 2; x += 4, i++) { const f = circle(x, (y0 + edge) / 2 + (i % 2 ? 1.2 : -1.2), 0.9, 0.2); baseScore.push([...f, f[0]]); }
    }
  }
  if (grounds === "street") {
    // paving slabs over the whole base round the house, and a kerb along the front
    const step = 8, lines: Contour[] = [];
    for (let x = gx0 + step; x < gx1; x += step) lines.push([[x, gy0], [x, gy1 - 6]]);
    for (let y = gy0 + step; y < gy1 - 6; y += step) lines.push([[gx0, y], [gx1, y]]);
    lines.push([[gx0, gy1 - 6], [gx1, gy1 - 6]], [[gx0, gy1 - 4.4], [gx1, gy1 - 4.4]]);
    baseScore.push(...lines);
  }
  // trees and lamps stand on the base in a plus-shaped slot: front corners first, then the sides
  // Each spot takes the biggest size that fits, down to just under half the full size; a spot is
  // given as the box it may use, [x0, y0, x1, y1], and the piece is centred in it.
  const crossAt = (kind: CrossKind, H0: number, w0: number, spots: [number, number, number, number][], n: number, id: string, name: string) => {
    let placed = 0;
    for (const sp of spots) {
      if (placed >= n) break;
      const room = Math.min(sp[2] - sp[0], sp[3] - sp[1]) - 2;
      const k = Math.min(1, room / w0);
      if (k < 0.45) continue;
      const wc = w0 * k, Hc = Math.max(H0 * k, 20), x = (sp[0] + sp[2]) / 2, y = (sp[1] + sp[3]) / 2;
      const box: [number, number, number, number] = [x - wc / 2 - 1, y - wc / 2 - 1, x + wc / 2 + 1, y + wc / 2 + 1];
      if (box[0] < gx0 + 1 || box[2] > gx1 - 1 || box[1] < gy0 + 1 || box[3] > gy1 - 1 || hits(box)) continue;
      const { profile, foot } = crossProfile(kind, Hc, wc, T);
      const c = crossPair(profile, T, [x, y, 0], `${id}${placed + 1}`, `${name} ${placed + 1}`, foot, true);
      extra.push(...c.parts);
      baseHoles.push(...c.hole);
      occupied.push(box);
      placed++;
    }
    return placed;
  };
  let trees = 0, lamps = 0;
  if (grounds !== "none") {
    const kind = h.treeKind;
    const Ht = kind === "bush" ? clamp(fh * 0.45, 22, 70) : clamp(fh * 1.05, 45, 160), wt = Ht * (kind === "bush" ? 1.1 : kind === "pine" ? 0.5 : 0.58);
    const inX0 = gx0 + 2 + (fenced && S >= T + 6 ? T : 0) + 1, inX1 = gx1 - 2 - (fenced && S >= T + 6 ? T : 0) - 1, inY1 = (fenced ? yff : gy1 - 2) - 1;
    // the spots: the front corners (in front of the house, inside the fence), then the side yards
    const front0 = Math.max(houseFront, D) + 1;
    const side = Math.max(0, (inY1 - front0));
    const spots: [number, number, number, number][] = [
      [inX0, inY1 - Math.min(side, wt + 2), inX0 + Math.min(wt + 2, Math.max(0, cxD - pathW / 2 - 2 - inX0)), inY1],
      [inX1 - Math.min(wt + 2, Math.max(0, inX1 - cxD - pathW / 2 - 2)), inY1 - Math.min(side, wt + 2), inX1, inY1],
      [inX0, D * 0.55 - (wt + 2) / 2, -0.5, D * 0.55 + (wt + 2) / 2], [W + 0.5, D * 0.55 - (wt + 2) / 2, inX1, D * 0.55 + (wt + 2) / 2],
      [inX0, D * 0.15 - (wt + 2) / 2, -0.5, D * 0.15 + (wt + 2) / 2], [W + 0.5, D * 0.15 - (wt + 2) / 2, inX1, D * 0.15 + (wt + 2) / 2],
      [inX0 + wt + 4, inY1 - Math.min(side, wt + 2), inX0 + 2 * wt + 6, inY1], [inX1 - 2 * wt - 6, inY1 - Math.min(side, wt + 2), inX1 - wt - 4, inY1],
    ];
    trees = crossAt(kind, Ht, wt, spots, clamp(Math.round(h.trees), 0, 6), kind === "bush" ? "bush" : "tree", kind === "bush" ? "Bush" : kind === "pine" ? "Pine tree" : "Tree");
    if (grounds === "street") {
      const Hl = clamp(fh * 0.75, 40, 120), wl = 14, yl = gy1 - 9 - wl / 2, n = clamp(Math.round(h.lamps), 0, 6);
      const xs = Array.from({ length: 2 * n + 3 }, (_, i) => gx0 + 6 + wl / 2 + ((gx1 - gx0 - 12 - wl) * i) / (2 * n + 2));
      xs.sort((a, b) => Math.abs(b - cxD) - Math.abs(a - cxD));
      lamps = crossAt("lamp", Hl, wl, xs.map((x): [number, number, number, number] => [x - wl / 2 - 1, yl - wl / 2 - 1, x + wl / 2 + 1, yl + wl / 2 + 1]), n, "lamp", "Street lamp");
    }
  }

  // ---- the frame
  const sideLines = clipScore([...finishLines(0, D, 0, Math.max(...top.map((q) => q[1]))), ...sideOpen.marks], profile, sideOpen.holes);
  const parts = tabbedFrame({
    T, W: Wc, profile, endHoles: sideOpen.holes, endScore: sideLines, ends: ["Left wall", "Right wall"],
    flats, uprights, dividers,
    caps: [{ id: "base", name: grounds === "garden" ? "Base and garden" : grounds === "street" ? "Base and pavement" : "Base", at: "bottom", z: 0, x0: gx0, x1: gx1, y0: gy0, y1: gy1, holes: baseHoles }],
  });
  // Floors also tab into the back wall along their back edge.
  const back = parts.find((q) => q.id === "back")!;
  for (const m of flats) {
    const part = parts.find((q) => q.id === m.id)!;
    const spans = tabSpans(T, T + Wc, T);
    part.outer = outerOf([part.outer, ...spans.map(([s, e]) => rect(s, mb, e - s, T + 0.01))]);
    for (const [s, e] of spans) back.holes.push(rect(s, backTop - (m.z + T), e - s, T));
  }
  if (baseScore.length) {
    const base = parts.find((q) => q.id === "base")!;
    const lines = clipScore(baseScore, base.outer, [...base.holes, rect(-0.3, -0.3, W + 0.6, D + 0.6)]);
    if (lines.length) base.score = lines;
  }
  parts.push(...stairParts, ...extra);

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
  // ---- chimney: a finger-jointed stack standing on the top plate, up through a hole in one roof panel
  let chimney: HouseInfo["chimney"] = "none";
  if (h.chimney) {
    chimney = "no-room";
    const cw = clamp(W * 0.09, 16, 30), cd = clamp(cw * 0.8, 14, 26);
    type Plane = { q: GenPart; z: (x: number, y: number, top: boolean) => number; uv: (x: number, y: number, top: boolean) => Pt };
    const planes: Plane[] = roof.filter((q) => q.id.startsWith("roof-")).map((q): Plane => {
      const m = q.place!.m;
      if (!m) { const z0 = q.place!.z; return { q, z: (_x, _y, top) => z0 + (top ? T : 0), uv: (x, y) => [x, y] }; }
      const U = [m[0], m[4], m[8]], V = [m[1], m[5], m[9]], Nn = [m[2], m[6], m[10]], O = [m[3], m[7], m[11]];
      const z = (x: number, y: number, top: boolean) => O[2] + ((top ? T : 0) - Nn[0] * (x - O[0]) - Nn[1] * (y - O[1])) / Nn[2];
      return { q, z, uv: (x, y, top) => { const d = [x - O[0], y - O[1], z(x, y, top) - O[2]]; return [d[0] * U[0] + d[1] * U[1] + d[2] * U[2], d[0] * V[0] + d[1] * V[1] + d[2] * V[2]]; } };
    });
    const tw = clamp(Wc * 0.22, 30, 60), towerBox = tower === "built" ? [T + 6, yi0 + 6, T + 6 + tw, yi0 + 6 + tw] : null;
    const xs = [T + Wc - cw - 12, T + (Wc - cw) / 2, T + 12];
    const ys = h.roof === "flat" ? [yi0 + 8, (yi0 + yi1 - cd) / 2] : [D / 2 - cd - 8, yi0 + 10, D / 2 + 8, yi1 - cd - 10];
    let found: { ox: number; oy: number; plane: Plane | null } | null = null;
    for (const oy of ys) {
      for (const ox of xs) {
        if (ox < T + 2 || ox + cw > T + Wc - 2 || oy < yi0 + 1 || oy + cd > yi1 - 1) continue;
        if (towerBox && ox < towerBox[2] + 2 && ox + cw > towerBox[0] - 2 && oy < towerBox[3] + 2 && oy + cd > towerBox[1] - 2) continue;
        if (h.roof === "flat") { found = { ox, oy, plane: null }; break; }
        const pts: Pt[] = [];
        for (let y = oy - 1; y <= oy + cd + 1.001; y += (cd + 2) / 6) for (let x = ox - 1; x <= ox + cw + 1.001; x += (cw + 2) / 6) pts.push([x, y]);
        const inside = planes.map((pl) => pts.filter(([x, y]) => pointInContour(pl.uv(x, y, false), pl.q.outer)).length);
        const full = inside.findIndex((n) => n === pts.length);
        if (full >= 0 && inside.every((n, i) => i === full || n === 0)) { found = { ox, oy, plane: planes[full] }; break; }
      }
      if (found) break;
    }
    if (found) {
      chimney = "built";
      const { ox, oy, plane } = found, oz = He;
      const corners: Pt[] = [[ox, oy], [ox + cw, oy], [ox + cw, oy + cd], [ox, oy + cd]];
      let topZ = He + par;
      if (plane) {
        const hole = grow(hull(corners.flatMap(([x, y]) => [plane.uv(x, y, false), plane.uv(x, y, true)])), 0.4);
        plane.q.holes.push(hole);
        if (plane.q.score) plane.q.score = clipScore(plane.q.score, plane.q.outer, [hole]);
        topZ = Math.max(...corners.map(([x, y]) => plane.z(x, y, true)));
      }
      const th = topZ + (plane ? Math.max(10, fh * 0.3) : Math.max(18, fh * 0.45)) - He;
      const k = boxPanels(cw, cd, th, T, Math.min(cw, cd) / 4, true);
      const brick = (w: number, outer: Contour) => clipScore([...wallFinish("brick", 0, w, 4, th), [[0, 4], [w, 4]]], outer, []);
      const flue = [circle(cw / 2, cd / 2, Math.min(cw, cd) * 0.22, 0.05)];
      roof.push(
        { id: "chimney-front", name: "Chimney (front)", outer: k.face, holes: [], score: brick(cw, k.face), place: { x: ox, y: -(oz + th), z: oy + cd - T, upright: true } },
        { id: "chimney-back", name: "Chimney (back)", outer: k.face, holes: [], score: brick(cw, k.face), place: { x: ox, y: -(oz + th), z: oy, upright: true } },
        { id: "chimney-left", name: "Chimney (left)", outer: k.side, holes: [], score: brick(cd, k.side), place: { x: ox + T, y: -(oz + th), z: oy, upright: true, yaw: 90 } },
        { id: "chimney-right", name: "Chimney (right)", outer: k.side, holes: [], score: brick(cd, k.side), place: { x: ox + cw, y: -(oz + th), z: oy, upright: true, yaw: 90 } },
        { id: "chimney-floor", name: "Chimney (floor)", outer: k.bottom, holes: [], place: { x: ox, y: oy, z: oz } },
        { id: "chimney-cap", name: "Chimney (cap)", outer: k.top!, holes: flue, place: { x: ox, y: oy, z: oz + th - T } },
      );
    }
  }
  parts.push(...roof);

  const Htot = Math.max(...profile.map((q) => q[1]), ...roof.flatMap((pt) => (pt.place?.m ? pt.outer.map(([u, v]) => pt.place!.m![8] * u + pt.place!.m![9] * v + pt.place!.m![11]) : pt.place?.upright ? [-pt.place.y - T] : [pt.place?.z ?? 0]))) + T;
  return {
    parts,
    stats: [
      { label: "Footprint", value: `${r1(W)} × ${r1(D)} mm on a ${r1(gx1 - gx0)} × ${r1(gy1 - gy0)} mm base` },
      { label: "Height", value: `${r1(Htot)} mm, ${N} ${N === 1 ? "floor" : "floors"} of ${r1(fh)} mm` },
      { label: "Rooms", value: `${rooms} per floor, ${r1(roomW)} mm wide` },
      { label: "Roof", value: `${ROOF_NAMES[h.roof]}${segments.length || h.roof === "hip" || h.roof === "mansard" ? `, ${r1(h.roof === "mansard" ? 72 : clamp(h.pitch, 5, 70))}°` : ""}` },
      { label: "Style", value: `${trad.name}${trad.fictional ? " (fictional)" : ""}` },
      ...(grounds !== "none" ? [{ label: grounds === "garden" ? "Garden" : "Pavement", value: `${r1(gx1 - gx0)} × ${r1(gy1 - gy0)} mm base${fenceParts ? `, ${fenceParts} fence ${fenceParts === 1 ? "panel" : "panels"}` : ""}${trees ? `, ${trees} ${trees === 1 ? "tree" : "trees"}` : ""}${lamps ? `, ${lamps} ${lamps === 1 ? "lamp" : "lamps"}` : ""}` }] : []),
    ],
    assembly: [
      "Push the side walls' bottom tabs into the base, then slide the floors, the top plate and the back wall in between them; every tab has one slot.",
      ...(dividers.length ? ["Stand the partitions in their slots as each floor goes in; they lock the floor above."] : []),
      ...(stairs === "built" ? ["Build each stair: push the treads into one stringer, press the other on, and stand it in the first room against the back wall under the stairwell."] : []),
      ...(closed ? ["The facade goes in with the back wall, before the top plate."] : ["The front stays open for play; dry-fit before gluing."]),
      ...(segments.length ? ["Lay the roof panels on the side walls' tabs; the panel over the ridge covers the other's edge. Glue along the tabs."] : h.roof === "hip" || h.roof === "mansard" ? ["Glue the roof panels on the top plate, edge to edge; sand the hips flush."] : []),
      ...(tower === "built" ? ["Glue the windcatcher's finger joints and stand it on the roof at the back."] : []),
      ...(chimney === "built" ? ["Glue the chimney's finger joints, stand it on the top plate before the roof goes on, and lower the roof panel over it."] : []),
      ...(balc ? ["Push each balcony into its slots in the facade, stand the railings in the balcony's slots and press the brackets in under it."] : []),
      ...(porch !== "none" ? ["Tab the porch roof into the facade, then stand the posts between the base and the porch roof."] : []),
      ...(h.door !== "open" && closed ? ["Glue each door leaf in its opening, or hinge it on a pin through the frame."] : []),
      ...(fenceParts ? ["Push the fence panels into the base's slots, the side fences first."] : []),
      ...(trees || lamps ? ["Slide each tree or lamp's two halves together at their slots and push the cross into its slot in the base."] : []),
      "Wood glue in every slot makes it permanent; engrave and score before cutting so nothing moves between jobs.",
    ],
    info: { size: [gx1 - gx0, gy1 - gy0, Htot], roomW, stairs, windowFit, tower, parts: parts.length, front, porch, doorCut, chimney, trees, lamps, treesWanted: grounds !== "none" ? clamp(Math.round(h.trees), 0, 6) : 0, lampsWanted: grounds === "street" ? clamp(Math.round(h.lamps), 0, 6) : 0 },
  };
}
