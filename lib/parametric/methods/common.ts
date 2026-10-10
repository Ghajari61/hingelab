/** Pieces shared by the slicing methods: ids, section clean-up per plane family, report lines. */
import { minFeatureOf } from "../defaults";
import { cleanSection } from "../slice/clean";
import type { SectionSource } from "../slice/section";
import type { Crossing, ParametricParams, Part, Plane, Shape, Vec3, Warning } from "../types";

export interface MethodContext {
  bounds: { min: Vec3; max: Vec3 };
  sections: (frame: Plane) => SectionSource;
}

export interface MethodOut {
  planes: Plane[];
  sections: Shape[][];
  parts: Part[];
  warnings: Warning[];
  /** Method-specific assembly steps for the guide. */
  guide: string[];
  crossings?: Crossing[];
}

export const finId = (i: number, n: number, prefix = "F") => `${prefix}${String(i + 1).padStart(Math.max(2, String(n).length), "0")}`;
/** Suffixes for extra pieces of one plane: a, b, …, z, aa, ab, … */
export const pieceSuffix = (k: number): string => (k < 26 ? String.fromCharCode(97 + k) : pieceSuffix(Math.floor(k / 26) - 1) + pieceSuffix(k % 26));
/** Ids for the pieces of one plane, largest first: L07, or L07-a, L07-b, … */
export const pieceIds = (id: string, n: number) => Array.from({ length: n }, (_, j) => (n > 1 ? `${id}-${pieceSuffix(j)}` : id));

export const axisVec = (a: "X" | "Y" | "Z"): Vec3 => (a === "X" ? [1, 0, 0] : a === "Y" ? [0, 1, 0] : [0, 0, 1]);
export const axisIndex = (a: "X" | "Y" | "Z") => (a === "X" ? 0 : a === "Y" ? 1 : 2);

export interface CleanTally {
  removed: number;
  dropped: number;
  openChains: number;
  removedIds: string[];
}

export const newTally = (): CleanTally => ({ removed: 0, dropped: 0, openChains: 0, removedIds: [] });

/**
 * Section a family of parallel planes (sharing one frame) and clean every section.
 * `clipToWall` keeps only w ≥ 0 (wall-mounted methods).
 */
export function sliceFamily(p: ParametricParams, ctx: MethodContext, planes: Plane[], ids: string[], clipToWall: boolean, t: CleanTally): Shape[][] {
  if (!planes.length) return [];
  const src = ctx.sections(planes[0]);
  const raw = src.slice(planes.map(pl => pl.offset));
  src.dispose();
  return raw.map((r, i) => {
    t.openChains += r.openChains;
    const c = cleanSection(r.loops, {
      evenOdd: src.engine === "fallback",
      clipToWall,
      chordTolerance: p.quality.chordTolerance,
      smoothing: p.quality.smoothing,
      minFeature: minFeatureOf(p),
      minIslandArea: p.quality.minIslandArea,
    });
    if (c.featuresRemoved) t.removedIds.push(ids[i]);
    t.removed += c.featuresRemoved;
    t.dropped += c.islandsDropped;
    return c.shapes;
  });
}

/** Report lines for the clean-up tally (same wording for every method). */
export function tallyWarnings(p: ParametricParams, t: CleanTally): Warning[] {
  const out: Warning[] = [];
  if (t.openChains) out.push({ code: "NON_MANIFOLD_SECTION", message: `${t.openChains} open section outlines were closed with a straight edge; check those parts.` });
  if (t.removed) out.push({ code: "MIN_FEATURE_REMOVED", message: `${t.removed} details thinner than ${minFeatureOf(p).toFixed(1)} mm were removed.`, partIds: [...new Set(t.removedIds)] });
  if (t.dropped) out.push({ code: "ISLAND_DROPPED", message: `${t.dropped} tiny pieces under ${p.quality.minIslandArea} mm² were left out.` });
  return out;
}

/** Range of an id list for the guide: "L01–L40". */
export const idRange = (ids: string[]) => (!ids.length ? "" : ids.length === 1 ? ids[0] : `${ids[0]}–${ids[ids.length - 1]}`);
