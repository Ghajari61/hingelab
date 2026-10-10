import { describe, expect, it } from "vitest";
import { PARAMETRIC_DEFAULTS } from "../defaults";
import { bounds, diagonal, normalise, openEdgeCount, parseMeshFile, prepareMesh, unitsScale, weld } from "../source/mesh";
import type { MeshData, SourceSettings } from "../types";

const CUBE_V = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]];
const CUBE_F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];

function binaryStl(): ArrayBuffer {
  const buf = new ArrayBuffer(84 + CUBE_F.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, CUBE_F.length, true);
  CUBE_F.forEach((f, i) => {
    const o = 84 + i * 50 + 12;
    f.forEach((v, k) => CUBE_V[v].forEach((c, a) => dv.setFloat32(o + k * 12 + a * 4, c, true)));
  });
  return buf;
}

const settings = (): SourceSettings => structuredClone(PARAMETRIC_DEFAULTS.sourceSettings);

describe("parametric mesh source", () => {
  it("parses a binary STL into one closed cube after welding", async () => {
    const raw = await parseMeshFile(binaryStl(), "stl");
    expect(raw.indices.length).toBe(36);
    const w = weld(raw, 1e-4 * diagonal(raw));
    expect(w.positions.length / 3).toBe(8);
    expect(w.indices.length / 3).toBe(12);
    expect(openEdgeCount(w)).toBe(0);
  });

  it("parses an OBJ (quads are triangulated)", async () => {
    const obj = ["v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0", "f 1 2 3 4"].join("\n");
    const m = await parseMeshFile(new TextEncoder().encode(obj).buffer as ArrayBuffer, "obj");
    expect(m.indices.length / 3).toBe(2);
    const w = weld(m, 1e-6);
    expect(openEdgeCount(w)).toBe(4);
  });

  it("weld drops degenerate triangles", () => {
    const m: MeshData = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2, 0, 1, 3]) };
    expect(weld(m, 1e-6).indices.length).toBe(3);
  });

  it("auto units assume mm for diagonals 5–5000 and ask otherwise", () => {
    expect(unitsScale("auto", 100)).toEqual({ scale: 1, ask: false });
    expect(unitsScale("auto", 1.2).ask).toBe(true);
    expect(unitsScale("in", 1).scale).toBe(25.4);
  });

  it("normalise: units, Z-up to Y-up, centring, target size", () => {
    const m: MeshData = { positions: new Float32Array(CUBE_V.map(([x, y, z]) => [x, y, z * 2]).flat()), indices: new Uint32Array(CUBE_F.flat()) };
    const s = settings();
    const a = normalise(m, s, { units: "cm", upAxis: "Z", anchor: "centre" }).mesh;
    const b = bounds(a);
    expect(b.max[1] - b.min[1]).toBeCloseTo(200, 4);
    expect(b.max[0] + b.min[0]).toBeCloseTo(0, 4);
    expect(b.max[2] + b.min[2]).toBeCloseTo(0, 4);
    s.targetSize = { axis: "width", value: 50 };
    const c = bounds(normalise(m, s, { units: "mm", upAxis: "Y", anchor: "wall" }).mesh);
    expect(c.max[0] - c.min[0]).toBeCloseTo(50, 4);
    expect(c.min[2]).toBeCloseTo(0, 4);
  });

  it("prepareMesh reports open edges", async () => {
    const open: MeshData = { positions: new Float32Array(CUBE_V.flat()), indices: new Uint32Array(CUBE_F.slice(2).flat()) };
    const r = await prepareMesh(open, settings(), { units: "mm", upAxis: "Y", anchor: "centre" });
    expect(r.openEdges).toBe(4);
    expect(r.warnings.map(w => w.code)).toContain("NON_MANIFOLD");
  });

  it("meshes over the slice budget are simplified with the error reported", async () => {
    const { icosphere } = await import("../source/library");
    const { simplifyToBudget } = await import("../source/mesh");
    const big = icosphere(100, 6);
    const r = await simplifyToBudget(big, 5000);
    expect(r).not.toBeNull();
    expect(r!.mesh.indices.length / 3).toBeLessThanOrEqual(5000);
    expect(r!.error).toBeGreaterThan(0);
    expect(r!.error).toBeLessThan(5);
  });
});
