/**
 * Parametric engine: source mesh → planes → cleaned sections → parts → kerf → sheets.
 * manifold-3d is injected (the worker loads it from /manifold, tests from node_modules).
 */
import type { ManifoldToplevel, Manifold as ManifoldT } from "manifold-3d";
import { staircaseProjection } from "./backboard";
import { finSpacingOf, LIMITS } from "./defaults";
import { kerfPart } from "./joints";
import { polylineLength } from "./label";
import { sliceParallel } from "./methods/parallel";
import { sliceStacked } from "./methods/stacked";
import { sliceWaffle } from "./methods/waffle";
import { nestParts } from "./nest";
import { formulaHeightfield, formulaRevolution } from "./source/formula";
import { libraryMesh } from "./source/library";
import { bounds, formatOf, parseMeshFile, prepareMesh, type PreparedMesh } from "./source/mesh";
import { fallbackSections, manifoldSections, tryManifold, type SectionSource } from "./slice/section";
import type { Contour, LibraryId, ParametricParams, Plane, Shape, SliceResult, Stats, Warning } from "./types";

/** Library reliefs are authored with their flat back on the wall; solids are centred on the origin. */
const WALL_SHAPES: LibraryId[] = ["abstract-head-cc0", "wave-panel", "ripple"];

/** Build the normalised source mesh for the params (and the file bytes for an imported mesh). */
export async function loadSource(p: ParametricParams, file?: ArrayBuffer): Promise<PreparedMesh> {
  const s = p.source;
  if (s.kind === "library") {
    return prepareMesh(libraryMesh(s.id, s.detail ?? 5), p.sourceSettings, { units: "mm", upAxis: "Y", anchor: WALL_SHAPES.includes(s.id) ? "wall" : "centre" });
  }
  if (s.kind === "formula") {
    if (s.type === "heightfield") {
      const { mesh, lift } = formulaHeightfield(s);
      const r = await prepareMesh(mesh, p.sourceSettings, { units: "mm", upAxis: "Y", anchor: "wall" });
      return { ...r, lift };
    }
    return prepareMesh(formulaRevolution(s), p.sourceSettings, { units: "mm", upAxis: "Y", anchor: "centre" });
  }
  const fmt = formatOf(s.fileName);
  if (!fmt) throw new Error("Use an STL, OBJ or GLB file.");
  if (!file) throw new Error("The model file is missing. Import it again.");
  return prepareMesh(await parseMeshFile(file, fmt), p.sourceSettings, { units: s.units, upAxis: s.upAxis, anchor: "centre" });
}

const perimeter = (c: Contour) => c.reduce((a, q, i) => { const r = c[(i + 1) % c.length]; return a + Math.hypot(r[0] - q[0], r[1] - q[1]); }, 0);

/** Footprint of the model's z ≥ 0 part on the wall, model XY. */
function manifoldProjection(solid: ManifoldT): Contour[] {
  const front = solid.trimByPlane([0, 0, 1], 0);
  try {
    if (front.isEmpty()) return [];
    const cs = front.project();
    const polys = cs.toPolygons().map(poly => poly.map(([x, y]) => [x, y] as [number, number]));
    cs.delete();
    return polys;
  } finally {
    front.delete();
  }
}

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
  const projection = (planes: Plane[], secs: Shape[][]): Contour[] => {
    if (solid) { const pr = manifoldProjection(solid); if (pr.length) return pr; }
    return staircaseProjection(planes, secs, finSpacingOf(p));
  };

  try {
    const ctx = { bounds: b, sections };
    if (p.method === "radial" || p.method === "curveNormal") warnings.push({ code: "METHOD_NOT_READY", message: "This method is not available yet; showing parallel fins." });
    const out = p.method === "stacked" ? sliceStacked(p, ctx) : p.method === "waffle" ? sliceWaffle(p, ctx) : sliceParallel(p, { ...ctx, projection });
    warnings.push(...out.warnings);
    if (out.parts.length > LIMITS.maxParts) warnings.push({ code: "TOO_MANY_PARTS", message: `This would make ${out.parts.length} parts. Increase spacing or reduce size (limit ${LIMITS.maxParts}).` });

    for (const part of out.parts) part.cut = kerfPart(part, p.material.K);
    const nest = nestParts(out.parts.map(q => ({ id: q.id, outline: q.cut!.outline, area: q.shape.area })), p.material);
    for (const id of nest.tooBig) warnings.push({ code: "PART_TOO_BIG", message: `${id} is larger than the sheet. Scale the model down, use a bigger sheet, or enable splitting.`, partIds: [id] });
    if (nest.sheets.length > LIMITS.maxSheets) warnings.push({ code: "TOO_MANY_SHEETS", message: `This needs ${nest.sheets.length} sheets; the limit is ${LIMITS.maxSheets}. Use bigger sheets or a smaller model.` });

    const partArea = out.parts.reduce((a, q) => a + q.shape.area, 0);
    const stats: Stats = {
      partCount: out.parts.length,
      planeCount: out.planes.length,
      sheetCount: nest.sheets.length,
      cutLength: out.parts.reduce((a, q) => a + q.cut!.outline.reduce((h, c) => h + perimeter(c), 0) + q.cut!.inner.reduce((h, c) => h + perimeter(c), 0), 0),
      engraveLength: out.parts.reduce((a, q) => a + q.engrave.reduce((h, c) => h + polylineLength(c), 0), 0),
      partArea,
      materialUsage: nest.sheets.length ? partArea / nest.sheets.reduce((a, s) => a + s.width * s.height, 0) : 0,
    };
    return { planes: out.planes, sections: out.sections, parts: out.parts, sheets: nest.sheets, warnings, stats, guide: out.guide, crossings: out.crossings, bounds: b, engine };
  } finally {
    solid?.delete();
  }
}
