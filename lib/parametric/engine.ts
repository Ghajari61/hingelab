/**
 * Parametric engine: source mesh → planes → cleaned sections → parts. manifold-3d is injected
 * (the worker loads it from /manifold, tests from node_modules).
 */
import type { ManifoldToplevel } from "manifold-3d";
import { LIMITS } from "./defaults";
import { sliceParallel } from "./methods/parallel";
import { libraryMesh } from "./source/library";
import { bounds, formatOf, parseMeshFile, prepareMesh, type PreparedMesh } from "./source/mesh";
import { fallbackSections, manifoldSections, tryManifold, type SectionSource } from "./slice/section";
import type { Contour, LibraryId, ParametricParams, Plane, SliceResult, Stats, Warning } from "./types";

/** Library reliefs are authored with their flat back on the wall; solids are centred on the origin. */
const WALL_SHAPES: LibraryId[] = ["abstract-head-cc0", "wave-panel", "ripple"];

/** Build the normalised source mesh for the params (and the file bytes for an imported mesh). */
export async function loadSource(p: ParametricParams, file?: ArrayBuffer): Promise<PreparedMesh> {
  const s = p.source;
  if (s.kind === "library") {
    return prepareMesh(libraryMesh(s.id, s.detail ?? 5), p.sourceSettings, { units: "mm", upAxis: "Y", anchor: WALL_SHAPES.includes(s.id) ? "wall" : "centre" });
  }
  const fmt = formatOf(s.fileName);
  if (!fmt) throw new Error("Use an STL, OBJ or GLB file.");
  if (!file) throw new Error("The model file is missing.");
  return prepareMesh(await parseMeshFile(file, fmt), p.sourceSettings, { units: s.units, upAxis: s.upAxis, anchor: "centre" });
}

const perimeter = (c: Contour) => c.reduce((a, q, i) => { const r = c[(i + 1) % c.length]; return a + Math.hypot(r[0] - q[0], r[1] - q[1]); }, 0);

export function computeParametric(p: ParametricParams, src: PreparedMesh, wasm: ManifoldToplevel): SliceResult {
  const b = bounds(src.mesh);
  const ext = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  if (!(ext > 0)) throw new Error("The model is empty.");
  if (ext > LIMITS.maxModelExtent) throw new Error(`The model is ${Math.round(ext)} mm across; the limit is ${LIMITS.maxModelExtent} mm. Scale it down.`);

  const warnings: Warning[] = [...src.warnings];
  const solid = src.openEdges === 0 ? tryManifold(wasm, src.mesh) : null;
  if (!solid && src.openEdges === 0) warnings.push({ code: "NON_MANIFOLD", message: "The mesh could not be read as a closed solid; it was sliced with the fallback section method." });
  const engine: SliceResult["engine"] = solid ? "manifold" : "fallback";
  const sections = (pl: Plane): SectionSource => (solid ? manifoldSections(wasm, solid, pl.u, pl.w, pl.normal) : fallbackSections(src.mesh, pl.u, pl.w, pl.normal));

  try {
    if (p.method !== "parallel") {
      warnings.push({ code: "METHOD_NOT_READY", message: "This method is not available yet; showing parallel fins." });
    }
    const out = sliceParallel(p, b, sections);
    warnings.push(...out.warnings);
    if (out.parts.length > LIMITS.maxParts) warnings.push({ code: "TOO_MANY_PARTS", message: `This design has ${out.parts.length} parts; the limit is ${LIMITS.maxParts}. Increase the spacing.` });
    const stats: Stats = {
      partCount: out.parts.length,
      planeCount: out.planes.length,
      cutLength: out.parts.reduce((a, q) => a + perimeter(q.shape.outer) + q.shape.holes.reduce((h, c) => h + perimeter(c), 0) + q.innerCuts.reduce((h, c) => h + perimeter(c), 0), 0),
      partArea: out.parts.reduce((a, q) => a + q.shape.area, 0),
    };
    return { planes: out.planes, sections: out.sections, parts: out.parts, warnings, stats, bounds: b, engine };
  } finally {
    solid?.delete();
  }
}
