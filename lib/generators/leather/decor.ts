/**
 * Decoration on a panel: original procedural patterns, perforated, engraved or scored, clipped to
 * the panel inside a safe margin from every edge, stitch line and fitting.
 *
 * The styles are HingeLab's own patterns in the spirit of each tradition (built from the shared
 * fretwork and motif library); none copies a commercial design.
 */
import { cleanContour, intersectShapes } from "@/lib/letters/polygon";

/** Most points the decoration on one panel may have (the cut file and nesting slow down past this). */
const MAX_POINTS = 12000;
/** Most repeats of a detailed motif on one panel. */
const MAX_MOTIFS = 90;
import { fretHoles } from "../fretwork";
import type { FretKind } from "../fretKinds";
import { bboxOf, circle, pointInContour, signedArea, distToContour } from "../geom";
import { motif, type MotifId } from "../motifs";
import type { Contour, GenPart } from "../types";
import type { Pattern } from "./kit";
import { ccw, offsetContour } from "./path";
import type { DecorStyle, LeatherParams } from "./params";

const STYLE: Record<Exclude<DecorStyle, "none" | "parametric">, { kind: FretKind; unit?: MotifId; cell?: number }> = {
  "persian-geometric": { kind: "motif", unit: "girih" }, "persian-floral": { kind: "floral" }, "iranian-boteh": { kind: "motif", unit: "paisley" },
  moroccan: { kind: "quatrefoil" }, "islamic-star": { kind: "stars" }, "japanese-kikko": { kind: "honeycomb" }, "japanese-minimal": { kind: "circles", cell: 1.6 },
  "art-deco": { kind: "motif", unit: "sun" }, "art-nouveau": { kind: "leaves" }, western: { kind: "motif", unit: "flower" }, scandinavian: { kind: "lattice", cell: 1.3 },
  european: { kind: "motif", unit: "fleur" }, celtic: { kind: "motif", unit: "triquetra" }, botanical: { kind: "motif", unit: "leaf" }, modern: { kind: "lattice" },
  luxury: { kind: "motif", unit: "gem" },
};

export interface DecorResult { shapes: number; area: number; region: number }

/** Decorates a part inside `region` (in the part's frame), below `top`. */
export function decorate(p: LeatherParams, pat: Pattern, part: GenPart, region: Contour, top = 0): DecorResult | null {
  const d = p.decor;
  if (d.style === "none") return null;
  const safe = pat.s.edge + pat.s.hole / 2 + Math.max(1, d.margin);
  const inner = offsetContour(part.outer, -safe);
  if (!inner) return null;
  const clipped = intersectShapes([ccw(inner)], [ccw(region)]);
  if (!clipped.length) return null;
  const clip = clipped.reduce((a, b) => (b.area > a.area ? b : a)).outer;
  const bb = bboxOf([clip]);
  const y0 = Math.max(bb.y0, top);
  if (bb.x1 - bb.x0 < 12 || bb.y1 - y0 < 12) return null;
  // keep clear of every hole already in the part (stitching, fittings) by the margin
  const keep = (pat.holes.get(part.id) ?? []).map((h) => ({ x0: h.pt[0] - h.r - d.margin, y0: h.pt[1] - h.r - d.margin, x1: h.pt[0] + h.r + d.margin, y1: h.pt[1] + h.r + d.margin }));
  for (const f of pat.fittings.get(part.id) ?? []) keep.push({ x0: f.pt[0] - f.r - d.margin, y0: f.pt[1] - f.r - d.margin, x1: f.pt[0] + f.r + d.margin, y1: f.pt[1] + f.r + d.margin });
  const cell = Math.max(6, d.scale), bar = Math.max(0.8, d.bar);
  let shapes: Contour[];
  if (d.style === "parametric") {
    // rings of round holes, largest at the centre and fading out toward the edges
    shapes = [];
    const cx = (bb.x0 + bb.x1) / 2, cy = (y0 + bb.y1) / 2, R = Math.hypot(bb.x1 - cx, bb.y1 - cy);
    for (let ring = 0; ring * cell * 0.7 < R; ring++) {
      const rr = ring * cell * 0.7, n = ring === 0 ? 1 : Math.floor((2 * Math.PI * rr) / (cell * 0.7));
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n + (ring % 2) * (Math.PI / Math.max(1, n));
        const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a), hr = Math.max(0.6, (cell * 0.32) * (1 - rr / (R * 1.15)));
        if (y - hr < y0 || !pointInContour([x, y], clip) || distToContour([x, y], clip) < hr + 0.2) continue;
        if (keep.some((k) => x + hr > k.x0 && x - hr < k.x1 && y + hr > k.y0 && y - hr < k.y1)) continue;
        shapes.push(circle(x, y, hr, 0.05));
      }
    }
  } else {
    const st = STYLE[d.style];
    // detailed motifs make heavy cut files: simplify the outlines, and grow the repeat until the
    // decoration stays under a fixed number of points
    let c = cell * (st.cell ?? 1);
    if (st.unit) c = Math.max(c, Math.sqrt(((bb.x1 - bb.x0) * (bb.y1 - y0)) / MAX_MOTIFS));
    for (let k = 0; ; k++) {
      shapes = fretHoles({ kind: st.kind, cell: c, bar, ...(st.unit ? { unit: motif(st.unit, 100) } : {}) }, bb.x0, y0, bb.x1, bb.y1, keep, undefined, clip)
        .map((q) => cleanContour(q, 0.25)).filter((q) => q.length >= 3);
      if (shapes.reduce((n, q) => n + q.length, 0) <= MAX_POINTS || k >= 5) break;
      c *= 1.35;
    }
  }
  if (!shapes.length) return null;
  const mode = pat.s.mode === "manual" && d.mode === "perforate" ? "score" : d.mode;
  if (mode === "perforate") part.holes.push(...shapes);
  else if (mode === "engrave") (part.engrave ??= []).push(...shapes);
  else (part.score ??= []).push(...shapes.map((c) => [...c, c[0]]));
  const area = shapes.reduce((k, c) => k + Math.abs(signedArea(c)), 0), regionArea = Math.abs(signedArea(clip));
  const res = { shapes: shapes.length, area, region: regionArea };
  (pat as Pattern & { decor?: DecorResult }).decor = res;
  return res;
}
