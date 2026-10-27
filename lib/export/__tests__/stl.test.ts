import {generatedTable} from "@/lib/photoproduct/__tests__/generated-fixture";
import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { makeSTLExport } from "../bundle";
import { defaultExport } from "../profiles";
import { loopsToSTL, svgToSTL } from "../stl";

/** Triangles of a binary STL, and the volume they enclose (positive when every face points outward). */
function read(data: Uint8Array) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = dv.getUint32(80, true);
  let vol = 0, up = 0, down = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    const nz = dv.getFloat32(o + 8, true);
    const v = [0, 1, 2].map((k) => [0, 1, 2].map((j) => dv.getFloat32(o + 12 + k * 12 + j * 4, true)));
    const [a, b, c] = v;
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    if (nz > 0.99) up++; else if (nz < -0.99) down++;
  }
  return { n, vol, up, down, size: data.byteLength };
}

describe("STL export", () => {
  it("extrudes a plate with a hole to the right volume, faces outward", () => {
    const sq = (x: number, y: number, w: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];
    const r = loopsToSTL([sq(0, 0, 40), sq(10, 10, 20)], 3);
    const s = read(r.data);
    expect(r.pieces).toBe(1);
    expect(s.size).toBe(84 + s.n * 50);
    expect(s.vol).toBeCloseTo((40 * 40 - 20 * 20) * 3, 3);
    expect(s.up).toBe(s.down);
  });

  it("reads the cut layers of an SVG and leaves the engraving out", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="100mm" height="100mm" viewBox="0 0 100 100">
<g inkscape:groupmode="layer" inkscape:label="03 Outline cut" fill="none" stroke="#FF0000"><path d="M0 0 H50 V50 H0 Z"/></g>
<g inkscape:groupmode="layer" inkscape:label="02 Inner cuts" fill="none" stroke="#00E000"><circle cx="25" cy="25" r="5"/></g>
<g inkscape:groupmode="layer" inkscape:label="00 Engrave" fill="#000000" stroke="none"><path d="M5 5 H10 V10 H5 Z"/></g></svg>`;
    const s = read(svgToSTL(svg, 2).data);
    expect(s.vol).toBeGreaterThan(2 * (2500 - Math.PI * 25) * 0.99);
    expect(s.vol).toBeLessThan(2 * (2500 - Math.PI * 25) * 1.01);
  });

  it("every generator's default design exports as a closed STL", async () => {
    for (const def of ALL_GENERATORS) {
      const p = def.merge(def.id === "photoproduct" ? {recipe:"custom",generated:generatedTable(),size:{width:150,depth:100,height:100}} : {});
      const lay = arrangeGenerator(def, p, CTX).lay!;
      const r = await makeSTLExport(genSVG(def, p, lay), { ...defaultExport(), format: "stl" }, "x", p.T);
      expect(r.file.name, def.id).toBe("x.stl");
      const s = read(r.file.data as Uint8Array);
      expect(s.n, def.id).toBeGreaterThan(12);
      expect(s.vol, def.id).toBeGreaterThan(0);
    }
  });
});
