import type { CapInfo, ComputeResult, Edge, FlipInfo, Issue, LidHole, Model, Params, Part, PlatePart, Point, WallPart } from "./types";
import { buildCore, insetPoints, plateExtent, roundedPointsXY } from "./core";
import { buildTestStrip, buildWalls } from "./wall";
import { barWidth, cutWidth, honeyLattice, kerfY, slotLike } from "./hinge";
import { bboxOf } from "./polygon";
import { ellipse, kerfAcross } from "@/lib/materials/axes";
import { bendAnalysis, refitLattice } from "./analysis";
import { r3 } from "./util";
import { coreDistance, defaultRimWidth, isLidSlot, lidSlotSize, slotAlongY, slotOutline } from "./lidSlot";
import { buildDividers, hasDividers } from "./dividers";
import { fretMarks, fretOnLid, fretOnWalls, hasFret, lidFret, wallFret } from "./fret";
import { clipHalf, coreSupport, flipBand, flipCuts, flipKeepsTab, onFlap, type FlipBand } from "./flip";
import { hasBaseText } from "./baseText";
import { buildDrawers, drawerCount, drawerShell } from "./drawers";

const NUMS = ["W", "D", "H", "R", "dia", "T", "K", "slotW", "slit", "bridge", "pitch", "overrun", "tabW", "slotClr", "lidGap", "bedW", "bedH", "gap"] as const;

/** Most stacked plates on a lid. */
export const MAX_LID_STEPS = 3;
export const LID_STEP_IN = 6;
/** Round holes: default diameters, mm. */
const ROUND_D: Partial<Record<LidHole | "hole", number>> = { finger: 22, knob: 5, lamp: 40, hole: 10 };
export const roundHoleD = (kind: LidHole | "hole" | undefined) => (kind ? ROUND_D[kind] : undefined);
export const lidStepCount = (p: Params) => Math.max(0, Math.min(MAX_LID_STEPS, Math.round(p.lidSteps ?? 0)));
/** The cap lid's outside height when the design leaves it out: 40% of the box, 25 to 60 mm. */
export const defaultCapH = (p: Params) => Math.round(Math.min(60, Math.max(25, p.H * 0.4), p.H - p.T));
export const capHeight = (p: Params) => (p.capH && p.capH > 0 ? p.capH : defaultCapH(p));

/** A plate on the rounded core, `r0` the outline's corner radius before kerf. */
function plateOf(name: string, edges: Edge[], r0: number, slots: Point[][], k: number, ky: number): PlatePart {
  return ky !== k
    ? { kind: "plate", name, r: r0, ek: [k, ky], edges, slots, bbox: bboxOf(roundedPointsXY(edges, r0, k, ky)) }
    : { kind: "plate", name, r: r0 + k / 2, edges, slots, bbox: plateExtent(edges, r0 + k / 2) };
}

interface Opening {
  polys: Point[][];
  /** A centred round hole's radius (the plate's label moves below it). */
  holeR: number;
  /** An open top's rim width. */
  rimW: number;
}

/**
 * A hole through a plate whose outer radius (before kerf) is `rOut`; `inner` is the clear distance
 * from the centre to the nearest cut (tab slots, the wall, a lip). A flip lid's opening stays on the flap.
 */
function plateOpening(
  p: Params, kind: LidHole | "hole" | undefined, size: { d?: number; w?: number }, edges: Edge[], rOut: number, inner: number,
  where: string, issues: Issue[], band?: FlipBand,
): Opening {
  const t = p.T, k = p.K, ky = kerfY(p), none: Opening = { polys: [], holeR: 0, rimW: 0 };
  const coreIn = Math.min(...edges.map(e => e.c[0] * e.n[0] + e.c[1] * e.n[1]));
  if (kind === "rim") {
    // An open top: the plate keeps a band `w` wide from its edge and at least 2 mm past the tab slots or the lip.
    const w = size.w ?? defaultRimWidth(t), rOpen = rOut - w, rad = inner - coreIn;
    if (rOpen > k + 1 && rOpen <= rad - 2) {
      let poly = insetPoints(edges, rOpen, k, ky);
      if (band) poly = clipHalf(poly, band.a, band.from - 3 - k / 2);
      if (poly.length >= 3) return { polys: [poly], holeR: 0, rimW: w };
    }
    issues.push({ lvl: "warn", msg: rOpen <= k + 1
      ? `The rim is too wide for the ${where}, so the top was left closed. Use a rim under ${r3(Math.max(0, rOut - k - 2))} mm.`
      : `The rim is too narrow for the ${where}, so the top was left closed. Use a rim of at least ${r3(rOut - rad + 2)} mm.` });
    return none;
  }
  if (isLidSlot(kind)) {
    // The slot keeps 3 mm of the plate around it; `inner - coreIn` is the plate's corner radius.
    const { len, w } = lidSlotSize(p), along = slotAlongY(p), rad = inner - coreIn;
    const pts = slotOutline(len, w, along, k, ky);
    const name = kind === "coin" ? "coin slot" : "tissue slot";
    if (w > Math.max(k, ky) + 0.5 && len >= w && pts.every((q) => coreDistance(edges, q) <= rad - 3) && (!band || onFlap(pts, band, 3))) return { polys: [pts], holeR: (along ? len : w) / 2, rimW: 0 };
    issues.push({ lvl: "warn", msg: `The ${name} is too big for the ${where}, so it was left out. Make the slot shorter or narrower, or the box larger.` });
    return none;
  }
  const d0 = roundHoleD(kind);
  if (d0 == null) return none;
  const d = size.d ?? d0;
  const what = kind === "knob" ? "knob" : kind === "lamp" ? "lamp-holder" : kind === "hole" ? "" : "finger";
  if (d <= Math.max(k, ky) + 0.5) {
    issues.push({ lvl: "warn", msg: `The ${what ? `${what} ` : ""}hole was left out: its diameter must exceed both kerf values by more than 0.5 mm.` });
    return none;
  }
  if (band && kind !== "lamp") {
    // On a flip lid the finger or knob hole goes near the free edge, over the inside of the box.
    const a = band.a, free = coreSupport(edges, [-a[0], -a[1]]) + rOut, over = Math.max(0, p.lidOver ?? 0);
    const u = -(free - over - t - (kind === "knob" ? 9 : 4) - d / 2);
    const c: Point = [a[0] * u, a[1] * u], hole = ellipse(c[0], c[1], (d - k) / 2, (d - ky) / 2, 72);
    if (d > k + 0.5 && hole.every((q) => coreDistance(edges, q) <= inner - coreIn - 3) && onFlap(hole, band, 3)) return { polys: [hole], holeR: 0, rimW: 0 };
  } else if (d / 2 + 3 <= inner && d > k + 0.5 && (!band || onFlap(ellipse(0, 0, d / 2, d / 2, 36), band, 3))) {
    return { polys: [ellipse(0, 0, (d - k) / 2, (d - ky) / 2, 72)], holeR: d / 2, rimW: 0 };
  }
  issues.push({ lvl: "warn", msg: `The ${what ? `${what} ` : ""}hole is too big for the ${where}, so it was left out. Use a hole under ${r3(Math.max(0, 2 * (inner - 3)))} mm.` });
  return none;
}

/** The size settings of the lid's own opening. */
const lidSize = (p: Params) => ({ d: p.lidHoleD, w: p.lidHoleW });

/**
 * Plates stacked on a lid whose outside is `dims` (width, depth, corner radius, diameter), each
 * `lidStepIn` smaller all round, with the lid's opening through them. A cylinder's steps are round;
 * the others keep the lid's outline, their corners shrinking to no less than 3 mm. A step the
 * opening does not fit in (with 3 mm to spare) is left out.
 */
function lidSteps(p: Params, dims: Pick<Params, "W" | "D" | "R" | "dia">, hole: Point[][], prefix: string, issues: Issue[]): PlatePart[] {
  const n = lidStepCount(p), k = p.K, ky = kerfY(p);
  if (!n) return [];
  if (fretOnLid(p)) { issues.push({ lvl: "info", msg: "Steps would cover the lid's cut-out pattern, so they were left out. Put the pattern on the walls only, or take the steps off." }); return []; }
  const step = Math.max(1, p.lidStepIn ?? LID_STEP_IN), out: PlatePart[] = [];
  for (let i = 1; i <= n; i++) {
    const s = i * step;
    const c = p.shape === "cyl"
      ? buildCore({ ...p, shape: "rect", W: dims.dia - 2 * s, D: dims.dia - 2 * s, R: dims.dia / 2 - s })
      : buildCore({ ...p, W: dims.W - 2 * s, D: dims.D - 2 * s, R: Math.max(Math.min(3, dims.R), dims.R - s) });
    const fits = !("error" in c) && c.R > k + 2 && hole.every((poly) => poly.every((q) => coreDistance(c.edges, q) <= c.R - 3));
    if (!fits || "error" in c) { issues.push({ lvl: "warn", msg: `Only ${i - 1} of the ${n} lid steps fit${hole.length ? " round the lid's opening" : ""}, so the rest were left out. Use smaller steps or fewer.` }); break; }
    out.push(plateOf(`${prefix} STEP ${i}`, c.edges, c.R, hole, k, ky));
  }
  return out;
}

/** A clear window under an open top: `rOut` the lid's outer radius, `rim` its rim, `max` the most it may reach. */
function windowPlate(p: Params, edges: Edge[], rOut: number, rim: number, max: number, issues: Issue[], band?: FlipBand): PlatePart | null {
  const k = p.K, ky = kerfY(p), r0 = Math.min(rOut - rim / 2, max), rOpen = rOut - rim;
  if (!(r0 >= rOpen + 2)) {
    issues.push({ lvl: "warn", msg: "There is no room for a window under this rim, so it was left out. Use a wider rim." });
    return null;
  }
  const w = plateOf("WINDOW", edges, r0, [], k, ky);
  w.clear = true;
  if (band) {
    const pts = clipHalf(roundedPointsXY(edges, r0, k, ky), band.a, band.from - 1), bb = bboxOf(pts);
    Object.assign(w, { pts, bbox: bb, labelAt: [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2] as Point });
  }
  return w;
}

/** The name of a part of a cap or a drawer. */
const renamed = (prefix: string, name: string) => (name === "BASE" ? `${prefix} ${prefix === "CAP" ? "TOP" : "BASE"}` : `${prefix} ${name}`);

/** The settings the box is built from: a chest of drawers is an open-fronted case (lib/hinge/drawers). */
export function builtParams(p: Params): Params {
  return drawerCount(p) > 0 && (p.shape === "rect" || p.shape === "pill") ? drawerShell(p) : p;
}

/** Build a living-hinge box. Returns `{ error }` with the prototype's message when the input is invalid. */
export function computeModel(input: Params): ComputeResult {
  // Imported projects bypass form bounds; reject bad numbers before derived geometry or loops.
  for (const [field, value] of Object.entries(input)) {
    if (typeof value === "number" && !Number.isFinite(value)) return { error: `${field} needs a finite number.` };
  }
  const issues: Issue[] = [];
  const shell = builtParams(input), asDrawers = shell !== input;
  if (drawerCount(input) && !asDrawers) issues.push({ lvl: "warn", msg: "Drawers need a rounded or pill-shaped case, so they were left out." });
  const p = honeyLattice(shell);
  const t = p.T, k = p.K;
  for (const n of NUMS) if (!isFinite(p[n])) return { error: "Every field needs a number." };
  if (t <= 0.5) return { error: "Material thickness must be more than 0.5 mm." };
  if (k < 0 || k >= t) return { error: "Kerf must be between 0 and the material thickness." };
  if (p.Ky != null && !(isFinite(p.Ky) && p.Ky >= 0 && p.Ky < t)) return { error: "Kerf Y must be between 0 and the material thickness." };
  if ([p.W, p.D, p.H, p.dia, p.slit, p.bridge, p.pitch, p.tabW, p.bedW, p.bedH].some(n => n <= 0)) return { error: "Dimensions, slit length, bridges, spacing, tabs and sheet size must be positive." };
  if (p.gap < 0 || p.lidGap < 0) return { error: "Sheet spacing and lid clearance cannot be negative." };
  if (Math.min(t, p.tabW) + p.slotClr <= Math.max(k, kerfY(p)) + 0.05) return { error: "Joint clearance collapses the tab slots after kerf compensation. Increase clearance or reduce kerf." };
  if (slotLike(p) && p.slotW < k + 0.05) return { error: "Slot width must be at least 0.05 mm wider than the kerf." };
  if (p.pattern === "honeycomb" && barWidth(p) < 0.3) return { error: "Honeycomb walls are too thin. Narrow the cells or widen the spacing." };
  if (p.pattern !== "honeycomb" && p.pitch <= cutWidth(p) + 0.3) return { error: slotLike(p) ? "Slit spacing is too tight for this slot width. Increase the spacing or narrow the slots." : "Slit spacing is too tight for this kerf. Increase the spacing." };
  const core = buildCore(p);
  if ("error" in core) return { error: core.error };
  const { edges, R } = core;
  if (R < t + 1) return { error: `Corner radius must be at least ${r3(t + 1)} mm for ${r3(t)} mm material.` };
  const rN = R - t / 2;
  const hBody = p.lid === "open" ? p.H - t : p.H - 2 * t;
  if (hBody < 2 * p.bridge + 6) return { error: "The box is too short for this bridge size. Increase height or reduce the bridge." };
  const over = Math.max(0, p.lidOver ?? 0);

  // A flip lid's band, and which of the wall's top tabs reach the strip behind it.
  let band: FlipBand | undefined;
  if (p.lid === "flip") {
    const b = flipBand(p, edges, R + over);
    if ("error" in b) return { error: b.error };
    band = b;
  }
  const keepTop = band ? flipKeepsTab(p, band, rN) : null;
  const walls = buildWalls(p, edges, rN, hBody, keepTop ?? p.lid === "fixed");
  if ("error" in walls) return { error: walls.error };
  const { cols, hs, L, zoneLen } = walls;
  const parts: Part[] = walls.parts;

  // plates
  const ky = kerfY(p), aniso = ky !== k;
  const slotRects: Point[][] = [], topSlots: Point[][] = [];
  edges.forEach(e => e.tabs.forEach(u => {
    const c = [e.p0[0] + e.t[0] * u + e.n[0] * rN, e.p0[1] + e.t[1] * u + e.n[1] * rN];
    const sa = aniso ? (p.tabW + p.slotClr) / 2 - kerfAcross(e.t, k, ky) : (p.tabW + p.slotClr - k) / 2;
    const sb = aniso ? (t + p.slotClr) / 2 - kerfAcross(e.n, k, ky) : (t + p.slotClr - k) / 2;
    const rect = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + e.t[0] * sa * i + e.n[0] * sb * j, c[1] + e.t[1] * sa * i + e.n[1] * sb * j] as Point);
    slotRects.push(rect);
    if (keepTop?.(e, u)) topSlots.push(rect);
  }));
  // r0 is the outline's corner radius before kerf.
  const plate = (name: string, r0: number, slots: Point[][]): PlatePart => plateOf(name, edges, r0, slots, k, ky);
  let ring: PlatePart | null = null, ringIn: number | null = null;
  if (p.baseRing) {
    const bw = p.baseRingW ?? 8;
    const ro = R - t - p.lidGap, ri = ro - bw;
    if (ro > 1 && ri > k + 1) { ring = plate("BASE RING", ro, [insetPoints(edges, ri, k, ky)]); ringIn = ri; }
    else issues.push({ lvl: "warn", msg: "The box is too small for a support ring of this width, so the ring was left out. Use a wider box or a narrower ring." });
  }
  const div = hasDividers(p) ? buildDividers(p, edges, R - t, hBody, ringIn) : null;
  const coreIn = Math.min(...edges.map(e => e.c[0] * e.n[0] + e.c[1] * e.n[1]));
  const baseInner = coreIn + R - t - Math.max(0, p.slotClr);

  // ---- the base, with its opening and hanging holes
  let baseOpen: Point[][] = [];
  const bh = p.baseHole ?? "none";
  if (bh === "rim" && div) issues.push({ lvl: "warn", msg: "Dividers need a base to stand on, so the open bottom was left out. Take the dividers out, or use a hole instead." });
  else if (bh === "hole" || bh === "rim") baseOpen = plateOpening(p, bh, { d: p.baseHoleD, w: p.baseHoleW }, edges, R, baseInner, "base", issues).polys;
  if (baseOpen.length && bh === "hole" && div?.places.some(s => {
    // The entire divider foot needs support, including sockets between crossings.
    const nearest = s.from <= 0 && s.to >= 0 ? 0 : Math.min(Math.abs(s.from), Math.abs(s.to));
    return Math.hypot(s.at, nearest) < (p.baseHoleD ?? ROUND_D.hole!) / 2 + t / 2 + Math.max(2, p.minFeature ?? 0);
  })) {
    baseOpen = [];
    issues.push({ lvl: "warn", msg: "The base opening was left out because it cuts into a divider support or tab socket. Reduce the opening or change the divider count." });
  }
  const baseSlots = div ? [...slotRects, ...div.baseSlots] : slotRects;
  const hang = p.hangHoles ? hangHoles(p, edges, R, [...baseSlots, ...baseOpen], issues) : [];
  const base = plate("BASE", R, [...baseSlots, ...baseOpen, ...hang]);
  if (baseOpen.length && hasBaseText(p)) {
    base.noText = true;
    issues.push({ lvl: "info", msg: "The text under the box was left out: the base has an opening in the middle." });
  }
  parts.push(base);
  if (ring) parts.push(ring);

  /** The finger or knob hole, centred, when it fits inside `inner` (the clear radius) with 3 mm to spare. */
  let holeR = 0;
  let rimW = 0;
  const lidHole = (inner: number, where: string): Point[][] => {
    const o = plateOpening(p, p.lidHole, lidSize(p), edges, R + over, inner, where, issues, band);
    holeR = o.holeR; rimW = o.rimW;
    return o.polys;
  };
  const withHole = (pt: PlatePart): PlatePart => (holeR ? { ...pt, hole: holeR } : rimW ? { ...pt, rim: rimW - (pt.name === "LID LIP" ? R + over - (R - t - p.lidGap) : 0) } : pt);
  let lidOpening: Point[][] = [];
  if (p.lid === "fixed") {
    lidOpening = lidHole(coreIn + R - t - Math.max(0, p.slotClr), "lid");
    parts.push(withHole(plate("LID", R + over, [...slotRects, ...lidOpening])));
  }
  if (p.lid === "removable") {
    const lipR = R - t - p.lidGap + k / 2;
    const lip = p.lidLip !== false && lipR > 0.5;
    // The hole goes through the lip too, when there is one, so it must fit the smaller plate.
    const hole = lidHole(coreIn + (lip ? lipR : R + over), lip ? "lid lip" : "lid");
    lidOpening = hole;
    const lid = withHole(plate("LID", R + over, hole));
    parts.push(lip && p.lidLipScore ? { ...lid, scoreR: R - t - p.lidGap } : lid);
    if (lip) parts.push(withHole(plate("LID LIP", R - t - p.lidGap, hole)));
    else if (p.lidLip !== false) issues.push({ lvl: "warn", msg: "Corner radius is too small for a lid lip, so the lip was left out. Increase the radius above " + r3(t + p.lidGap + 1) + " mm." });
  }
  let flip: FlipInfo | undefined;
  if (p.lid === "flip" && band) {
    lidOpening = lidHole(coreIn + R - t - Math.max(0, p.slotClr), "lid");
    const cuts = flipCuts(p, edges, R + over, band);
    // The name goes on the flap, between the band and the finger or knob hole when there is one.
    const free = -(coreSupport(edges, [-band.a[0], -band.a[1]]) + R + over);
    const near = rimW ? null : lidOpening.length ? Math.max(...lidOpening.flat().map((q) => q[0] * band.a[0] + q[1] * band.a[1])) : null;
    const mid = near != null && band.from - near > 10 ? (band.from + near) / 2 : (free + band.from) / 2;
    const lid = plate("LID", R + over, [...topSlots, ...lidOpening]);
    Object.assign(lid, { hinge: cuts.slots, hingeLines: cuts.lines, labelAt: [band.a[0] * mid, band.a[1] * mid] as Point }, rimW ? { rim: rimW } : {});
    parts.push(lid);
    flip = { a: band.a, from: band.from, to: band.to, angle: band.angle };
    if (!topSlots.length) issues.push({ lvl: "info", msg: "No tab reaches the strip behind the flip hinge, so glue that strip to the top of the wall." });
    if (band.angle < 90) issues.push({ lvl: "warn", msg: `The flip hinge's estimated opening is only ${Math.round(band.angle)}°. Widen the band or use a more flexible pattern, then verify with a material test strip.` });
  }
  if (p.lid === "fixed" || p.lid === "removable") parts.push(...lidSteps(p, { W: p.W + 2 * over, D: p.D + 2 * over, R: R + over, dia: p.dia + 2 * over }, lidOpening, "LID", issues));
  if (p.lid !== "flip" && p.lid !== "fixed" && p.lid !== "removable" && p.lid !== "cap" && lidStepCount(p)) issues.push({ lvl: "info", msg: "Lid steps need a fixed, removable or cap lid." });
  if (p.lid === "flip" && lidStepCount(p)) issues.push({ lvl: "info", msg: "Steps would stop a flip lid's hinge from bending, so they were left out." });
  if (p.lidWindow && rimW && p.lid !== "open" && p.lid !== "cap") {
    const max = p.lid === "removable" ? R - t - p.lidGap : R - t - Math.max(0, p.slotClr) - 0.5;
    const w = windowPlate(p, edges, R + over, rimW, max, issues, band);
    if (w) parts.push(w);
  }

  // ---- cut-out pattern: through the lid (and its lip) and the wall's flat stretches
  if (fretOnLid(p) && (p.lid === "fixed" || p.lid === "removable" || p.lid === "flip") && p.lidHole !== "rim") {
    const lid = parts.find((q): q is PlatePart => q.kind === "plate" && q.name === "LID");
    const lip = parts.find((q): q is PlatePart => q.kind === "plate" && q.name === "LID LIP");
    const rad = p.lid !== "removable" ? R - t - Math.max(0, p.slotClr) - 1 : lip ? R - t - p.lidGap - 2 : R + over - 3;
    if (lid) {
      // A flip lid keeps its pattern on the flap, clear of the hinge band.
      const keep: Point[][] = band ? [bandBox(band, Math.max(1, p.fretBar ?? 3) + 1)] : [];
      const holes = lidFret(p, edges, rad, [...lid.slots, ...keep]);
      if (holes.length) {
        // The labels move to the plain band at the edge, clear of the pattern.
        const clear = rad - Math.max(1, p.fretBar ?? 3) - 1;
        const rimOf = (pt: PlatePart) => (pt.name === "LID" ? R + over : R - t - p.lidGap) - clear;
        if (fretMarks(p)) Object.assign(lid, { [p.fretMark === "score" ? "score" : "engrave"]: holes, rim: rimOf(lid) });
        else for (const q of [lid, lip]) if (q) Object.assign(q, { slots: [...q.slots, ...holes], rim: rimOf(q) });
      } else {
        issues.push({ lvl: "info", msg: "The lid is too small for this cut-out pattern. Make the pattern smaller or the box larger." });
      }
    }
  }
  if (fretOnWalls(p)) for (const w of parts) if (w.kind === "wall" && !w.test && !w.divider) { const h = wallFret(p, w); if (h.length) w[fretMarks(p) ? (p.fretMark === "score" ? "score" : "engrave") : "holes"] = h; }

  if (div) { parts.push(...div.parts); issues.push(...div.issues); }

  // ---- cap lid: a shallow box of its own, upside down over the top
  let cap: CapInfo | undefined;
  if (p.lid === "cap") {
    const c = buildCap(p, R, issues);
    if ("error" in c) return { error: c.error };
    parts.push(...c.parts);
    cap = c.info;
  }

  // ---- drawers in an open-fronted case
  let drawerPlaces: Model["drawerPlaces"];
  if (asDrawers) {
    const d = buildDrawers(input, edges, R, hBody, div?.places ?? [], computeModel);
    parts.push(...d.parts);
    issues.push(...d.issues);
    if (d.places.length) drawerPlaces = d.places;
  }

  // ---- bend test strip
  if (p.testStrip && zoneLen > 0) parts.push(buildTestStrip(p, zoneLen, hBody, hs));

  // ---- bend analysis
  const an = bendAnalysis(p, hBody, rN);
  const minBar = p.minFeature && p.minFeature > 0 ? p.minFeature : null;
  const fix = p.pattern === "honeycomb" ? " or narrow the cells." : slotLike(p) ? " or narrow the slots." : ".";
  if (minBar == null && barWidth(p) < 0.9) issues.push({ lvl: "warn", msg: "Torsion bars are under 0.9 mm wide and may char or snap. Widen the slit spacing" + fix });
  if (minBar != null && barWidth(p) < minBar) issues.push({ lvl: "warn", msg: `Torsion bars are under ${r3(minBar)} mm wide, the narrowest your material holds, and may char or snap. Widen the slit spacing` + fix });
  if (["acr2", "acr3", "acr5", "mirror3"].includes(p.material)) issues.push({ lvl: "warn", msg: "Acrylic living hinges can crack, especially with repeated opening. Test a coupon; the bend estimate is not a fatigue rating." });
  if (p.pattern !== "serpentine" && p.pattern !== "honeycomb" && hs.Lp < p.bridge * 2) issues.push({ lvl: "warn", msg: "Slits are short compared with the bridges, so the hinge will be stiff. Lengthen the slits or shrink the bridges." });
  if (p.pattern === "serpentine") issues.push({ lvl: "info", msg: "Serpentine bends very tightly but the wall can stretch. Glue the wall to the base and lid." });
  if (an.ratio > 3) issues.push({ lvl: "info", msg: "The hinge is far more flexible than this corner needs. Auto-fit can make it stiffer and stronger." });
  if (edges.some(e => e.len > 0.01 && e.tabs.length === 0 && !e.seam) || edges.every(e => e.tabs.length === 0)) {
    if (edges.every(e => e.tabs.length === 0)) issues.push({ lvl: "warn", msg: "No flat side is long enough for a tab, so the wall must be glued in place. Use smaller tabs or a larger box." });
  }
  if (parts.some((q) => q.kind === "plate" && q.clear)) issues.push({ lvl: "info", msg: "Cut the window from clear acrylic, 2 to 3 mm thick, and glue it under the rim." });
  return {
    core, R, rN, L, hBody, parts, cols, hs, issues, zoneLen, analysis: Object.assign(an, { columns: cols.length }),
    ...(div?.places.length ? { dividers: div.places } : {}), ...(flip ? { flip } : {}), ...(cap ? { cap } : {}), ...(drawerPlaces ? { drawerPlaces } : {}),
  };
}

/** A rectangle over a flip lid's band and fixed strip (and `gap` more), to keep a pattern off them. */
function bandBox(band: FlipBand, gap: number): Point[] {
  const a = band.a, b: Point = [-a[1], a[0]], u0 = band.from - gap, u1 = band.edge + 1, v = 1e4;
  return [[u0, -v], [u1, -v], [u1, v], [u0, v]].map(([u, w]) => [a[0] * u + b[0] * w, a[1] * u + b[1] * w] as Point);
}

/**
 * Keyhole slots near the top of the base (the back of the drawing), to hang the box on two screws:
 * the screw head goes through the round end, then the box drops onto the narrow slot.
 */
function hangHoles(p: Params, edges: Edge[], R: number, existing: Point[][], issues: Issue[]): Point[][] {
  const t = p.T, k = p.K, ky = kerfY(p), head = 9, neck = 4.5, len = 9;
  if (Math.max(k, ky) >= neck - 0.5) {
    issues.push({ lvl: "warn", msg: "Hanging holes were left out: the kerf is too wide for their 4.5 mm necks." });
    return [];
  }
  const top = coreSupport(edges, [0, -1]) + R;
  const yEnd = -(top - t - Math.max(0, p.slotClr) - 6), y0 = yEnd + len;
  // How wide the inside is at the head's height.
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (coreDistance(edges, [m, y0]) <= R - t - 2) lo = m; else hi = m; }
  const key = (x: number): Point[] => {
    const rh = (head - k) / 2, rn = (neck - k) / 2, rhy = (head - ky) / 2, rny = (neck - ky) / 2, out: Point[] = [];
    const yTop = yEnd + neck / 2, ang = Math.asin(Math.min(1, rn / rh));
    // the slot's round top end
    for (let i = 0; i <= 8; i++) { const a = Math.PI + (Math.PI * i) / 8; out.push([x + rn * Math.cos(a), yTop + rny * Math.sin(a)]); }
    // down the right side to the head, round the head, back up the left side
    const a0 = -Math.PI / 2 + ang, a1 = 3 * Math.PI / 2 - ang;
    for (let i = 0; i <= 24; i++) { const a = a0 + ((a1 - a0) * i) / 24; out.push([x + rh * Math.cos(a), y0 + rhy * Math.sin(a)]); }
    return out;
  };
  const clash = (poly: Point[]) => {
    const b = bboxOf(poly);
    return existing.some((s) => { const e = bboxOf(s); return b.x0 < e.x1 + 2 && b.x1 > e.x0 - 2 && b.y0 < e.y1 + 2 && b.y1 > e.y0 - 2; });
  };
  for (const f of [0.55, 0.35, 0.7]) {
    const x = lo * f;
    if (x < head) continue;
    const pair = [key(-x), key(x)];
    if (pair.every((poly) => poly.every((q) => coreDistance(edges, q) <= R - t - 2) && !clash(poly))) return pair;
  }
  issues.push({ lvl: "warn", msg: "There is no clear room near the top of the base for hanging holes, so they were left out." });
  return [];
}

/** The cap lid: a shallow box over the top, its walls just outside the box's. */
function buildCap(p: Params, R: number, issues: Issue[]): { parts: Part[]; info: CapInfo } | { error: string } {
  const t = p.T, g = t + Math.max(0, p.lidGap), H = capHeight(p);
  if (H > p.H) return { error: "The cap lid is taller than the box. Make the cap lower." };
  const cp: Params = {
    ...p, lid: "open", W: p.W + 2 * g, D: p.D + 2 * g, R: p.R + g, dia: p.dia + 2 * g, H,
    divX: 0, divY: 0, baseRing: false, testStrip: false, hangHoles: false, upright: false, drawers: 0, lidSteps: 0, lidWindow: false, fit: undefined,
  };
  for (const key of ["divH", "baseText", "baseHole", "baseHoleD", "baseHoleW", "lidHole", "lidHoleD", "lidHoleW"] as const) delete cp[key];
  if (hasFret(p)) cp.fretOn = "walls";
  const m0 = computeModel(cp);
  if ("error" in m0) return { error: `Cap lid: ${m0.error}` };
  // The cap's walls are short, so the box's lattice may be too stiff for them: fit their own.
  const { m, lattice } = refitLattice(cp, m0, computeModel);
  if (lattice) issues.push({ lvl: "info", msg: `The cap's walls are shorter than the box's, so their hinge was fitted to them: spacing ${r3(lattice.pitch!)} mm, bridge ${r3(lattice.bridge!)} mm.` });
  const parts: Part[] = [];
  let top: PlatePart | null = null;
  for (const pt of m.parts) {
    if (pt.kind === "wall") parts.push({ ...pt, name: renamed("CAP", pt.name), hs: m.hs, ...(lattice ? { lattice } : {}) } as WallPart);
    else if (pt.name === "BASE") { top = { ...pt, name: "CAP TOP" }; parts.push(top); }
  }
  if (!top) return { error: "Cap lid: no top." };
  const edges = m.core.edges, Rc = m.R, coreIn = Math.min(...edges.map(e => e.c[0] * e.n[0] + e.c[1] * e.n[1]));
  const o = plateOpening(p, p.lidHole, lidSize(p), edges, Rc, coreIn + Rc - t - Math.max(0, p.slotClr), "cap", issues);
  top.slots = [...top.slots, ...o.polys];
  if (o.holeR) top.hole = o.holeR;
  if (o.rimW) top.rim = o.rimW;
  if (fretOnLid(p) && p.lidHole !== "rim") {
    const rad = Rc - t - Math.max(0, p.slotClr) - 1, holes = lidFret(p, edges, rad, top.slots);
    if (holes.length) {
      const rim = Rc - (rad - Math.max(1, p.fretBar ?? 3) - 1);
      if (fretMarks(p)) Object.assign(top, { [p.fretMark === "score" ? "score" : "engrave"]: holes, rim });
      else Object.assign(top, { slots: [...top.slots, ...holes], rim });
    }
  }
  parts.push(...lidSteps(p, { W: cp.W, D: cp.D, R: Rc, dia: cp.dia }, o.polys, "CAP", issues));
  if (p.lidWindow && o.rimW) {
    const w = windowPlate(p, edges, Rc, o.rimW, R - t - Math.max(0, p.lidGap), issues);
    if (w) parts.push(w);
  }
  if (m.analysis.verdict === "err") issues.push({ lvl: "warn", msg: `The cap's walls are short, so their hinge reaches only about R ${r3(m.analysis.rMin)} mm for corners of R ${r3(m.rN)} mm. Make the cap taller, or use a more flexible hinge style.` });
  for (const i of m.issues) if (/^(The rim|The (finger|knob|lamp-holder) hole)/.test(i.msg)) issues.push(i);
  return { parts, info: { edges, R: Rc, hBody: m.hBody, H } };
}
