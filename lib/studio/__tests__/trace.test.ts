import { describe, expect, it } from "vitest";
import { createEditorStore } from "@/components/studio/editor/store";
import { createDocument } from "../doc";
import { flatten, pathLength, polygonArea } from "../geom";
import { findNode } from "../scene";
import { traceRaster, TRACE_DEFAULTS } from "../trace";
import { centerlines, thin } from "../trace/centerline";
import { fitCurve, nestLoops, smoothLoop, traceLoops } from "../trace/contours";
import { pixelToLocal, placeTrace, traceLayer } from "../trace/place";
import { edgeBitmap, inkCount, quantize, removeSpeckles, thresholdBitmap, type Bitmap, type Raster } from "../trace/raster";
import type { ImageNode, PathNode, GroupNode, Subpath } from "../types";

/** A w × h RGBA raster, white, with the given pixels painted. */
function raster(w: number, h: number, paint: (x: number, y: number) => [number, number, number] | null): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = paint(x, y) ?? [255, 255, 255];
    data.set([...c, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}
const BLACK: [number, number, number] = [0, 0, 0];
const inRect = (x: number, y: number, x0: number, y0: number, w: number, h: number) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
const square = () => raster(100, 100, (x, y) => (inRect(x, y, 30, 30, 40, 40) ? BLACK : null));
const subArea = (s: Subpath) => polygonArea(flatten(s, 0.01));
const bitmapOf = (r: Raster): Bitmap => thresholdBitmap(r, 0.5);

describe("trace bitmap: outlines", () => {
  it("a black 40 × 40 square gives one closed path of 1600 px²", () => {
    const r = traceRaster(square(), { mode: "brightness" });
    expect(r.layers).toHaveLength(1);
    const subs = r.layers[0].subpaths;
    expect(subs).toHaveLength(1);
    expect(subs[0].closed).toBe(true);
    expect(Math.abs(Math.abs(subArea(subs[0])) - 1600) / 1600).toBeLessThan(0.02);
    // The corners stay exact corners.
    expect(subs[0].nodes.map((n) => [n.x, n.y]).sort()).toEqual([[30, 30], [30, 70], [70, 30], [70, 70]].sort());
  });

  it("a square with a square hole gives an outer contour and a hole", () => {
    const img = raster(100, 100, (x, y) => (inRect(x, y, 20, 20, 60, 60) && !inRect(x, y, 40, 40, 20, 20) ? BLACK : null));
    const shapes = nestLoops(traceLoops(bitmapOf(img)));
    expect(shapes).toHaveLength(1);
    expect(shapes[0].outer.area).toBe(3600);
    expect(shapes[0].holes.map((h) => h.area)).toEqual([-400]);
    const subs = traceRaster(img).layers[0].subpaths;
    expect(subs).toHaveLength(2);
    expect(subs.map((s) => Math.round(subArea(s)))).toEqual([3600, -400]);
  });

  it("nests holes with the smallest outer around them and joins diagonal pixels", () => {
    // Ring inside a ring: two outers, two holes, each hole with its own ring.
    const img = raster(60, 60, (x, y) => ((inRect(x, y, 0, 0, 60, 60) && !inRect(x, y, 5, 5, 50, 50)) || (inRect(x, y, 15, 15, 30, 30) && !inRect(x, y, 20, 20, 20, 20)) ? BLACK : null));
    const shapes = nestLoops(traceLoops(bitmapOf(img)));
    expect(shapes.map((s) => [s.outer.area, s.holes.map((h) => h.area)]).sort()).toEqual([[3600, [-2500]], [900, [-400]]].sort());
    const diag = raster(4, 4, (x, y) => ((x === 1 && y === 1) || (x === 2 && y === 2) ? BLACK : null));
    expect(traceLoops(bitmapOf(diag)).map((l) => l.area)).toEqual([2]);
  });

  it("smooths the pixel staircase of a diagonal edge into a straight line", () => {
    const tri = raster(40, 40, (x, y) => (y >= x ? BLACK : null));
    const loop = traceLoops(bitmapOf(tri))[0];
    const r = traceRaster(tri, { smooth: 0, optimize: 0.5 });
    expect(r.layers[0].subpaths[0].nodes.length).toBeLessThanOrEqual(5);
    expect(smoothLoop(loop).length).toBeGreaterThan(40);
  });

  it("corner smoothing 0 keeps a polygon; higher values round obtuse corners only", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 15, y: 3 }, { x: 15, y: 10 }, { x: 0, y: 10 }];
    expect(fitCurve(pts, true, 0).nodes.every((n) => !n.i && !n.o)).toBe(true);
    const f = fitCurve(pts, true, 1);
    expect(f.nodes.filter((n) => n.k === "smooth")).toHaveLength(2);
    expect(f.nodes[0].i).toBeUndefined();
  });

  it("speckle removal drops blobs and fills holes smaller than the threshold", () => {
    const img = raster(50, 50, (x, y) => (inRect(x, y, 5, 5, 3, 3) || inRect(x, y, 20, 20, 20, 20) && !inRect(x, y, 30, 30, 2, 2) || inRect(x, y, 44, 44, 6, 6) ? BLACK : null));
    const b = bitmapOf(img);
    const clean = removeSpeckles(b, 10);
    expect(inkCount(clean)).toBe(400 + 36);
    expect(clean.bits[5 * 50 + 5]).toBe(0);
    expect(clean.bits[30 * 50 + 30]).toBe(1);
    expect(removeSpeckles(b, 0)).toBe(b);
    expect(traceRaster(img, { speckles: 10 }).layers[0].subpaths).toHaveLength(2);
    expect(traceRaster(img, { speckles: 0 }).layers[0].subpaths).toHaveLength(4);
  });

  it("invert traces the light parts", () => {
    const r = traceRaster(square(), { invert: true, smooth: 0 });
    expect(r.layers[0].subpaths.map((s) => Math.round(subArea(s)))).toEqual([10000, -1600]);
  });
});

describe("trace bitmap: edges, colours and scans", () => {
  it("edge detection finds the outline of a filled square", () => {
    const e = edgeBitmap(square(), 0.25);
    expect(e.bits[50 * 100 + 50]).toBe(0);
    expect(e.bits[50 * 100 + 30]).toBe(1);
    expect(e.bits[50 * 100 + 29]).toBe(1);
    expect(e.bits[10 * 100 + 10]).toBe(0);
    const r = traceRaster(square(), { mode: "edges" });
    expect(r.layers[0].subpaths.length).toBe(2);
  });

  it("quantising a two-colour image gives two layers", () => {
    const img = raster(40, 20, (x) => (x < 20 ? [200, 30, 30] : [30, 30, 200]));
    const q = quantize(img, 2);
    expect(q.palette).toHaveLength(2);
    const r = traceRaster(img, { mode: "colors", colors: 2, skipBackground: false });
    expect(r.layers).toHaveLength(2);
    expect(r.layers.map((l) => Math.round(Math.abs(subArea(l.subpaths[0]))))).toEqual([400, 400]);
    expect(traceRaster(img, { mode: "colors", colors: 2, skipBackground: true }).layers).toHaveLength(1);
    // More colours than asked for: k-means picks n of them (seeded, so repeatable).
    const grad = raster(64, 8, (x) => [x * 4, x * 4, x * 4]);
    const a = quantize(grad, 3), b = quantize(grad, 3);
    expect(a.palette).toHaveLength(3);
    expect(a.palette).toEqual(b.palette);
  });

  it("multiple scans: stacked scans grow, separate scans don't overlap", () => {
    const grad = raster(80, 10, (x) => { const v = Math.floor(x / 20) * 64; return [v, v, v]; });
    const sep = traceRaster(grad, { mode: "scans", scans: 3, stack: false, skipBackground: true, smooth: 0 });
    const stk = traceRaster(grad, { mode: "scans", scans: 3, stack: true, skipBackground: true, smooth: 0 });
    const areas = (r: ReturnType<typeof traceRaster>) => r.layers.map((l) => l.subpaths.reduce((a, s) => a + subArea(s), 0));
    expect(areas(sep)).toEqual([200, 200, 200]);
    expect(areas(stk)).toEqual([200, 400, 600]);
    const byColour = traceRaster(grad, { mode: "scans", scanBy: "colors", scans: 4, stack: true, skipBackground: false, smooth: 0 });
    expect(areas(byColour)).toEqual([200, 400, 600, 800]);
  });
});

describe("trace bitmap: centre-line", () => {
  it("a 3 px wide horizontal bar gives one open polyline of the bar's length", () => {
    const bar = raster(100, 40, (x, y) => (inRect(x, y, 20, 20, 60, 3) ? BLACK : null));
    const lines = centerlines(bitmapOf(bar));
    expect(lines).toHaveLength(1);
    const r = traceRaster(bar, { mode: "centerline" });
    expect(r.lines).toBe(true);
    expect(r.layers[0].subpaths).toHaveLength(1);
    const s = r.layers[0].subpaths[0];
    expect(s.closed).toBe(false);
    expect(Math.abs(pathLength([s]) - 60)).toBeLessThanOrEqual(2);
    expect(s.nodes.every((n) => Math.abs(n.y - 21.5) < 0.6)).toBe(true);
  });

  it("thins a thick ring to a closed one-pixel loop and an L to one bent line", () => {
    const ring = raster(60, 60, (x, y) => { const d = Math.hypot(x + 0.5 - 30, y + 0.5 - 30); return d >= 15 && d <= 21 ? BLACK : null; });
    const sk = thin(bitmapOf(ring));
    expect(inkCount(sk)).toBeGreaterThan(90);
    expect(inkCount(sk)).toBeLessThan(140);
    const subs = traceRaster(ring, { mode: "centerline" }).layers[0].subpaths;
    expect(subs).toHaveLength(1);
    expect(subs[0].closed).toBe(true);
    expect(Math.abs(pathLength(subs) - 2 * Math.PI * 18)).toBeLessThan(6);
    const ell = raster(60, 60, (x, y) => (inRect(x, y, 10, 10, 4, 40) || inRect(x, y, 10, 46, 40, 4) ? BLACK : null));
    const ls = traceRaster(ell, { mode: "centerline" }).layers[0].subpaths;
    expect(ls).toHaveLength(1);
    expect(Math.abs(pathLength(ls) - 78)).toBeLessThan(4);
  });
});

describe("trace bitmap: placing the result", () => {
  const imageDoc = () => {
    const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z" });
    const img: ImageNode = { id: "img", type: "image", assetId: "a1", w: 50, h: 50, transform: [2, 0, 0, 2, 100, 80], layer: 0 };
    d.root.children.push(img);
    return d;
  };

  it("maps pixels onto the image box and keeps the image's transform", () => {
    const f = pixelToLocal({ width: 100, height: 100 }, 50, 50);
    expect(f({ x: 0, y: 0 })).toEqual({ x: -25, y: -25 });
    expect(f({ x: 100, y: 50 })).toEqual({ x: 25, y: 0 });
    const d = imageDoc();
    const r = traceRaster(square());
    const id = placeTrace(d, "img", r, 2, () => "t1")!;
    expect(id).toBe("t1");
    expect(d.root.children.map((n) => n.id)).toEqual(["img", "t1"]);
    const p = findNode(d.root, "t1") as PathNode;
    expect(p.transform).toEqual([2, 0, 0, 2, 100, 80]);
    expect(p.layer).toBe(2);
    expect(Math.abs(subArea(p.subpaths[0]))).toBeCloseTo(400, 6);
  });

  it("groups several layers and picks a fill layer for engraving", () => {
    const d = imageDoc();
    const img = raster(40, 20, (x) => (x < 20 ? [200, 30, 30] : [30, 30, 200]));
    let k = 0;
    const id = placeTrace(d, "img", traceRaster(img, { mode: "colors", colors: 2, skipBackground: false }), 1, () => `n${++k}`)!;
    const g = findNode(d.root, id) as GroupNode;
    expect([g.type, g.name, g.children.length]).toEqual(["group", "Trace", 2]);
    expect(placeTrace(d, "img", { width: 1, height: 1, layers: [], lines: false }, 1)).toBeNull();
    expect(placeTrace(d, "missing", traceRaster(square()), 1)).toBeNull();
    d.cutLayers[3].mode = "fill";
    expect(traceLayer(d, 2, false)).toBe(2);
    expect(traceLayer(d, 3, true)).toBe(3);
    const firstFill = d.cutLayers.findIndex((l) => l.mode === "fill");
    expect(traceLayer(d, 2, true)).toBe(firstFill);
  });

  it("tracing is one undo step", () => {
    const api = createEditorStore(imageDoc());
    const before = JSON.stringify(api.getState().doc.root);
    const r = traceRaster(square(), TRACE_DEFAULTS);
    api.getState().edit("Trace Bitmap", (d) => { placeTrace(d, "img", r, 2); });
    const after = JSON.stringify(api.getState().doc.root);
    expect(after).not.toBe(before);
    api.getState().undo();
    expect(JSON.stringify(api.getState().doc.root)).toBe(before);
    api.getState().redo();
    expect(JSON.stringify(api.getState().doc.root)).toBe(after);
  });
});
