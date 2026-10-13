/**
 * Cut-safety for AI Studio results, in the products' issue model (lib/issues): every problem comes
 * with fixes that are new vectorize settings, so "Fix all" re-runs the vectorizer with them.
 */
import type { Issue } from "@/lib/issues";
import { flatten } from "@/lib/studio/geom";
import type { Bitmap } from "@/lib/studio/trace/raster";
import { components, openBitmap } from "./morph";
import { vectorizeBitmap, type Vectorized, type VectorizeOptions } from "./vectorize";

export interface SafetyContext {
  /** Machine bed (or sheet), mm. */
  bedW: number;
  bedH: number;
  /** Thinnest part the material keeps, mm. */
  minFeatureMm: number;
  /** cut: the ink is the part; stencil: the ink is cut away from a sheet; engrave: nothing is cut out. */
  use: "cut" | "stencil" | "engrave";
}

/** Thinnest safe part for a material thickness: about a third of it, at least 0.8 mm. */
export const safeFeature = (thicknessMm: number) => Math.round(Math.max(0.8, thicknessMm * 0.35) * 10) / 10;

const MARGIN = 10;
/** Nodes above which a result counts as very detailed. */
export const DENSE_NODES = 25_000;

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function cutSafety(v: Vectorized, p: VectorizeOptions, ctx: SafetyContext): Issue<VectorizeOptions>[] {
  const out: Issue<VectorizeOptions>[] = [];
  if (!v.subpaths.length) {
    out.push({
      code: "empty", level: "error", message: "Nothing to cut: no part of the image is dark enough at this cut-off.",
      fixes: p.source === "edges" ? [] : [{ id: "threshold", label: "Raise the cut-off", safe: false, apply: (q) => ({ ...q, threshold: Math.min(0.95, q.threshold + 0.15) }) }],
    });
    return out;
  }
  const fitW = Math.min(ctx.bedW - MARGIN, ((ctx.bedH - MARGIN) * v.widthMm) / v.heightMm);
  if (v.widthMm > ctx.bedW + 0.01 || v.heightMm > ctx.bedH + 0.01) {
    out.push({
      code: "bed", level: "error",
      message: `Bigger than the bed: ${Math.round(v.widthMm)} × ${Math.round(v.heightMm)} mm on a ${Math.round(ctx.bedW)} × ${Math.round(ctx.bedH)} mm bed.`,
      fixes: fitW > 5 ? [{ id: "fit", label: `Scale to ${Math.floor(fitW)} mm wide`, safe: true, apply: (q) => ({ ...q, widthMm: Math.floor(fitW) }) }] : [],
    });
  }
  const cutting = ctx.use !== "engrave" && !v.lines;
  if (cutting && ctx.minFeatureMm > 0) {
    const r = (ctx.minFeatureMm * v.pxPerMm) / 2;
    const opened = openBitmap(v.bitmap, r);
    let lost = 0, ink = 0;
    for (let i = 0; i < opened.bits.length; i++) { ink += v.bitmap.bits[i]; if (v.bitmap.bits[i] && !opened.bits[i]) lost++; }
    const minLost = Math.max(4, (ctx.minFeatureMm * v.pxPerMm) ** 2, ink * 0.002);
    if (lost >= minLost) {
      const x = ctx.minFeatureMm;
      out.push({
        code: "thin", level: "warn",
        message: `Some parts are thinner than ${x} mm (about ${Math.round(lost / v.pxPerMm ** 2)} mm² in all): they can burn away or snap.`,
        fixes: [
          { id: "remove-thin", label: `Remove parts thinner than ${x} mm`, safe: true, apply: (q) => ({ ...q, minFeatureMm: Math.max(q.minFeatureMm, x) }) },
          { id: "thicken", label: `Thicken by ${Math.round((x / 2) * 10) / 10} mm`, safe: false, apply: (q) => ({ ...q, thickenMm: Math.round((q.thickenMm + x / 2) * 10) / 10 }) },
        ],
      });
    }
  }
  if (cutting && ctx.use === "cut" && p.connect !== "islands") {
    const n = components(v.bitmap, 1).sizes.length;
    if (n > 1) out.push({
      code: "islands", level: "warn", message: `${plural(n, "separate piece")}: everything but the largest falls out as a loose part.`,
      fixes: [{ id: "bridge", label: "Join the pieces with bridges", safe: true, apply: (q) => ({ ...q, connect: "islands" }) }],
    });
  }
  if (cutting && ctx.use === "stencil" && p.connect !== "holes") {
    const c = components(v.bitmap, 0), n = c.border.filter((e) => !e).length;
    if (n > 0) out.push({
      code: "pockets", level: "warn", message: `${plural(n, "enclosed pocket")} (like the middle of an O) would fall out of the stencil.`,
      fixes: [{ id: "bridge", label: "Add stencil bridges", safe: true, apply: (q) => ({ ...q, connect: "holes" }) }],
    });
  }
  const nodes = v.subpaths.reduce((a, s) => a + s.nodes.length, 0);
  if (nodes > DENSE_NODES) out.push({
    code: "dense", level: "info", message: `Very detailed (${nodes.toLocaleString("en")} nodes): it cuts slowly.`,
    fixes: [{ id: "simplify", label: "Simplify the outlines", safe: false, apply: (q) => ({ ...q, optimize: Math.min(5, q.optimize + 1), minAreaMm2: Math.max(q.minAreaMm2, 2) }) }],
  });
  return out;
}

/** The check for one image's ink: vectorizes with the given settings, then checks the result. */
export const safetyCheck = (ink: Bitmap, ctx: SafetyContext) => (p: VectorizeOptions) => cutSafety(vectorizeBitmap(ink, p), p, ctx);

/** Total cut length of a result, mm (for the stats line). */
export const cutLength = (v: Vectorized) => v.subpaths.reduce((a, s) => {
  const pts = flatten(s, 0.05);
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (s.closed && pts.length > 1) l += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return a + l;
}, 0);
