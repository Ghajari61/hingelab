import { describe, expect, it } from "vitest";
import type { CanvasApi } from "@/components/studio/editor/Canvas";
import { buildHandlers, type CommandContext } from "@/components/studio/editor/commandHandlers";
import { createEditorStore } from "@/components/studio/editor/store";
import { bindingsFor, COMMAND_BY_ID, COMMANDS, conflicts, MENUS, menuIds, paletteLabel, paletteSearchText } from "../commands";
import { createDocument } from "../doc";
import { fuzzyFilter } from "../fuzzy";
import { canonical } from "../keys";
import { DEFAULT_PREFS, normalizePrefs } from "../prefs";
import { hitStack, objectsOnLayer, selectUnder, touchHits } from "../selectTools";
import { groupState, pathIntersections, SNAP_GROUPS, snapMove, snapPoint, snapTargets, type SnapSettings } from "../snap";
import {
  emptyZoomHistory, fitView, flipView, isTurned, normDeg, place, recordZoom, rotateView, screenAngle, setRotation, toDocument, toScreen,
  viewMatrix, visibleBox, zoomAround, zoomBack, zoomForward, type View,
} from "../viewTransform";
import { cleanWorkspace } from "../workspace";
import { apply } from "../geom";
import type { Document, PathNode, SceneNode, TextNode } from "../types";

const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z" });
  d.root.children.push(...nodes);
  return d;
};
const square = (id: string, x: number, y: number, size = 10, layer = 0): PathNode => ({
  id, type: "path", transform: [1, 0, 0, 1, x, y], layer,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: size, y: 0 }, { x: size, y: size }, { x: 0, y: size }] }],
});
const line = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): PathNode => ({
  id, type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [a, b] }],
});
const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-9) => Math.hypot(a.x - b.x, a.y - b.y) < eps;
const has = (pts: { x: number; y: number }[], p: { x: number; y: number }) => pts.some((q) => near(q, p, 1e-6));

// ---------- Inkscape-style shortcut set ----------

describe("Inkscape-style shortcut set", () => {
  const ink = bindingsFor("inkscape");
  const EXPECT: [string, string][] = [
    ["S", "tool.select"], ["N", "tool.direct"], ["R", "tool.rect"], ["F4", "tool.rect"], ["E", "tool.ellipse"], ["F5", "tool.ellipse"],
    ["*", "tool.star"], ["I", "tool.spiral"], ["F9", "tool.spiral"], ["B", "tool.pen"], ["P", "tool.pencil"], ["T", "tool.text"],
    ["F8", "tool.text"], ["Z", "tool.zoom"], ["F3", "tool.zoom"], ["D", "tool.eyedropper"], ["M", "tool.measure"], ["U", "tool.fill"],
    ["1", "view.actual"], ["2", "view.zoom.half"], ["3", "view.zoomSelection"], ["4", "view.fitAll"], ["5", "view.fitArtboard"],
    ["`", "view.zoom.prev"], ["Shift+`", "view.zoom.next"], ["=", "view.zoomIn"], ["-", "view.zoomOut"],
    ["Shift+\\", "view.guides.show"], ["Shift+3", "view.grid"], ["Shift+5", "view.snap.toggle"],
    ["Ctrl+Shift+L", "window.panel.layers"], ["Ctrl+Shift+A", "window.panel.align"], ["Ctrl+Shift+F", "window.panel.cutLayers"],
    ["Ctrl+Shift+O", "window.panel.properties"], ["Ctrl+Shift+H", "window.panel.history"], ["Ctrl+Shift+M", "object.transform"],
    ["Ctrl+Shift+D", "file.documentSetup"], ["Ctrl+Shift+P", "edit.preferences"], ["Ctrl+Shift+R", "object.sheets.fit"],
    ["Ctrl+Y", "edit.redo"], ["Ctrl+Shift+U", "object.group"], ["Alt+M", "object.clip.release"],
    ["Ctrl+Shift+C", "object.expand"], ["Ctrl+K", "object.compound.make"], ["Ctrl+Shift+K", "path.breakApart"],
    ["Ctrl+Shift+Alt+K", "path.splitPath"], ["Ctrl+L", "path.simplify"], ["Ctrl+J", "path.dynamicOffset"], ["Ctrl+Alt+D", "object.clone.linkedOffset"],
    ["Ctrl+(", "path.inset"], ["Ctrl+)", "path.outset"], ["Shift+F", "path.flatten"], ["Shift+Alt+F", "path.fracture"],
    ["Ctrl+Alt+T", "edit.transformAgain"], ["Ctrl+]", "object.rotate90"], ["Ctrl+[", "object.rotate-90"], ["H", "object.reflectH"],
    ["Home", "object.front"], ["End", "object.back"], ["Shift+1", "select.inverse"], ["Ctrl+Alt+A", "edit.selectAll"],
    ["Shift+Alt+A", "select.sameType"], ["Shift+G", "view.guides.fromSelection"], ["Ctrl+Alt+4", "object.align.left"],
    ["Ctrl+Alt+8", "object.align.top"], ["Ctrl+Alt+1", "object.align.hcenter"], ["Ctrl+H", "view.nodeHandles"], ["Shift+R", "path.reverse"],
    ["Alt+Backspace", "node.deleteSegment"], ["Shift+Alt+B", "path.traceBitmap"],
  ];

  it.each(EXPECT)("%s runs %s", (key, id) => {
    const owners = [...ink].filter(([, keys]) => keys.some((k) => canonical(k) === canonical(key))).map(([cid]) => cid);
    expect(owners).toEqual([id]);
  });

  it("has no conflicts, in any set", () => {
    for (const set of ["hingelab", "corel", "lightburn", "inkscape"] as const) expect(conflicts(bindingsFor(set)), set).toEqual([]);
  });

  it("keeps Shift+` for Curvature in the HingeLab set and drops it where it would clash", () => {
    expect(bindingsFor("hingelab").get("tool.curvature")).toEqual(["Shift+`"]);
    expect(ink.get("tool.curvature")).toBeUndefined();
    expect(bindingsFor("hingelab").get("view.zoom.prev")).toBeUndefined();
  });

  it("every new view command is in the View menu", () => {
    const view = menuIds(MENUS.find((m) => m.id === "view")!.items);
    for (const id of ["view.zoom.half", "view.zoom.double", "view.zoom.prev", "view.zoom.next", "view.rotate.cw", "view.rotate.ccw", "view.rotate.reset",
      "view.flipH", "view.flipV", "view.split", "view.outlineOverlay", "view.swatchBar", "view.snap.toggle", "view.snap.options"]) {
      expect(view, id).toContain(id);
      expect(COMMAND_BY_ID.has(id), id).toBe(true);
    }
  });
});

// ---------- command palette aliases ----------

describe("command palette finds commands by other apps' names", () => {
  const items = COMMANDS.map((c) => ({ id: c.id, label: paletteLabel(c), category: c.category, keywords: c.keywords }));
  const ALIASES: [string, string][] = [
    ["path effect", "window.panel.liveEffects"], ["paint bucket", "tool.fill"], ["live paint", "tool.fill"], ["symbol", "object.clone"],
    ["pathfinder", "window.panel.pathfinder"], ["weld", "path.pf.unite"], ["trim", "path.pf.trim"], ["contour", "path.offset"],
    ["powerclip", "object.clip.make"], ["object to path", "object.expand"], ["convert to curves", "object.expand"],
    ["break apart", "path.breakApart"], ["combine", "object.compound.make"], ["xml editor", "window.panel.inspector"],
    ["document properties", "file.documentSetup"], ["wireframe", "view.outline"], ["rotate canvas", "view.rotate.cw"],
    ["split canvas", "view.split"], ["zoom drawing", "view.fitAll"], ["fill and stroke", "window.panel.cutLayers"],
  ];
  it.each(ALIASES)("%s → %s", (q, id) => {
    const top = fuzzyFilter(items, q, paletteSearchText).slice(0, 8).map((r) => r.item.id);
    expect(top).toContain(id);
  });
});

// ---------- snapping bar toggles ----------

describe("snap targets follow the snapping bar toggles", () => {
  const base: SnapSettings = { grid: false, points: true, guides: true, smart: true, gridSize: 10 };
  const doc = () => {
    const d = docWith(square("a", 20, 20), square("b", 60, 20));
    d.guides = [{ axis: "x", at: 100 }];
    return d;
  };
  const xs = (s: SnapSettings) => snapTargets(doc(), new Set(), s).xs.map((t) => `${t.kind}:${t.at}`);

  it("defaults reproduce the original targets", () => {
    const t = snapTargets(doc(), new Set(), base);
    const sh = doc().sheets[0];
    expect(t.xs.slice(0, 3).map((x) => x.at)).toEqual([sh.x, sh.x + sh.w, sh.x + sh.w / 2]);
    expect(t.points).toHaveLength(8);
    expect(t.boxes).toHaveLength(2);
    expect(t.outlines).toBeUndefined();
    expect(xs(base)).toContain("guide:100");
    expect(xs(base)).toContain("edge:20");
    expect(xs(base)).toContain("center:25");
  });

  it("master off: no targets and nothing moves", () => {
    const s = { ...base, grid: true, enabled: false };
    const t = snapTargets(doc(), new Set(), s);
    expect(t.xs.length + t.ys.length + t.points.length + t.boxes.length).toBe(0);
    const full = snapTargets(doc(), new Set(), base);
    expect(snapMove({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 19.5, 0, full, 2, s)).toEqual({ dx: 19.5, dy: 0, lines: [] });
    expect(snapPoint({ x: 20.4, y: 20.3 }, full, 2, s).p).toEqual({ x: 20.4, y: 20.3 });
  });

  it("each per-target toggle removes or adds its targets", () => {
    expect(xs({ ...base, bboxEdges: false })).not.toContain("edge:20");
    expect(xs({ ...base, bboxCentres: false })).not.toContain("center:25");
    expect(xs({ ...base, guides: false })).not.toContain("guide:100");
    const sh = doc().sheets[0];
    expect(xs({ ...base, pageEdges: false })).not.toContain(`edge:${sh.x}`);
    expect(xs({ ...base, pageCentre: false })).not.toContain(`center:${sh.x + sh.w / 2}`);
    expect(snapTargets(doc(), new Set(), { ...base, smart: false }).boxes).toHaveLength(0);
    expect(snapTargets(doc(), new Set(), { ...base, points: false }).points).toHaveLength(0);
    const corners = snapTargets(doc(), new Set(), { ...base, points: false, bboxCorners: true }).points;
    expect(corners).toHaveLength(8);
    expect(has(corners, { x: 30, y: 30 })).toBe(true);
    const mids = snapTargets(doc(), new Set(), { ...base, points: false, bboxMidpoints: true }).points;
    expect(has(mids, { x: 25, y: 20 })).toBe(true);
    const centres = snapTargets(doc(), new Set(), { ...base, points: false, centres: true }).points;
    expect(centres).toHaveLength(2);
    expect(has(centres, { x: 65, y: 25 })).toBe(true);
    const noBoxes = { ...base, smart: false };
    const outline = snapTargets(doc(), new Set(), { ...noBoxes, pathOutline: true });
    expect(outline.outlines?.length).toBe(2);
    expect(snapPoint({ x: 27, y: 20.6 }, outline, 1, { ...noBoxes, pathOutline: true }).p).toEqual({ x: 27, y: 20 });
    expect(snapPoint({ x: 27, y: 20.6 }, snapTargets(doc(), new Set(), noBoxes), 1, noBoxes).p).toEqual({ x: 27, y: 20.6 });
  });

  it("cusp and smooth nodes toggle separately", () => {
    const p: PathNode = { id: "p", type: "path", transform: [1, 0, 0, 1, 0, 0], layer: 0, subpaths: [{ closed: false, nodes: [
      { x: 0, y: 0 }, { x: 10, y: 0, i: { x: 7, y: -3 }, o: { x: 13, y: 3 }, k: "smooth" }, { x: 20, y: 0 },
    ] }] };
    const d = docWith(p);
    expect(snapTargets(d, new Set(), base).points).toHaveLength(3);
    expect(snapTargets(d, new Set(), { ...base, nodesSmooth: false }).points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    expect(snapTargets(d, new Set(), { ...base, nodesCusp: false }).points).toEqual([{ x: 10, y: 0 }]);
  });

  it("text baseline snaps to the text origin", () => {
    const t: TextNode = { id: "t", type: "text", text: "Hi", font: "Inter", size: 10, tracking: 0, lineHeight: 1.2, align: "start", direction: "ltr", transform: [1, 0, 0, 1, 40, 70], layer: 0 };
    const pts = snapTargets(docWith(t), new Set(), { ...base, points: false, textBaseline: true }).points;
    expect(has(pts, { x: 40, y: 70 })).toBe(true);
  });

  it("path intersections: two crossing lines meet at one target", () => {
    const d = docWith(line("h", { x: 0, y: 50 }, { x: 100, y: 50 }), line("v", { x: 30, y: 0 }, { x: 30, y: 100 }));
    const off = snapTargets(d, new Set(), { ...base, points: false });
    expect(off.points).toHaveLength(0);
    const on = snapTargets(d, new Set(), { ...base, points: false, pathIntersections: true });
    expect(on.points).toHaveLength(1);
    expect(near(on.points[0], { x: 30, y: 50 }, 1e-9)).toBe(true);
    expect(snapPoint({ x: 30.4, y: 49.7 }, on, 1, { ...base, points: false, pathIntersections: true }).p).toEqual(on.points[0]);
    expect(pathIntersections([[{ x: 0, y: 0 }, { x: 10, y: 10 }], [{ x: 0, y: 10 }, { x: 10, y: 0 }], [{ x: 20, y: 0 }, { x: 30, y: 0 }]])).toEqual([{ x: 5, y: 5 }]);
  });

  it("moving box corners snap to points when box corners are on", () => {
    const d = docWith(square("a", 20, 20));
    const s = { ...base, smart: false, bboxCorners: true };
    const t = snapTargets(d, new Set(), s);
    const r = snapMove({ minX: 0, minY: 0, maxX: 5, maxY: 5 }, 14.6, 14.7, t, 1, s);
    expect(r.dx).toBeCloseTo(15);
    expect(r.dy).toBeCloseTo(15);
  });

  it("simple-mode groups report on / off / mixed", () => {
    const boxes = SNAP_GROUPS.find((g) => g.id === "boxes")!.keys;
    const align = SNAP_GROUPS.find((g) => g.id === "alignment")!.keys;
    const d = { grid: false, points: true, guides: true, smart: true };
    expect(groupState(d, boxes)).toBe("mixed");
    expect(groupState({ ...d, bboxCorners: true, bboxMidpoints: true }, boxes)).toBe("on");
    expect(groupState({ ...d, grid: true }, align)).toBe("on");
    expect(groupState({ grid: false, points: false, guides: false, smart: false, pageEdges: false, pageCentre: false }, align)).toBe("off");
  });
});

// ---------- selection gestures ----------

describe("select under, touch selection, objects on a layer", () => {
  const d = docWith(square("bottom", 0, 0, 40), square("mid", 10, 10, 20, 2), square("top", 15, 15, 5, 2), square("away", 100, 100));

  it("hitStack lists the objects under a point, topmost first", () => {
    expect(hitStack(d, { x: 17, y: 17 }, 0.5)).toEqual(["top", "mid", "bottom"]);
    expect(hitStack(d, { x: 5, y: 5 }, 0.5)).toEqual(["bottom"]);
    expect(hitStack(d, { x: 80, y: 80 }, 0.5)).toEqual([]);
  });

  it("Alt+click cycles downwards and wraps", () => {
    const stack = hitStack(d, { x: 17, y: 17 }, 0.5);
    expect(selectUnder(stack, [])).toBe("top");
    expect(selectUnder(stack, ["top"])).toBe("mid");
    expect(selectUnder(stack, ["mid"])).toBe("bottom");
    expect(selectUnder(stack, ["bottom"])).toBe("top");
    expect(selectUnder([], ["x"])).toBeNull();
  });

  it("touch selection picks objects whose outline the stroke crosses", () => {
    expect(touchHits(d, [{ x: -5, y: 2 }, { x: 5, y: 2 }], 0.1)).toEqual(["bottom"]);
    expect(touchHits(d, [{ x: 12, y: 5 }, { x: 12, y: 25 }], 0.1)).toEqual(["mid"]);
    expect(touchHits(d, [{ x: 35, y: 25 }, { x: 45, y: 25 }, { x: 45, y: 5 }, { x: 25, y: 5 }, { x: 25, y: 15 }], 0.1)).toEqual(["bottom", "mid"]);
    expect(touchHits(d, [{ x: 50, y: 50 }, { x: 60, y: 60 }], 0.1)).toEqual([]);
    expect(touchHits(d, [{ x: 99.8, y: 105 }], 0.5)).toEqual(["away"]);
  });

  it("objectsOnLayer finds every object on a cut layer", () => {
    expect(objectsOnLayer(d, 2)).toEqual(["mid", "top"]);
    expect(objectsOnLayer(d, 0)).toEqual(["bottom", "away"]);
    expect(objectsOnLayer(d, 7)).toEqual([]);
  });
});

// ---------- view transform ----------

describe("view transform: rotation, flip and zoom", () => {
  const views: View[] = [
    { zoom: 1, x: 0, y: 0 },
    { zoom: 2.5, x: 40, y: -30 },
    { zoom: 0.7, x: 300, y: 200, rotation: 30 },
    { zoom: 3, x: -50, y: 10, rotation: -135, flipX: true },
    { zoom: 1.2, x: 10, y: 10, rotation: 90, flipY: true },
    { zoom: 0.4, x: 5, y: 7, rotation: 200, flipX: true, flipY: true },
  ];
  const pts = [{ x: 0, y: 0 }, { x: 12.5, y: -7 }, { x: -300, y: 410 }];

  it("toScreen and toDocument are inverses", () => {
    for (const v of views) for (const p of pts) {
      expect(near(toDocument(v, toScreen(v, p)), p, 1e-9)).toBe(true);
      expect(near(toScreen(v, toDocument(v, p)), p, 1e-9)).toBe(true);
      expect(near(apply(viewMatrix(v), p), toScreen(v, p), 1e-9)).toBe(true);
    }
  });

  it("unrotated views keep the old mapping (x·zoom + pan)", () => {
    const v = { zoom: 2, x: 30, y: 40 };
    expect(toScreen(v, { x: 5, y: 6 })).toEqual({ x: 40, y: 52 });
    expect(isTurned(v)).toBe(false);
    expect(isTurned({ ...v, rotation: 360 })).toBe(false);
    expect(isTurned({ ...v, flipY: true })).toBe(true);
  });

  it("rotation, zoom and flip keep the point under the cursor fixed", () => {
    const s = { x: 220, y: 140 };
    for (const v of views) {
      const before = toDocument(v, s);
      expect(near(toDocument(rotateView(v, 15, s), s), before, 1e-9)).toBe(true);
      expect(near(toDocument(zoomAround(v, 1.7, s), s), before, 1e-9)).toBe(true);
      expect(near(toDocument(flipView(v, "h", s), s), before, 1e-9)).toBe(true);
      expect(near(toDocument(flipView(v, "v", s), s), before, 1e-9)).toBe(true);
    }
  });

  it("90° turns are exact and rotate clockwise on screen", () => {
    const v = setRotation({ zoom: 1, x: 0, y: 0 }, 90, { x: 0, y: 0 });
    expect(toScreen(v, { x: 10, y: 0 })).toEqual({ x: 0, y: 10 });
    expect(screenAngle(v, 1, 0)).toBeCloseTo(90);
    expect(normDeg(rotateView(v, 270, { x: 0, y: 0 }).rotation!)).toBe(0);
  });

  it("flipping mirrors the screen and twice is the identity", () => {
    const v: View = { zoom: 2, x: 100, y: 100, rotation: 30 };
    const s = { x: 100, y: 100 };
    const f = flipView(v, "h", s);
    const a = toScreen(v, { x: 10, y: 3 }), b = toScreen(f, { x: 10, y: 3 });
    expect(b.x - 100).toBeCloseTo(-(a.x - 100));
    expect(b.y).toBeCloseTo(a.y);
    const ff = flipView(f, "h", s);
    expect(near(toScreen(ff, { x: 10, y: 3 }), a, 1e-9)).toBe(true);
  });

  it("fit and visible box work rotated", () => {
    const b = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
    for (const rotation of [0, 37, 90]) {
      const v = fitView({ zoom: 1, x: 0, y: 0, rotation }, b, 800, 600, 20);
      const vis = visibleBox(v, 800, 600);
      expect(vis.minX).toBeLessThanOrEqual(0 + 1e-6);
      expect(vis.maxX).toBeGreaterThanOrEqual(200 - 1e-6);
      expect(vis.minY).toBeLessThanOrEqual(0 + 1e-6);
      expect(vis.maxY).toBeGreaterThanOrEqual(100 - 1e-6);
      const c = toScreen(v, { x: 100, y: 50 });
      expect(near(c, { x: 400, y: 300 }, 1e-6)).toBe(true);
    }
    const p = place({ zoom: 2, x: 0, y: 0, rotation: 45 }, { x: 3, y: 4 }, { x: 50, y: 60 });
    expect(near(toScreen(p, { x: 3, y: 4 }), { x: 50, y: 60 }, 1e-9)).toBe(true);
  });

  it("zoom history goes back and forward", () => {
    const a: View = { zoom: 1, x: 0, y: 0 }, b: View = { zoom: 2, x: 5, y: 5 }, c: View = { zoom: 4, x: 9, y: 9 };
    let h = recordZoom(emptyZoomHistory(), a);
    h = recordZoom(h, b);
    const back = zoomBack(h, c)!;
    expect(back.v).toEqual(b);
    const back2 = zoomBack(back.h, back.v)!;
    expect(back2.v).toEqual(a);
    expect(zoomBack(back2.h, back2.v)).toBeNull();
    const fwd = zoomForward(back2.h, back2.v)!;
    expect(fwd.v).toEqual(b);
    expect(zoomForward(fwd.h, fwd.v)!.v).toEqual(c);
    expect(recordZoom(recordZoom(emptyZoomHistory(), a), a).back).toHaveLength(1);
  });
});

// ---------- preferences and workspace ----------

describe("snap angle preference and swatch bar workspace flag", () => {
  it("snap angle defaults to 15° and stays within 1–90", () => {
    expect(DEFAULT_PREFS.snapAngle).toBe(15);
    expect(normalizePrefs({}).snapAngle).toBe(15);
    expect(normalizePrefs({ snapAngle: 5 }).snapAngle).toBe(5);
    expect(normalizePrefs({ snapAngle: 400 }).snapAngle).toBe(90);
    expect(normalizePrefs({ snapAngle: -3 }).snapAngle).toBe(1);
    expect(normalizePrefs({ snapAngle: "x" }).snapAngle).toBe(15);
  });

  it("swatch bar is on by default, off in Minimal, and old layouts get the default", () => {
    expect(cleanWorkspace({ panels: ["layers"] }, "essentials").swatchBar).toBe(true);
    expect(cleanWorkspace(undefined, "minimal").swatchBar).toBe(false);
    expect(cleanWorkspace({ panels: ["layers"], swatchBar: false }, "essentials").swatchBar).toBe(false);
  });
});

describe("view, snapping and swatch-bar commands", () => {
  const calls: string[] = [];
  const canvas = {
    rotate: (d: number) => calls.push(`rotate ${d}`), flip: (a: string) => calls.push(`flip ${a}`), resetOrientation: () => calls.push("reset"),
    zoomTo: (z: number) => calls.push(`zoomTo ${z.toFixed(4)}`), zoomPrev: () => calls.push("prev"), zoomNext: () => calls.push("next"),
  } as unknown as CanvasApi;
  const make = (extra: Partial<CommandContext> = {}) => {
    const api = createEditorStore(docWith(square("a", 0, 0)));
    const toasts: string[] = [];
    const h = () => buildHandlers({
      api, canvas: () => canvas, toast: (m: string) => { toasts.push(m); }, navigate: () => {}, openFile: () => {}, save: () => {}, saveCopy: () => {}, download: () => {},
      rename: () => {}, revert: () => {}, dialog: () => {}, showPanel: () => {}, workspace: "essentials", setWorkspace: () => {}, resetWorkspace: () => {},
      theme: "dark", setTheme: () => {}, lastField: () => null, viewCenter: () => ({ x: 0, y: 0 }), offsetStep: 1, ...extra,
    } as CommandContext);
    return { api, h, toasts };
  };

  it("rotates the view by the snap angle preference and resets only when turned", () => {
    calls.length = 0;
    const { api, h } = make({ snapAngle: 7.5 });
    h()["view.rotate.cw"].run(); h()["view.rotate.ccw"].run();
    expect(calls).toEqual(["rotate 7.5", "rotate -7.5"]);
    expect(h()["view.rotate.reset"].enabled).toBe(false);
    api.setState({ view: { ...api.getState().view, rotation: 30 } });
    expect(h()["view.rotate.reset"].enabled).toBe(true);
    api.setState({ view: { ...api.getState().view, rotation: 0, flipX: true } });
    expect(h()["view.rotate.reset"].enabled).toBe(true);
    expect(h()["view.flipH"].checked).toBe(true);
    expect(h()["view.flipV"].checked).toBe(false);
    calls.length = 0;
    make().h()["view.rotate.cw"].run();
    expect(calls).toEqual(["rotate 15"]);
  });

  it("zoom presets and zoom history follow the session history", () => {
    calls.length = 0;
    const { api, h } = make();
    h()["view.zoom.half"].run(); h()["view.zoom.double"].run();
    expect(calls).toEqual([`zoomTo ${(96 / 25.4 / 2).toFixed(4)}`, `zoomTo ${(96 / 25.4 * 2).toFixed(4)}`]);
    expect(h()["view.zoom.prev"].enabled).toBe(false);
    expect(h()["view.zoom.next"].enabled).toBe(false);
    api.setState({ zoomHistory: recordZoom(emptyZoomHistory(), { zoom: 1, x: 0, y: 0 }) });
    expect(h()["view.zoom.prev"].enabled).toBe(true);
    h()["view.zoom.prev"].run();
    expect(calls.at(-1)).toBe("prev");
  });

  it("toggles split view, the outline overlay and master snapping", () => {
    const { api, h, toasts } = make();
    h()["view.split"].run(); h()["view.outlineOverlay"].run();
    expect(api.getState().ui.split).toBe(true);
    expect(api.getState().ui.outlineOverlay).toBe(true);
    expect(h()["view.snap.toggle"].checked).toBe(true);
    const undo = api.getState().history.past.length;
    h()["view.snap.toggle"].run();
    expect(api.getState().doc.snapping.enabled).toBe(false);
    expect(h()["view.snap.toggle"].checked).toBe(false);
    expect(api.getState().history.past.length).toBe(undo);
    expect(toasts).toEqual(["Snapping off"]);
    h()["view.snap.toggle"].run();
    expect(api.getState().doc.snapping.enabled).toBe(true);
  });

  it("swatch bar and snapping options are wired through the editor", () => {
    let shown = false;
    let opened = 0;
    const off = make();
    expect(off.h()["view.swatchBar"].enabled).toBe(false);
    expect(off.h()["view.snap.options"].enabled).toBe(false);
    const on = make({ swatchBar: true, toggleSwatchBar: () => { shown = !shown; }, openSnapOptions: () => { opened++; } });
    expect(on.h()["view.swatchBar"].checked).toBe(true);
    on.h()["view.swatchBar"].run(); on.h()["view.snap.options"].run();
    expect(shown).toBe(true);
    expect(opened).toBe(1);
  });

  it("node rotation keys use the snap angle", () => {
    const { api, h } = make({ snapAngle: 90 });
    api.getState().select(["a"]);
    api.getState().setAnchors([0, 1, 2, 3].map((idx) => ({ id: "a", sub: 0, idx })));
    h()["node.rotateCW"].run();
    const n = api.getState().doc.root.children[0] as PathNode;
    const pts = n.subpaths[0].nodes.map((p) => apply(n.transform, p));
    expect(api.getState().history.past.at(-1)?.label).toBe("Rotate Nodes");
    expect(near(pts[0], { x: 10, y: 0 }, 1e-6)).toBe(true);
  });
});