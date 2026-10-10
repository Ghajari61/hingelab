/**
 * Parallel fins: planes stacked along X or Y, each section standing out of the wall (w ≥ 0).
 * Part-local coordinates are (u, w) of the plane frame: the wall edge lies on y = 0.
 */
import { finSpacingOf, minFeatureOf } from "../defaults";
import { cleanSection } from "../slice/clean";
import { parallelPlanes, placementOf } from "../slice/planes";
import type { SectionSource } from "../slice/section";
import type { ParametricParams, Part, Plane, Shape, Vec3, Warning } from "../types";

export interface ParallelOut {
  planes: Plane[];
  sections: Shape[][];
  parts: Part[];
  warnings: Warning[];
}

export const finId = (i: number, n: number) => `F${String(i + 1).padStart(Math.max(2, String(n).length), "0")}`;
/** Suffixes for extra pieces of one fin: a, b, …, z, aa, ab, … */
export const pieceSuffix = (k: number): string => (k < 26 ? String.fromCharCode(97 + k) : pieceSuffix(Math.floor(k / 26) - 1) + pieceSuffix(k % 26));

export function sliceParallel(p: ParametricParams, bounds: { min: Vec3; max: Vec3 }, sections: (frame: Plane) => SectionSource): ParallelOut {
  const axis = p.parallel.axis;
  const k = axis === "X" ? 0 : 1;
  const spacing = finSpacingOf(p);
  const planes = parallelPlanes(axis, bounds.min[k], bounds.max[k], spacing, Math.min(1, Math.max(0, p.parallel.phase)));
  const warnings: Warning[] = [];
  if (!planes.length) return { planes, sections: [], parts: [], warnings };

  const src = sections(planes[0]);
  const raw = src.slice(planes.map(pl => pl.offset));
  src.dispose();

  const minFeature = minFeatureOf(p);
  const sectionsOut: Shape[][] = [];
  const parts: Part[] = [];
  let removed = 0, dropped = 0, openChains = 0;
  const shortIds: string[] = [];
  const removedIds: string[] = [];
  raw.forEach((r, i) => {
    openChains += r.openChains;
    const c = cleanSection(r.loops, {
      evenOdd: src.engine === "fallback",
      clipToWall: true,
      chordTolerance: p.quality.chordTolerance,
      smoothing: p.quality.smoothing,
      minFeature,
      minIslandArea: p.quality.minIslandArea,
    });
    const id = finId(i, planes.length);
    if (c.featuresRemoved) removedIds.push(id);
    removed += c.featuresRemoved;
    dropped += c.islandsDropped;
    sectionsOut.push(c.shapes);
    const pieces = c.shapes
      .filter(s => {
        const h = s.bbox.y1;
        if (h >= p.parallel.minFinHeight) return true;
        shortIds.push(id);
        return false;
      })
      .sort((a, b) => b.area - a.area);
    pieces.forEach((s, j) => {
      parts.push({
        id: pieces.length > 1 ? `${id}-${pieceSuffix(j)}` : id,
        kind: "fin",
        shape: s,
        innerCuts: [],
        engrave: [],
        placement: placementOf(planes[i]),
        plane: i,
        neighbors: [],
      });
    });
  });

  for (let i = 0; i < parts.length; i++) {
    const pl = parts[i].plane;
    parts[i].neighbors = parts.filter(q => q !== parts[i] && Math.abs(q.plane - pl) === 1).map(q => q.id);
  }

  if (openChains) warnings.push({ code: "NON_MANIFOLD_SECTION", message: `${openChains} open section outlines were closed with a straight edge; check those fins.` });
  if (removed) warnings.push({ code: "MIN_FEATURE_REMOVED", message: `${removed} details thinner than ${minFeature.toFixed(1)} mm were removed.`, partIds: [...new Set(removedIds)] });
  if (dropped) warnings.push({ code: "ISLAND_DROPPED", message: `${dropped} pieces or holes smaller than ${p.quality.minIslandArea} mm² were left out.` });
  if (shortIds.length) warnings.push({ code: "SHORT_FIN_DROPPED", message: `${shortIds.length} fin pieces lower than ${p.parallel.minFinHeight} mm were left out.`, partIds: [...new Set(shortIds)] });
  const floating = parts.filter(q => q.shape.bbox.y0 > 1e-3).map(q => q.id);
  if (floating.length) warnings.push({ code: "FLOATING_PIECE", message: `${floating.length} pieces do not touch the wall.`, partIds: floating });
  return { planes, sections: sectionsOut, parts, warnings };
}
