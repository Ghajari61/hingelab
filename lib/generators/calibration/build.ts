/**
 * Calibration coupons: kerf strips, a slot fit ladder and a living-hinge strip, all at their design
 * size (the shell applies the kerf once, like any other design). Every part stays upright so the X
 * strips measure the kerf across cuts along Y and the Y strips across cuts along X.
 */
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { bendAnalysis } from "@/lib/hinge/analysis";
import { strokeText } from "@/lib/parametric/label";
import { rect } from "../geom";
import { hingeSlits } from "../tablenum/build";
import type { GenOutput, GenPart } from "../types";
import { hingePitches, ladderSteps, type CalibrationParams } from "./params";

const LABEL = 2.5, EDGE = 6;
const fmtC = (c: number) => (c > 0 ? `+${c.toFixed(2)}` : c < 0 ? `-${Math.abs(c).toFixed(2)}` : "0");

/** The kerf the shell compensates across cuts along Y and along X. */
export const cutKerfs = (p: CalibrationParams): [number, number] => [p.K, p.sheet?.kerfXY ? (p.sheet.kerfY ?? p.K) : p.K];

/** Estimated tightest radius of a straight-slit hinge zone, mm (the Hinge Box's estimate). */
export function zoneRadius(p: CalibrationParams, pitch: number): number {
  const q = { ...clone(HINGE), material: p.material, T: p.T, K: p.K, pattern: "straight" as const, cutStyle: "line" as const, slit: p.hinge.slit, bridge: p.hinge.bridge, pitch };
  return bendAnalysis(q, p.hinge.width, 1).rMin;
}

export function buildCalibration(p: CalibrationParams): GenOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  if (!p.kerf.on && !p.ladder.on && !p.hinge.on) return { parts: [], stats: [], error: "Turn on at least one coupon." };
  const parts: GenPart[] = [], stats: GenOutput["stats"] = [], steps: string[] = [];
  let x = 0;
  const put = (pt: Omit<GenPart, "place" | "upright">, w: number) => {
    parts.push({ ...pt, upright: true, place: { x, y: 0, z: 0 } });
    x += w + 8;
  };
  const [kx, ky] = cutKerfs(p);

  if (p.kerf.on) {
    const { strips: n, width: w, length: L } = p.kerf;
    for (let i = 0; i < n; i++) put({ id: `kerf-x-${i + 1}`, name: `Kerf strip X${i + 1}`, outer: rect(0, 0, w, L), holes: [], score: strokeText(`X${i + 1}`, Math.min(LABEL, w * 0.3), w / 2, L / 2, 90) }, w);
    if (p.kerf.both) for (let i = 0; i < n; i++) put({ id: `kerf-y-${i + 1}`, name: `Kerf strip Y${i + 1}`, outer: rect(0, 0, L, w), holes: [], score: strokeText(`Y${i + 1}`, Math.min(LABEL, w * 0.3), L / 2, w / 2) }, L);
    stats.push({ label: "Kerf strips", value: `${n}${p.kerf.both ? " + " + n : ""} × ${w} mm, ${n * w} mm side by side` });
    steps.push(`Push the ${n} X strips together side by side on a flat surface and measure across them with calipers; do the same with the Y strips. Enter both in My materials › Record coupon results (they were cut with kerf ${kx}${ky !== kx ? ` / ${ky}` : ""} mm).`);
  }

  if (p.ladder.on) {
    const cs = ladderSteps(p.ladder), narrow = p.T + cs[0] - Math.max(kx, ky);
    if (narrow < 0.05) return { parts: [], stats: [], error: `The narrowest slot (${(p.T + cs[0]).toFixed(2)} mm) is no wider than the kerf. Start the ladder at a larger clearance.` };
    const pitch = Math.max(11, p.T + 8), w = 2 * EDGE + cs.length * pitch, d = p.ladder.depth, h = EDGE + d + LABEL + 7;
    const holes = cs.map((c, i) => rect(EDGE + (i + 0.5) * pitch - (p.T + c) / 2, EDGE, p.T + c, d));
    const score = cs.flatMap((c, i) => strokeText(fmtC(c), LABEL, EDGE + (i + 0.5) * pitch, EDGE + d + 2 + LABEL / 2));
    put({ id: "fit-ladder", name: "Fit ladder", outer: rect(0, 0, w, h), holes, score }, w);
    stats.push({ label: "Fit ladder", value: `${cs.length} slots, thickness ${fmtC(cs[0])} to ${fmtC(cs[cs.length - 1])} mm` });
    steps.push("Push a scrap of the same sheet (a kerf strip works) into each slot. The slot where it goes in by hand and stays put is your fit clearance: enter its number.");
  }

  if (p.hinge.on) {
    const h = p.hinge, ps = hingePitches(h), gapY = 9, L = gapY + ps.length * (h.zone + gapY);
    const cuts = ps.flatMap((pitch, i) => { const y0 = gapY + i * (h.zone + gapY); return hingeSlits(h.width, y0, y0 + h.zone, { band: h.zone, slit: h.slit, bridge: h.bridge, pitch }); });
    const score = ps.flatMap((pitch, i) => strokeText(pitch.toFixed(1), LABEL, h.width / 2, gapY + i * (h.zone + gapY) + h.zone + gapY / 2));
    put({ id: "hinge-strip", name: "Hinge strip", outer: rect(0, 0, h.width, L), holes: [], cuts, score }, h.width);
    const est = ps.map((pitch) => `${pitch.toFixed(1)} mm ≈ R ${zoneRadius(p, pitch).toFixed(0)}`).join(", ");
    stats.push({ label: "Hinge zones (estimate)", value: est });
    steps.push("Bend each hinge zone round something round (a can, a pipe) until it starts to crack. Enter the tightest radius that bent cleanly; the labels give the slit spacing of each zone.");
  }

  steps.push("Measuring updates the material's kerf and fit clearance and marks it tested on your machine with today's date.");
  return { parts, stats, assembly: steps };
}
