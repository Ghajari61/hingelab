import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { clipToSvg, copyNodes } from "../clipboard";
import { COMMAND_BY_ID } from "../commands";
import { createDocument } from "../doc";
import { flatten, nodePaths, pathLength, polygonArea, subpathsBox } from "../geom";
import { commit, emptyHistory, redo, undo } from "../history";
import { linkPasses, syncLinks } from "../links";
import { applyEffects, createEffect, effectDragPatch, effectGuides, effectHandleOutline, effectHandles, EFFECTS } from "../effects";
import { applyInterpolate, blendTimes, matchEnds } from "../effects/interpolate";
import { applyLiveBoolean } from "../effects/liveBoolean";
import { measureGuides, measureLabel } from "../effects/measureSegments";
import { addEffect, addLinkedEffect, linkEffect, resetEffect, setEffectParams, stackOrder, unlinkEffect } from "../effects/ops";
import { applyRoughen, roughenPieces, seededRandom } from "../effects/roughen";
import { applyPowerStroke, applyTaperStroke, powerDrag, powerHandles, taperWidth } from "../effects/stroke";
import {
  applyBend, applyEnvelope, applyPatternAlongPath, bendDrag, bendGuide, bilinearPoint, envelopeCorners, patternPlacements, projectPoint, squareToQuad, track,
} from "../effects/warp";
import { expandNodes, findNode, removeNodes } from "../scene";
import { segments } from "../geom";
import type {
  BendParams, Document, EnvelopeParams, InterpolateParams, LinkedParams, LiveBooleanParams, LiveEffect, MeasureSegmentsParams, PathNode, PatternAlongPathParams,
  PowerStrokeParams, RoughenParams, SceneNode, Subpath, TaperStrokeParams, Vec,
} from "../types";

let seq = 0;
const id = () => `m${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const rect = (x: number, y: number, w: number, h: number): Subpath => ({ closed: true, nodes: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const line = (x0: number, y0: number, x1: number, y1: number): Subpath => ({ closed: false, nodes: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
const area = (subs: Subpath[]) => subs.filter((s) => s.closed).reduce((a, s) => a + Math.abs(polygonArea(flatten(s, 1e-4))), 0);
const signedArea = (subs: Subpath[]) => Math.abs(subs.filter((s) => s.closed).reduce((a, s) => a + polygonArea(flatten(s, 1e-4)), 0));
const path = (subs: Subpath[], transform: PathNode["transform"] = [1, 0, 0, 1, 0, 0], effects?: LiveEffect[]): PathNode =>
  ({ id: id(), type: "path", transform, layer: 0, subpaths: subs, ...(effects ? { effects } : {}) });
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const fxOf = (d: Document, nid: string) => (findNode(d.root, nid) as PathNode).effects!;
const linked = (d: Document, nid: string, k = 0) => fxOf(d, nid)[k].params as LinkedParams;
const roundTrip = (d: Document, label: string, recipe: (d: Document) => unknown) => {
  const before = JSON.stringify(d);
  const c = commit(d, emptyHistory(), label, (x) => { recipe(x); }, { after: linkPasses });
  expect(c.changed).toBe(true);
  const after = JSON.stringify(c.doc);
  const u = undo(c.doc, c.history);
  expect(JSON.stringify(u.doc)).toBe(before);
  const r = redo(u.doc, u.history);
  expect(JSON.stringify(r.doc)).toBe(after);
  return c.doc;
};
/** Distance from q to the outline of the axis-aligned box. */
const toBoxEdge = (q: Vec, x0: number, y0: number, x1: number, y1: number) => {
  const inside = q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
  if (inside) return Math.min(q.x - x0, x1 - q.x, q.y - y0, y1 - q.y);
  return Math.hypot(Math.max(x0 - q.x, 0, q.x - x1), Math.max(y0 - q.y, 0, q.y - y1));
};

const pattern = (p: Partial<PatternAlongPathParams>): PatternAlongPathParams => ({ mode: "repeated", spacing: 0, normalOffset: 0, widthScale: 1, rotate90: false, ...p });

describe("Pattern Along Path", () => {
  const tile = [rect(500, 500, 10, 4)];
  it("repeated: floor(length / (pattern length + spacing)) copies on a straight spine, each one the tile moved along", () => {
    const out = applyPatternAlongPath([line(0, 0, 100, 0)], pattern({ linkCache: tile, spacing: 3 }));
    expect(out).toHaveLength(Math.floor(100 / (10 + 3)));
    out.forEach((s, k) => {
      const b = subpathsBox([s]);
      close(b.minX, k * 13, 1e-9); close(b.maxX, k * 13 + 10, 1e-9);
      close(b.minY, -2, 1e-9); close(b.maxY, 2, 1e-9);
    });
    expect(patternPlacements(100, 10, "repeated", 0)).toHaveLength(10);
  });

  it("stretched copies span exactly the spine length", () => {
    const one = applyPatternAlongPath([line(0, 0, 100, 0)], pattern({ linkCache: tile, mode: "singleStretched" }));
    expect(one).toHaveLength(1);
    const b = subpathsBox(one);
    close(b.minX, 0, 1e-9); close(b.maxX, 100, 1e-9);
    const rep = applyPatternAlongPath([line(0, 0, 95, 0)], pattern({ linkCache: tile, mode: "repeatedStretched" }));
    expect(rep).toHaveLength(10);
    const rb = subpathsBox(rep);
    close(rb.minX, 0, 1e-9); close(rb.maxX, 95, 1e-9);
    close(subpathsBox([rep[1]]).minX, 9.5, 1e-9);
  });

  it("normal offset, width scale and 90° rotation; no pattern passes the path through", () => {
    const b = subpathsBox(applyPatternAlongPath([line(0, 0, 10, 0)], pattern({ linkCache: tile, mode: "single", normalOffset: 5, widthScale: 2 })));
    close(b.minY, 1, 1e-9); close(b.maxY, 9, 1e-9);
    const r = subpathsBox(applyPatternAlongPath([line(0, 0, 100, 0)], pattern({ linkCache: tile, mode: "single", rotate90: true })));
    close(r.maxX - r.minX, 4, 1e-9); close(r.maxY - r.minY, 10, 1e-9);
    const spine = [line(0, 0, 100, 0)];
    expect(applyPatternAlongPath(spine, pattern({}))).toBe(spine);
  });

  it("follows a curved spine: copies of a thin bar stay on a circle of radius 50", () => {
    const circle: Subpath = { closed: true, nodes: [] };
    const k = 0.5522847498 * 50;
    circle.nodes = [
      { x: 50, y: 0, i: { x: 50, y: -k }, o: { x: 50, y: k } }, { x: 0, y: 50, i: { x: k, y: 50 }, o: { x: -k, y: 50 } },
      { x: -50, y: 0, i: { x: -50, y: k }, o: { x: -50, y: -k } }, { x: 0, y: -50, i: { x: -k, y: -50 }, o: { x: k, y: -50 } },
    ];
    const out = applyPatternAlongPath([circle], pattern({ linkCache: [line(0, 0, 10, 0)] }));
    expect(out).toHaveLength(Math.floor(pathLength([circle], 0.01) / 10 + 1e-9));
    for (const s of out) for (const a of s.nodes) close(Math.hypot(a.x, a.y), 50, 0.02);
  });
});

describe("Bend", () => {
  const bend = (input: Subpath[], p: Partial<BendParams> = {}): BendParams => ({ ...(EFFECTS.bend.defaults(input) as BendParams), ...p });
  it("bending along the straight centre line of the box is the identity (within 1e-6)", () => {
    const input = [rect(10, 20, 40, 10), line(15, 22, 45, 28)];
    const out = applyBend(input, bend(input));
    const pts = out.flatMap((s) => s.nodes);
    expect(pts.length).toBeGreaterThan(8);
    for (const q of out[0].nodes) expect(toBoxEdge(q, 10, 20, 50, 30)).toBeLessThanOrEqual(1e-6);
    const b = subpathsBox(out);
    close(b.minX, 10); close(b.maxX, 50); close(b.minY, 20); close(b.maxY, 30);
    const ln = out[1].nodes;
    close(ln[0].x, 15); close(ln[0].y, 22); close(ln[ln.length - 1].x, 45); close(ln[ln.length - 1].y, 28);
    const v = bend(input, { vertical: true, guide: bendGuide(input, true) });
    for (const q of applyBend(input, v)[0].nodes) expect(toBoxEdge(q, 10, 20, 50, 30)).toBeLessThanOrEqual(1e-6);
  });

  it("a horizontal line bent along a circular arc takes the arc's length (within 0.5%)", () => {
    const r = 30, k = 0.5522847498 * r;
    const arc: Subpath = { closed: false, nodes: [{ x: 0, y: 0, o: { x: 0, y: -k } }, { x: r, y: -r, i: { x: r - k, y: -r } }] };
    const out = applyBend([line(0, 0, 80, 0)], { guide: arc, widthScale: 1, widthInLength: false, vertical: false });
    const want = (Math.PI * r) / 2;
    expect(Math.abs(pathLength(out, 0.001) - want) / want).toBeLessThanOrEqual(0.005);
    close(out[0].nodes[0].x, 0, 1e-9); close(out[0].nodes[out[0].nodes.length - 1].x, r, 1e-6);
  });

  it("width scale and width relative to length scale the artwork across the guide", () => {
    const input = [rect(0, -5, 20, 10)];
    const guide = line(0, 0, 40, 0);
    const b = subpathsBox(applyBend(input, { guide, widthScale: 0.5, widthInLength: false, vertical: false }));
    close(b.maxX, 40); close(b.maxY - b.minY, 5);
    const c = subpathsBox(applyBend(input, { guide, widthScale: 1, widthInLength: true, vertical: false }));
    close(c.maxY - c.minY, 20);
  });

  it("guide handles: anchors carry their control points; dragging a control bends", () => {
    const input = [rect(0, 0, 30, 10)];
    const p = bend(input);
    expect(effectHandles(path(input, undefined, [{ id: "b", kind: "bend", enabled: true, params: p }]), "b")).toEqual([{ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 20, y: 5 }, { x: 30, y: 5 }]);
    const moved = bendDrag(p, 0, { x: 0, y: 0 }).guide!;
    expect(moved.nodes[0]).toMatchObject({ x: 0, y: 0, o: { x: 10, y: 0 } });
    const ctl = bendDrag(p, 1, { x: 10, y: -5 }).guide!;
    expect(ctl.nodes[0].o).toEqual({ x: 10, y: -5 });
    expect(p.guide.nodes[0].o).toEqual({ x: 10, y: 5 });
  });
});

describe("Envelope", () => {
  const input = [rect(0, 0, 20, 10)];
  const env = (p: Partial<EnvelopeParams>): EnvelopeParams => ({ mode: "perspective", ...envelopeCorners(input), ...p });
  const quad = { tl: { x: 2, y: 1 }, tr: { x: 25, y: -3 }, br: { x: 18, y: 14 }, bl: { x: -1, y: 9 } };
  it("is the identity when the corners are the box (both modes)", () => {
    for (const mode of ["perspective", "bilinear"] as const) {
      for (const q of applyEnvelope(input, env({ mode }))[0].nodes) expect(toBoxEdge(q, 0, 0, 20, 10)).toBeLessThanOrEqual(1e-9);
    }
  });

  it("the homography maps the box corners exactly onto the quad corners", () => {
    const m = squareToQuad([quad.tl, quad.tr, quad.br, quad.bl]);
    const corners: [number, number, Vec][] = [[0, 0, quad.tl], [1, 0, quad.tr], [1, 1, quad.br], [0, 1, quad.bl]];
    for (const [u, v, want] of corners) { const q = projectPoint(m, u, v); close(q.x, want.x, 1e-9); close(q.y, want.y, 1e-9); }
    const out = applyEnvelope(input, env({ ...quad, mode: "perspective" }))[0].nodes;
    [quad.tl, quad.tr, quad.br, quad.bl].forEach((want, k) => { close(out[k].x, want.x, 1e-9); close(out[k].y, want.y, 1e-9); });
  });

  it("bilinear maps the box centre to the average of the four corners; handles are the corners", () => {
    const p = env({ ...quad, mode: "bilinear" });
    const mid = bilinearPoint(p, 0.5, 0.5);
    close(mid.x, (2 + 25 + 18 - 1) / 4, 1e-12); close(mid.y, (1 - 3 + 14 + 9) / 4, 1e-12);
    const cross = applyEnvelope([line(0, 5, 20, 5), line(10, 0, 10, 10)], p);
    const n = path([line(0, 5, 20, 5), line(10, 0, 10, 10)], undefined, [{ id: "e", kind: "envelope", enabled: true, params: p }]);
    expect(effectHandles(n, "e")).toEqual([quad.tl, quad.tr, quad.br, quad.bl]);
    expect(effectDragPatch(n, "e", 2, { x: 30, y: 30 })).toEqual({ br: { x: 30, y: 30 } });
    expect(cross[0].nodes.length).toBeGreaterThan(2);
  });
});

describe("Roughen", () => {
  const rough = (p: Partial<RoughenParams>): RoughenParams => ({ ...(EFFECTS.roughen.defaults([]) as RoughenParams), ...p });
  it("is deterministic for a seed and differs for another seed", () => {
    const a = applyRoughen([rect(0, 0, 20, 10)], rough({ seed: 7 }));
    expect(applyRoughen([rect(0, 0, 20, 10)], rough({ seed: 7 }))).toEqual(a);
    expect(applyRoughen([rect(0, 0, 20, 10)], rough({ seed: 8 }))).not.toEqual(a);
    const r = seededRandom(3);
    const xs = Array.from({ length: 1000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0); expect(Math.max(...xs)).toBeLessThan(1);
  });

  it("node count follows the subdivision (by length and by count, open and closed)", () => {
    // 20 × 10 rectangle, pieces of at most 2 mm: 10 + 5 + 10 + 5 = 30 nodes.
    expect(applyRoughen([rect(0, 0, 20, 10)], rough({ maxSegment: 2 }))[0].nodes).toHaveLength(30);
    expect(applyRoughen([rect(0, 0, 20, 10)], rough({ subdivide: "count", segments: 3 }))[0].nodes).toHaveLength(12);
    expect(applyRoughen([line(0, 0, 9, 0)], rough({ subdivide: "count", segments: 4 }))[0].nodes).toHaveLength(5);
    expect(applyRoughen([line(0, 0, 9, 0)], rough({ maxSegment: 2, smooth: true }))[0].nodes).toHaveLength(6);
    expect(roughenPieces(segments(line(0, 0, 10, 0))[0], rough({ maxSegment: 2 }))).toBe(5);
  });

  it("every node stays within the maximum displacement of its place on the split path", () => {
    const xy = applyRoughen([rect(0, 0, 20, 10)], rough({ maxSegment: 1, maxX: 0.3, maxY: 0.7, seed: 11 }))[0];
    const plain = applyRoughen([rect(0, 0, 20, 10)], rough({ maxSegment: 1, maxX: 0, maxY: 0, seed: 11 }))[0];
    xy.nodes.forEach((q, k) => {
      expect(Math.abs(q.x - plain.nodes[k].x)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(q.y - plain.nodes[k].y)).toBeLessThanOrEqual(0.7);
    });
    const nrm = applyRoughen([line(0, 0, 20, 0)], rough({ maxSegment: 1, direction: "normal", maxNormal: 0.5, seed: 2 }))[0];
    nrm.nodes.forEach((q, k) => { close(q.x, k, 1e-9); expect(Math.abs(q.y)).toBeLessThanOrEqual(0.5); });
    expect(nrm.nodes.some((q) => Math.abs(q.y) > 0.01)).toBe(true);
  });
});

describe("Interpolate", () => {
  const sq = (s: number) => rect(-s / 2, -s / 2, s, s);
  const ip = (p: Partial<InterpolateParams>): InterpolateParams => ({ steps: 5, spacing: "time", ...p });
  it("adds `steps` outlines after the input", () => {
    const out = applyInterpolate([sq(10), sq(20)], ip({ steps: 4 }));
    expect(out).toHaveLength(2 + 4);
    expect(applyInterpolate([sq(10)], ip({}))).toHaveLength(1);
  });

  it("the middle step of concentric squares of side 10 and 20 is a square of side 15", () => {
    const [, , mid] = applyInterpolate([sq(10), sq(20)], ip({ steps: 1 }));
    expect(mid.closed).toBe(true);
    expect(mid.nodes).toHaveLength(4);
    const want = [[-7.5, -7.5], [7.5, -7.5], [7.5, 7.5], [-7.5, 7.5]];
    mid.nodes.forEach((q, k) => { close(q.x, want[k][0], 1e-6); close(q.y, want[k][1], 1e-6); });
  });

  it("lines up direction and start; 'size' spaces steps by enclosed area", () => {
    const rev: Subpath = { closed: true, nodes: sq(20).nodes.slice().reverse() };
    const [, , mid] = applyInterpolate([sq(10), rev], ip({ steps: 1 }));
    for (const q of mid.nodes) { close(Math.abs(q.x), 7.5, 1e-6); close(Math.abs(q.y), 7.5, 1e-6); }
    const ends = matchEnds(sq(10), sq(20))!;
    const [t] = blendTimes(1, "size", ends.a, ends.b);
    const side = 10 + 10 * t;
    close(side * side, 250, 1e-6);
  });

  it("with a linked object, blends from the first subpath to the linked outline", () => {
    const out = applyInterpolate([sq(10)], ip({ steps: 1, link: "x", linkCache: [sq(30)] }));
    expect(out).toHaveLength(2);
    close(subpathsBox([out[1]]).maxX, 10, 1e-6);
    expect(applyInterpolate([sq(10)], ip({ steps: 1, link: "x" }))).toHaveLength(1);
  });
});

describe("Taper Stroke and Power Stroke", () => {
  const taper = (p: Partial<TaperStrokeParams>): TaperStrokeParams => ({ width: 2, start: 0, end: 0, smoothing: 0, ...p });
  it("constant width w over a straight line of length L has area L·w (butt ends)", () => {
    close(area(applyTaperStroke([line(0, 0, 50, 0)], taper({ width: 2 }))), 100, 1e-3);
    close(area(applyPowerStroke([line(0, 0, 50, 0)], { points: [{ t: 0.3, w: 2 }], interpolation: "linear" })), 100, 1e-3);
  });

  it("a 50/50 taper has area L·w/2 (within 1%), with or without smoothing", () => {
    for (const smoothing of [0, 0.5, 1]) {
      const a = area(applyTaperStroke([line(0, 0, 100, 0)], taper({ width: 4, start: 50, end: 50, smoothing })));
      expect(Math.abs(a - 200) / 200).toBeLessThanOrEqual(0.01);
    }
    const w = taperWidth(taper({ width: 4, start: 25, end: 25 }));
    expect([w(0), w(0.125), w(0.5), w(1)]).toEqual([0, 2, 4, 0]);
  });

  it("a closed path becomes a ring; power stroke interpolates between its points", () => {
    close(signedArea(applyTaperStroke([rect(0, 0, 20, 10)], taper({ width: 2 }))), 22 * 12 - 18 * 8, 0.01);
    const lin = applyPowerStroke([line(0, 0, 100, 0)], { points: [{ t: 0, w: 1 }, { t: 1, w: 3 }], interpolation: "linear" });
    close(area(lin), 200, 0.05);
  });

  it("power stroke handles sit half a width off the path and drag along it", () => {
    const p: PowerStrokeParams = { points: [{ t: 0.25, w: 2 }, { t: 0.75, w: 4 }], interpolation: "smooth" };
    const input = [line(0, 0, 100, 0)];
    expect(powerHandles(p, input)).toEqual([{ x: 25, y: 1 }, { x: 75, y: 2 }]);
    expect(powerDrag(p, 0, { x: 40, y: -3 }, input).points![0]).toEqual({ t: 0.4, w: 6 });
    expect(powerDrag(p, 0, { x: 90, y: 1 }, input).points![0].t).toBeCloseTo(0.749, 9);
  });
});

describe("Measure Segments", () => {
  const ms: MeasureSegmentsParams = { decimals: 2, prefix: "", suffix: "", showUnit: true, offset: 3, ends: "arrows", fontSize: 3 };
  it("one label per segment with its length in document units", () => {
    const g = measureGuides([rect(0, 0, 20, 10)], ms, "mm");
    expect(g.labels.map((l) => l.text)).toEqual(["20.00 mm", "10.00 mm", "20.00 mm", "10.00 mm"]);
    expect(g.labels[0].y).toBeLessThan(0);
    expect(g.labels[0].angle).toBe(0);
    expect(measureLabel(25.4, { ...ms, decimals: 1, prefix: "L=", suffix: "!", showUnit: true }, "in")).toBe("L=1.0 in!");
    expect(measureLabel(12.345, { ...ms, decimals: 0, showUnit: false }, "mm")).toBe("12");
  });

  it("the node's geometry and export carry no labels; the canvas guides do (scaled lengths)", () => {
    const fx: LiveEffect = { id: "ms", kind: "measureSegments", enabled: true, params: ms };
    const n = path([rect(0, 0, 20, 10)], [2, 0, 0, 2, 5, 5], [fx]);
    const plain = path([rect(0, 0, 20, 10)], [2, 0, 0, 2, 5, 5]);
    expect(nodePaths(n)).toEqual(plain.subpaths);
    const d = docWith(n), d2 = docWith(plain);
    expect(clipToSvg(d, copyNodes(d, [n.id]))).toBe(clipToSvg(d2, copyNodes(d2, [plain.id])));
    const g = effectGuides(n, n.transform, "mm")!;
    expect(g.labels.map((l) => l.text)).toEqual(["40.00 mm", "20.00 mm", "40.00 mm", "20.00 mm"]);
    expect(g.lines.length).toBeGreaterThan(4);
    expect(effectGuides(plain, plain.transform, "mm")).toBeNull();
  });
});

describe("Live Boolean", () => {
  const A = [rect(0, 0, 20, 10)], B = [rect(10, 5, 20, 10)];
  const lb = (op: LiveBooleanParams["op"]): LiveBooleanParams => ({ op, link: "b", linkCache: B });
  it("areas of every operation on two overlapping rectangles (exact to 1e-6)", () => {
    close(signedArea(applyLiveBoolean(A, lb("union"))), 350, 1e-6);
    close(signedArea(applyLiveBoolean(A, lb("difference"))), 150, 1e-6);
    close(signedArea(applyLiveBoolean(A, lb("intersection"))), 50, 1e-6);
    close(signedArea(applyLiveBoolean(A, lb("exclusion"))), 300, 1e-6);
    const div = applyLiveBoolean(A, lb("division"));
    expect(div).toHaveLength(2);
    close(area(div), 200, 1e-6);
    const cut = applyLiveBoolean(A, lb("cut"));
    expect(cut.every((s) => !s.closed)).toBe(true);
    // The outline inside B (5 mm of the right edge, 10 mm of the bottom edge) is cut away.
    close(pathLength(cut), 60 - 15, 1e-6);
    expect(applyLiveBoolean(A, { op: "union" })).toBe(A);
  });

  it("the operand is linked and synced; editing it updates the result; deleting it turns the effect off", () => {
    const a = path(A), b = path([rect(0, 0, 20, 10)], [1, 0, 0, 1, 10, 5]);
    const d0 = docWith(a, b);
    const d1 = roundTrip(d0, "Add Live Effect: Live Boolean", (x) => { addLinkedEffect(x, a.id, b.id, "liveBoolean", () => "lb"); });
    expect(linked(d1, a.id).link).toBe(b.id);
    expect(findNode(d1.root, b.id)!.hidden).toBe(true);
    close(signedArea(nodePaths(findNode(d1.root, a.id)!)), 150, 1e-6);
    // Moving the operand (a new object) and syncing updates the cached copy and the result.
    const moved = syncLinks(produce(d1, (x) => { findNode(x.root, b.id)!.transform = [1, 0, 0, 1, 15, 0]; }));
    close(signedArea(nodePaths(findNode(moved.root, a.id)!)), 150, 1e-6);
    const sw = syncLinks(produce(d1, (x) => { (findNode(x.root, b.id) as PathNode).subpaths = [rect(-5, -5, 10, 10)]; }));
    // The new outline sits at x 5–15, y 0–10 on the page: it removes a 10 × 10 square.
    close(signedArea(nodePaths(findNode(sw.root, a.id)!)), 200 - 100, 1e-6);
    // Moving the object itself keeps the operand where it is on the page.
    const self = syncLinks(produce(d1, (x) => { findNode(x.root, a.id)!.transform = [1, 0, 0, 1, -10, 0]; }));
    close(signedArea(nodePaths(findNode(self.root, a.id)!)), 200, 1e-6);
    expect(syncLinks(sw)).toBe(sw);
    const gone = roundTrip(d1, "Delete", (x) => { removeNodes(x, [b.id]); });
    expect(linked(gone, a.id)).toMatchObject({ link: b.id, linkError: "missing" });
    expect(linked(gone, a.id).linkCache).toBeUndefined();
    close(signedArea(nodePaths(findNode(gone.root, a.id)!)), 200, 1e-6);
  });

  it("links that would loop are refused or switched off; unlink and reset", () => {
    const a = path(A), b = path(B);
    const d0 = docWith(a, b);
    const d1 = syncLinks(produce(d0, (x) => { addLinkedEffect(x, a.id, b.id, "liveBoolean", () => "f1"); }));
    let ok = true;
    produce(d1, (x) => { const f = addEffect(x, [b.id], "liveBoolean", () => "f2").get(b.id)!; ok = linkEffect(x, b.id, f, a.id); });
    expect(ok).toBe(false);
    produce(d1, (x) => { ok = linkEffect(x, a.id, "f1", a.id); });
    expect(ok).toBe(false);
    // A loop that arrives anyway (hand-edited file) is switched off without crashing.
    const loop = produce(d1, (x) => {
      (findNode(x.root, b.id) as PathNode).effects = [{ id: "f2", kind: "liveBoolean", enabled: true, params: { op: "union", link: a.id } }];
    });
    const s = syncLinks(loop);
    expect([linked(s, a.id).linkError, linked(s, b.id).linkError]).toEqual(["cycle", "cycle"]);
    expect(nodePaths(findNode(s.root, a.id)!)).toEqual(A);
    const r = roundTrip(d1, "Reset Effect", (x) => { setEffectParams(x, a.id, "f1", { op: "union" }); resetEffect(x, a.id, "f1"); });
    expect(fxOf(r, a.id)[0].params).toMatchObject({ op: "difference", link: b.id });
    const u = roundTrip(d1, "Unlink", (x) => { unlinkEffect(x, a.id, "f1"); });
    expect(linked(u, a.id).link).toBeUndefined();
    expect(stackOrder(d1, [b.id, a.id])).toEqual([a.id, b.id]);
  });
});

describe("linked Pattern Along Path and Interpolate in a document", () => {
  it("the pattern is read in page space; a clone of the patterned path follows after sync", () => {
    const spine = path([line(0, 0, 100, 0)]);
    const tile = path([rect(0, 0, 10, 4)], [1, 0, 0, 1, 200, 50]);
    const d = syncLinks(produce(docWith(spine, tile), (x) => { addLinkedEffect(x, spine.id, tile.id, "patternAlongPath", () => "pp"); }));
    expect(nodePaths(findNode(d.root, spine.id)!)).toHaveLength(10);
    expect(findNode(d.root, tile.id)!.hidden).toBeUndefined();
    const widened = syncLinks(produce(d, (x) => { (findNode(x.root, tile.id) as PathNode).subpaths = [rect(0, 0, 20, 4)]; }));
    expect(nodePaths(findNode(widened.root, spine.id)!)).toHaveLength(5);
  });

  it("interpolate between the object and a linked square; expand bakes the steps", () => {
    const a = path([rect(-5, -5, 10, 10)]), b = path([rect(-10, -10, 20, 20)]);
    const d = syncLinks(produce(docWith(a, b), (x) => { const f = addLinkedEffect(x, a.id, b.id, "interpolate", () => "ip")!; setEffectParams(x, a.id, f, { steps: 1 }); }));
    const out = nodePaths(findNode(d.root, a.id)!);
    expect(out).toHaveLength(2);
    close(subpathsBox([out[1]]).maxX, 7.5, 1e-6);
    const e = roundTrip(d, "Expand", (x) => { expandNodes(x, [a.id]); });
    const p = findNode(e.root, a.id) as PathNode;
    expect(p.effects).toBeUndefined();
    expect(p.subpaths).toHaveLength(2);
  });
});

describe("new effects: registry, commands, add and expand", () => {
  const KINDS = ["patternAlongPath", "bend", "envelope", "roughen", "interpolate", "taperStroke", "powerStroke", "measureSegments", "liveBoolean"] as const;
  it("every new kind has a palette command with keywords, presets and safe defaults", () => {
    for (const k of KINDS) {
      const cmd = COMMAND_BY_ID.get(`path.effect.add.${k}`)!;
      expect(cmd.label).toBe(`Add Live Effect: ${EFFECTS[k].label}`);
      expect(cmd.keywords).toContain(EFFECTS[k].keywords);
      const e = createEffect(k, [rect(0, 0, 20, 10)], () => "e");
      expect(applyEffects([rect(0, 0, 20, 10)], [e], path([rect(0, 0, 20, 10)])).length).toBeGreaterThan(0);
    }
  });

  it("add, change a parameter and expand round-trip through undo for each kind", () => {
    for (const k of KINDS) {
      const n = path([rect(0, 0, 20, 10), line(0, 20, 30, 20)]);
      const d1 = roundTrip(docWith(n), `Add Live Effect: ${EFFECTS[k].label}`, (x) => { addEffect(x, [n.id], k, () => "fx"); });
      const preset = EFFECTS[k].presets?.[EFFECTS[k].presets!.length - 1];
      const d2 = preset ? roundTrip(d1, "Preset", (x) => { setEffectParams(x, n.id, "fx", preset.params as never); }) : d1;
      const shown = nodePaths(findNode(d2.root, n.id)!);
      const d3 = roundTrip(d2, "Expand", (x) => { expandNodes(x, [n.id]); });
      const p = findNode(d3.root, n.id) as PathNode;
      expect(p.effects).toBeUndefined();
      expect(p.subpaths).toEqual(JSON.parse(JSON.stringify(shown)));
    }
  });

  it("dragging a canvas handle (Bend, Envelope, Power Stroke) is one undo step and moves that handle to the pointer", () => {
    for (const k of ["bend", "envelope", "powerStroke"] as const) {
      const n = path([k === "powerStroke" ? line(0, 0, 40, 0) : rect(0, 0, 40, 10)]);
      const d1 = roundTrip(docWith(n), "Add", (x) => { addEffect(x, [n.id], k, () => "fx"); });
      const node = findNode(d1.root, n.id)!;
      const hs = effectHandles(node, "fx");
      expect(hs.length).toBeGreaterThan(1);
      expect(effectHandleOutline(node, "fx").length).toBeGreaterThan(0);
      const to = k === "powerStroke" ? { x: 20, y: 3 } : { x: hs[0].x + 2, y: hs[0].y - 3 };
      const idx = k === "powerStroke" ? 1 : 0;
      const d2 = roundTrip(d1, `Move ${EFFECTS[k].label} Handle`, (x) => { setEffectParams(x, n.id, "fx", effectDragPatch(node, "fx", idx, to) as never); });
      const moved = effectHandles(findNode(d2.root, n.id)!, "fx")[idx];
      close(moved.x, to.x, 1e-6);
      close(moved.y, to.y, 1e-6);
    }
  });
});
