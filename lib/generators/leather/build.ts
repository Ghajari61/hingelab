/**
 * Leather Studio's build: picks the construction family's builder, then adds what every product
 * shares: the loose pieces laid out beside the product in 3D, the bill of hardware, thread and
 * leather, and the assembly notes (with the laser safety list whenever a laser file is made).
 */
import { bboxOf, signedArea } from "../geom";
import type { BuildContext, GenOutput, GenPart } from "../types";
import { buildBox } from "./boxbag";
import { HW_NAMES, type HwLine } from "./hardware";
import { Pattern, type HoleRec, type SeamReport } from "./kit";
import { LASER_CHECKLIST, LASER_STATUS, laserAllowed, leatherOf } from "./materials";
import { PRODUCTS, type LeatherParams } from "./params";
import { buildBucket, buildSculpt, buildWrap } from "./shells";
import { buildSmall } from "./small";
import { splitLong, turnTall } from "./split";
import { STITCH_NAMES, CUT_MODES } from "./stitch";
import { buildStrap } from "./straps";
import type { DecorResult } from "./decor";

export interface LeatherInfo {
  product: LeatherParams["product"];
  size: [number, number, number];
  seams: SeamReport[];
  hardware: HwLine[];
  holes: Record<string, HoleRec[]>;
  fittings: Record<string, { pt: [number, number]; r: number; kind: string }[]>;
  thread: number;
  stitchLength: number;
  holeCount: number;
  decor: DecorResult | null;
  laserOK: boolean;
  /** Leather area by material, mm² (outlines less holes). */
  area: { main: number; second: number };
  notes: string[];
}
export type LeatherOutput = GenOutput & { info?: LeatherInfo };

const areaOf = (q: GenPart) => Math.abs(signedArea(q.outer)) - q.holes.reduce((k, h) => k + Math.abs(signedArea(h)), 0);
const m = (mm: number) => (mm / 1000).toFixed(mm < 10000 ? 2 : 1);

export function buildLeather(p: LeatherParams, _ctx: BuildContext): LeatherOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the leather thickness." };
  const s = { ...p.stitch };
  if (s.pitch < 2 || s.hole <= 0 || s.edge <= 0) return { parts: [], stats: [], error: "Set the stitch pitch, hole size and edge distance." };
  const pat = new Pattern(s, p.T, p.hw);
  pat.maxLen = Math.max(200, Math.max(p.bedW, p.bedH) - 30);
  const info = PRODUCTS[p.product];
  let size: [number, number, number];
  let fixed: Set<string> | null = null;
  try {
    switch (info.family) {
      case "box": size = buildBox(p, pat).size; break;
      case "wrap": size = buildWrap(p, pat).size; break;
      case "bucket": size = buildBucket(p, pat).size; break;
      case "folded": size = buildSculpt(p, pat).size; break;
      case "flat": { const r = buildSmall(p, pat); size = r.size; fixed = new Set(r.fixed); break; }
      default: { const r = buildStrap(p, pat); size = r.size; fixed = new Set(r.fixed); break; }
    }
  } catch (err) {
    return { parts: [], stats: [], error: err instanceof Error ? err.message : "These settings cannot be built." };
  }
  if (info.family !== "strap" && info.family !== "flat") { turnTall(pat, Math.min(p.bedW, p.bedH) - 30, pat.maxLen); splitLong(pat, pat.maxLen, Math.min(p.bedW, p.bedH) - 30); }

  // the loose pieces (straps, tabs, linings, patches) lie flat behind the product, in rows
  const positioned = (q: GenPart) => (fixed ? fixed.has(q.id) : pat.keep.has(q.id) || !!q.place?.m || !!q.views3d?.length);
  const rowW = Math.max(300, size[0]);
  let x = 0, y = -40, rowH = 0;
  for (const q of pat.parts) {
    if (positioned(q)) continue;
    const b = bboxOf([q.outer]), w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (x > 0 && x + w > rowW) { x = 0; y -= rowH + 20; rowH = 0; }
    q.place = { x: x - b.x0, y: y - h - b.y0, z: 0 };
    x += w + 20; rowH = Math.max(rowH, h);
  }

  const leather = leatherOf(p.leather);
  const laserOK = s.mode === "manual" || laserAllowed(leather, p.verified);
  const hardware = [...pat.hardware.values()];
  const holeCount = [...pat.holes.values()].reduce((k, l) => k + l.filter((h) => !h.what.endsWith(" mount")).length, 0);
  const area = { main: 0, second: 0 };
  for (const q of pat.parts) area[q.material === "second" ? "second" : "main"] += Math.max(0, areaOf(q));
  const second = pat.parts.some((q) => q.material === "second");
  const decor = (pat as Pattern & { decor?: DecorResult }).decor ?? null;

  const stats = [
    { label: "Product", value: `${info.name} (${info.complexity})` },
    { label: "Size", value: `${size.map((v) => Math.round(v)).join(" × ")} mm` },
    { label: "Parts", value: `${pat.parts.length}` },
    { label: "Stitching", value: `${STITCH_NAMES[s.type]}, ${s.pitch} mm pitch, ${holeCount} holes, ${pat.seams.length} lines` },
    { label: "Thread", value: `about ${m(pat.thread)} m (an estimate with tails; add 10 to 20 % spare)` },
    { label: "Leather", value: `${(area.main / 10000).toFixed(1)} dm² of ${leather.name}${second ? `, ${(area.second / 10000).toFixed(1)} dm² of ${p.product === "hybrid" ? "plywood" : "lining"}` : ""} (parts only, before waste)` },
    { label: "Hardware", value: hardware.length ? hardware.map((h) => `${h.qty} × ${HW_NAMES[h.kind]}`).join(", ") : "none" },
    { label: "Cut file", value: `${CUT_MODES[s.mode]}${s.mode !== "manual" && !laserOK ? " (blocked until the material is confirmed)" : ""}` },
    { label: "Laser", value: LASER_STATUS[leather.laser] },
  ];

  const assembly = [
    ...pat.steps,
    ...pat.notes.map((n) => `Note: ${n}`),
    ...(s.mode === "manual"
      ? ["Hand-cutting template: print at 100 % (check the scale bar), cut out with a knife, and punch the stitch holes with irons at the marks."]
      : s.mode === "marks" ? ["The laser only marks the stitch holes; punch them with pricking irons at the marks."] : []),
    ...(s.mode !== "manual" ? LASER_CHECKLIST.map((c) => `Laser safety: ${c}`) : []),
  ];

  const parts = pat.parts.map((q) => ({ ...q, labelAvoidScore: q.labelAvoidScore ?? true }));
  return {
    parts,
    stats,
    assembly,
    ...(second ? { materials: { main: leather.name, second: p.product === "hybrid" ? `Plywood ${p.build.woodT} mm` : `Lining ${p.build.liningT} mm` } } : {}),
    info: {
      product: p.product, size, seams: pat.seams, hardware,
      holes: Object.fromEntries(pat.holes), fittings: Object.fromEntries([...pat.fittings].map(([k, v]) => [k, v.map((f) => ({ pt: f.pt as [number, number], r: f.r, kind: f.kind }))])),
      thread: pat.thread, stitchLength: pat.stitchLength, holeCount, decor, laserOK, area, notes: pat.notes,
    },
  };
}
