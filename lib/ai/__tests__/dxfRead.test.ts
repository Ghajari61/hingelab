import { describe, expect, it } from "vitest";
import { DxfError, dxfToSvg, readDxf } from "../dxfRead";
import { cleanExampleSvg } from "../exampleFiles";

const dxf = (entities: (string | number)[][], opts: { units?: number; blocks?: (string | number)[][] } = {}) => {
  const out: (string | number)[] = [];
  const add = (rows: (string | number)[][]) => rows.forEach((r) => out.push(...r));
  if (opts.units != null) add([[0, "SECTION"], [2, "HEADER"], [9, "$INSUNITS"], [70, opts.units], [0, "ENDSEC"]]);
  if (opts.blocks) add([[0, "SECTION"], [2, "BLOCKS"], ...opts.blocks, [0, "ENDSEC"]]);
  add([[0, "SECTION"], [2, "ENTITIES"], ...entities, [0, "ENDSEC"], [0, "EOF"]]);
  return out.join("\n");
};

const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

describe("readDxf", () => {
  it("reads lines in mm with y pointing down", () => {
    const d = readDxf(dxf([[0, "LINE"], [8, "0"], [10, 10], [20, 10], [11, 110], [21, 60]], { units: 4 }));
    expect(d.width).toBeCloseTo(100);
    expect(d.height).toBeCloseTo(50);
    expect(d.lines[0].pts).toEqual([[0, 50], [100, 0]]);
  });

  it("scales inches and keeps believable centimetres", () => {
    expect(readDxf(dxf([[0, "LINE"], [10, 0], [20, 0], [11, 2], [21, 1]], { units: 1 })).width).toBeCloseTo(50.8);
    expect(readDxf(dxf([[0, "LINE"], [10, 0], [20, 0], [11, 30], [21, 10]], { units: 5 })).width).toBeCloseTo(300);
    // 3000 cm would be 30 m: the numbers are millimetres.
    expect(readDxf(dxf([[0, "LINE"], [10, 0], [20, 0], [11, 3000], [21, 10]], { units: 5 })).width).toBeCloseTo(3000);
  });

  it("draws circles and arcs within a twentieth of a millimetre", () => {
    const d = readDxf(dxf([[0, "CIRCLE"], [10, 50], [20, 50], [40, 20], [0, "ARC"], [10, 50], [20, 50], [40, 30], [50, 0], [51, 90]], { units: 4 }));
    const [circle, arc] = d.lines;
    expect(circle.closed).toBe(true);
    // Circle from x 30 to 70, the arc reaches x 80 and y 80.
    expect(near(d.width, 50)).toBe(true);
    expect(near(d.height, 50)).toBe(true);
    // Arc from 0° to 90° ends straight above the centre.
    const end = arc.pts[arc.pts.length - 1];
    expect(near(end[0], arc.pts[0][0] - 30) && near(end[1], arc.pts[0][1] - 30)).toBe(true);
  });

  it("turns bulges into arcs on the right side", () => {
    // A semicircle from (0,0) to (20,0) counter-clockwise dips below the chord (y down: below means larger y).
    const d = readDxf(dxf([[0, "LWPOLYLINE"], [90, 2], [70, 0], [10, 0], [20, 0], [42, 1], [10, 20], [20, 0]], { units: 4 }));
    expect(d.width).toBeCloseTo(20, 1);
    expect(d.height).toBeCloseTo(10, 1);
    const mid = d.lines[0].pts[Math.floor(d.lines[0].pts.length / 2)];
    expect(near(mid[0], 10, 0.5) && near(mid[1], 10, 0.05)).toBe(true);
  });

  it("reads old POLYLINE and VERTEX records, closed", () => {
    const d = readDxf(dxf([
      [0, "POLYLINE"], [66, 1], [70, 1],
      [0, "VERTEX"], [10, 0], [20, 0], [0, "VERTEX"], [10, 40], [20, 0], [0, "VERTEX"], [10, 40], [20, 30], [0, "SEQEND"],
      [0, "LINE"], [10, 0], [20, 0], [11, 1], [21, 1],
    ], { units: 4 }));
    expect(d.lines).toHaveLength(2);
    expect(d.lines[0].closed).toBe(true);
    expect(d.lines[0].pts).toHaveLength(3);
  });

  it("follows splines through their control points", () => {
    // A degree-1 spline is its control polygon; degree 2 with clamped knots starts and ends on its end points.
    const d1 = readDxf(dxf([[0, "SPLINE"], [70, 8], [71, 1], [72, 4], [73, 2], [40, 0], [40, 0], [40, 1], [40, 1], [10, 0], [20, 0], [10, 10], [20, 0]]));
    expect(d1.lines[0].pts).toEqual([[0, 0], [10, 0]]);
    const d2 = readDxf(dxf([[0, "SPLINE"], [70, 8], [71, 2], [72, 6], [73, 3], [40, 0], [40, 0], [40, 0], [40, 1], [40, 1], [40, 1],
      [10, 0], [20, 0], [10, 10], [20, 20], [10, 20], [20, 0]]));
    const pts = d2.lines[0].pts;
    const h = d2.height;
    expect(near(h, 10)).toBe(true);
    expect(pts[0]).toEqual([0, h]);
    expect(pts[pts.length - 1]).toEqual([20, h]);
  });

  it("places block inserts with scale and rotation and leaves out text and paper space", () => {
    const blocks = [[0, "BLOCK"], [2, "B"], [10, 0], [20, 0], [0, "LINE"], [10, 0], [20, 0], [11, 10], [21, 0], [0, "ENDBLK"]];
    const d = readDxf(dxf([
      [0, "INSERT"], [2, "B"], [10, 100], [20, 0], [41, 2], [42, 2], [50, 90],
      [0, "TEXT"], [10, 0], [20, 0], [1, "hi"],
      [0, "LINE"], [67, 1], [10, -500], [20, -500], [11, 500], [21, 500],
      [0, "LINE"], [10, 0], [20, 0], [11, 1], [21, 0],
    ], { blocks }));
    expect(d.skipped).toEqual({ TEXT: 1 });
    // The block's 10 mm line, doubled and turned upright, standing at x = 100.
    expect(d.width).toBeCloseTo(100);
    expect(d.height).toBeCloseTo(20);
  });

  it("refuses files that are not DXF, have nothing to draw or are too detailed", () => {
    expect(() => readDxf("<svg/>\nx")).toThrow(DxfError);
    expect(() => readDxf(dxf([[0, "TEXT"], [1, "hi"]]))).toThrow(DxfError);
    expect(() => readDxf(dxf([[0, "CIRCLE"], [10, 0], [20, 0], [40, 1000]], { units: 4 }), { maxPoints: 50 })).toThrow(DxfError);
  });
});

describe("dxfToSvg", () => {
  it("makes an SVG the example library accepts, with its real size", () => {
    const d = readDxf(dxf([[0, "LWPOLYLINE"], [90, 4], [70, 1], [10, 0], [20, 0], [10, 80], [20, 0], [10, 80], [20, 40], [10, 0], [20, 40], [0, "CIRCLE"], [10, 40], [20, 20], [40, 5]], { units: 4 }));
    const clean = cleanExampleSvg(dxfToSvg(d), "Tag");
    expect(clean.width).toBeCloseTo(80, 0);
    expect(clean.height).toBeCloseTo(40, 0);
    expect(clean.svg).toContain('stroke="#FF0000"');
  });
});
