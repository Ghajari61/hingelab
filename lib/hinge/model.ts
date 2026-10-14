import type { ComputeResult, Issue, Params, Part, PlatePart, Point } from "./types";
import { buildCore, plateExtent, roundedPointsXY } from "./core";
import { buildTestStrip, buildWalls } from "./wall";
import { barWidth, cutWidth, honeyLattice, kerfY, slotLike } from "./hinge";
import { bboxOf } from "./polygon";
import { ellipse, kerfAcross } from "@/lib/materials/axes";
import { bendAnalysis } from "./analysis";
import { r3 } from "./util";

const NUMS = ["W", "D", "H", "R", "dia", "T", "K", "slotW", "slit", "bridge", "pitch", "overrun", "tabW", "slotClr", "lidGap", "bedW", "bedH", "gap"] as const;

/** Build a living-hinge box. Returns `{ error }` with the prototype's message when the input is invalid. */
export function computeModel(input: Params): ComputeResult {
  const p = honeyLattice(input);
  const issues: Issue[] = [];
  const t = p.T, k = p.K;
  for (const n of NUMS) if (!isFinite(p[n])) return { error: "Every field needs a number." };
  if (t <= 0.5) return { error: "Material thickness must be more than 0.5 mm." };
  if (k < 0 || k >= t) return { error: "Kerf must be between 0 and the material thickness." };
  if (p.Ky != null && !(isFinite(p.Ky) && p.Ky >= 0 && p.Ky < t)) return { error: "Kerf Y must be between 0 and the material thickness." };
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
  const topTabs = p.lid === "fixed";

  const walls = buildWalls(p, edges, rN, hBody, topTabs);
  if ("error" in walls) return { error: walls.error };
  const { cols, hs, L, zoneLen } = walls;
  const parts: Part[] = walls.parts;

  // plates
  const ky = kerfY(p), aniso = ky !== k;
  const slotRects: Point[][] = [];
  edges.forEach(e => e.tabs.forEach(u => {
    const c = [e.p0[0] + e.t[0] * u + e.n[0] * rN, e.p0[1] + e.t[1] * u + e.n[1] * rN];
    const sa = aniso ? (p.tabW + p.slotClr) / 2 - kerfAcross(e.t, k, ky) : (p.tabW + p.slotClr - k) / 2;
    const sb = aniso ? (t + p.slotClr) / 2 - kerfAcross(e.n, k, ky) : (t + p.slotClr - k) / 2;
    slotRects.push([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + e.t[0] * sa * i + e.n[0] * sb * j, c[1] + e.t[1] * sa * i + e.n[1] * sb * j] as Point));
  }));
  // r0 is the outline's corner radius before kerf.
  const plate = (name: string, r0: number, slots: Point[][]): PlatePart => aniso
    ? { kind: "plate", name, r: r0, ek: [k, ky], edges, slots, bbox: bboxOf(roundedPointsXY(edges, r0, k, ky)) }
    : { kind: "plate", name, r: r0 + k / 2, edges, slots, bbox: plateExtent(edges, r0 + k / 2) };
  const over = Math.max(0, p.lidOver ?? 0);
  parts.push(plate("BASE", R, slotRects));
  const coreIn = Math.min(...edges.map(e => e.c[0] * e.n[0] + e.c[1] * e.n[1]));
  /** The finger or knob hole, centred, when it fits inside `inner` (the clear radius) with 3 mm to spare. */
  let holeR = 0;
  const lidHole = (inner: number, where: string): Point[][] => {
    if (p.lidHole !== "finger" && p.lidHole !== "knob") return [];
    const d = p.lidHoleD ?? (p.lidHole === "knob" ? 5 : 22);
    if (d / 2 + 3 <= inner && d > k + 0.5) { holeR = d / 2; return [ellipse(0, 0, (d - k) / 2, (d - ky) / 2, 72)]; }
    issues.push({ lvl: "warn", msg: `The ${p.lidHole === "knob" ? "knob" : "finger"} hole is too big for the ${where}, so it was left out. Use a hole under ${r3(Math.max(0, 2 * (inner - 3)))} mm.` });
    return [];
  };
  const withHole = (pt: PlatePart): PlatePart => (holeR ? { ...pt, hole: holeR } : pt);
  if (p.lid === "fixed") parts.push(withHole(plate("LID", R + over, [...slotRects, ...lidHole(coreIn + R - t - Math.max(0, p.slotClr), "lid")])));
  if (p.lid === "removable") {
    const lipR = R - t - p.lidGap + k / 2;
    const lip = p.lidLip !== false && lipR > 0.5;
    // The hole goes through the lip too, when there is one, so it must fit the smaller plate.
    const hole = lidHole(coreIn + (lip ? lipR : R + over), lip ? "lid lip" : "lid");
    parts.push(withHole(plate("LID", R + over, hole)));
    if (lip) parts.push(withHole(plate("LID LIP", R - t - p.lidGap, hole)));
    else if (p.lidLip !== false) issues.push({ lvl: "warn", msg: "Corner radius is too small for a lid lip, so the lip was left out. Increase the radius above " + r3(t + p.lidGap + 1) + " mm." });
  }

  // ---- bend test strip
  if (p.testStrip && zoneLen > 0) parts.push(buildTestStrip(p, zoneLen, hBody, hs));

  // ---- bend analysis
  const an = bendAnalysis(p, hBody, rN);
  const minBar = p.minFeature && p.minFeature > 0 ? p.minFeature : null;
  const fix = p.pattern === "honeycomb" ? " or narrow the cells." : slotLike(p) ? " or narrow the slots." : ".";
  if (minBar == null && barWidth(p) < 0.9) issues.push({ lvl: "warn", msg: "Torsion bars are under 0.9 mm wide and may char or snap. Widen the slit spacing" + fix });
  if (minBar != null && barWidth(p) < minBar) issues.push({ lvl: "warn", msg: `Torsion bars are under ${r3(minBar)} mm wide, the narrowest your material holds, and may char or snap. Widen the slit spacing` + fix });
  if (p.material === "acr3") issues.push({ lvl: "warn", msg: "Acrylic living hinges crack easily. Use them only for gentle curves or heat-assisted bends." });
  if (p.pattern !== "serpentine" && p.pattern !== "honeycomb" && hs.Lp < p.bridge * 2) issues.push({ lvl: "warn", msg: "Slits are short compared with the bridges, so the hinge will be stiff. Lengthen the slits or shrink the bridges." });
  if (p.pattern === "serpentine") issues.push({ lvl: "info", msg: "Serpentine bends very tightly but the wall can stretch. Glue the wall to the base and lid." });
  if (an.ratio > 3) issues.push({ lvl: "info", msg: "The hinge is far more flexible than this corner needs. Auto-fit can make it stiffer and stronger." });
  if (edges.some(e => e.len > 0.01 && e.tabs.length === 0 && !e.seam) || edges.every(e => e.tabs.length === 0)) {
    if (edges.every(e => e.tabs.length === 0)) issues.push({ lvl: "warn", msg: "No flat side is long enough for a tab, so the wall must be glued in place. Use smaller tabs or a larger box." });
  }
  return { core, R, rN, L, hBody, parts, cols, hs, issues, zoneLen, analysis: Object.assign(an, { columns: cols.length }) };
}
