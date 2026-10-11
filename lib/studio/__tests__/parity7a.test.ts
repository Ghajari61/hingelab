import { beforeEach, describe, expect, it } from "vitest";
import { buildHandlers, type CommandContext, type EditorDialog } from "@/components/studio/editor/commandHandlers";
import { createEditorStore, type EditorState } from "@/components/studio/editor/store";
import { bindingsFor, COMMAND_BY_ID, conflicts, MENUS, menuIds } from "../commands";
import { assertDocument, createDocument, migrateDocument } from "../doc";
import { applyDocumentSetup, pagePresets, presetFor, readSetup } from "../documentSetup";
import { gridDrawing, gridNode, modularEdges } from "../grids";
import { inspectDocument, inspectNode } from "../inspect";
import { snapMove, snapMoveGrid, snapPoint, snapPointGrid, noTargets, type SnapSettings } from "../snap";
import { PANEL_IDS, PANEL_LABELS } from "../workspace";
import type { Document, GridSpec, GroupNode, ImageNode, PathNode, SceneNode } from "../types";
import type { StoreApi } from "zustand";

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); },
};

const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z" });
  d.root.children.push(...nodes);
  return d;
};
const square = (id: string, x: number, y: number): PathNode => ({
  id, type: "path", transform: [1, 0, 0, 1, x, y], layer: 0,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }],
});
const image: ImageNode = { id: "img", type: "image", assetId: "a1", w: 40, h: 30, transform: [1, 0, 0, 1, 50, 50], layer: 0 };

const S: SnapSettings = { grid: true, points: false, guides: false, smart: false, gridSize: 2 };
const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-9) => Math.hypot(a.x - b.x, a.y - b.y) < eps;

describe("grids: nearest node per grid type", () => {
  it("rectangular uses the minor step from 0,0", () => {
    const g: GridSpec = { size: 10, subdivisions: 5, show: true };
    expect(gridNode({ x: 3.1, y: -4.9 }, g)).toEqual({ x: 4, y: -4 });
  });

  it("axonometric (isometric) nodes lie on the lattice of the two slanted families", () => {
    const g: GridSpec = { size: 10, subdivisions: 1, show: true, kind: "axonometric", angleX: 30, angleZ: 30 };
    const c = Math.cos(Math.PI / 6) * 10;
    // Nodes: origin, one step up (0, -10), and one step along each family.
    expect(near(gridNode({ x: 0.4, y: -9.2 }, g), { x: 0, y: -10 })).toBe(true);
    expect(near(gridNode({ x: c - 0.3, y: -5.2 }, g), { x: c, y: -5 })).toBe(true);
    expect(near(gridNode({ x: c + 0.2, y: 5.3 }, g), { x: c, y: 5 })).toBe(true);
    const shifted = { ...g, originX: 3, originY: 1 };
    expect(near(gridNode({ x: 3.2, y: 1.1 }, shifted), { x: 3, y: 1 })).toBe(true);
  });

  it("modular snaps to module edges on each axis, across gutters", () => {
    const g: GridSpec = { size: 10, subdivisions: 5, show: true, kind: "modular", moduleW: 40, moduleH: 20, gutterX: 5, gutterY: 4, originX: 0, originY: 0 };
    expect(modularEdges({ x: 41, y: 23 }, g)).toEqual({ x: 40, y: 24 });
    expect(modularEdges({ x: 44, y: 21 }, g)).toEqual({ x: 45, y: 20 });
    expect(gridNode({ x: 86, y: 47 }, g)).toEqual({ x: 85, y: 48 });
  });

  it("polar nodes are ring × spoke crossings, and the centre", () => {
    const g: GridSpec = { size: 10, subdivisions: 1, show: true, kind: "polar", divisions: 4, originX: 100, originY: 100 };
    expect(near(gridNode({ x: 119, y: 101 }, g), { x: 120, y: 100 })).toBe(true);
    expect(near(gridNode({ x: 100.5, y: 89 }, g), { x: 100, y: 90 })).toBe(true);
    expect(near(gridNode({ x: 101, y: 101 }, g), { x: 100, y: 100 })).toBe(true);
    const twelve = { ...g, divisions: 12 };
    const q = gridNode({ x: 100 + 20 * Math.cos(Math.PI / 6) + 0.3, y: 100 + 20 * Math.sin(Math.PI / 6) - 0.2 }, twelve);
    expect(near(q, { x: 100 + 20 * Math.cos(Math.PI / 6), y: 100 + 20 * Math.sin(Math.PI / 6) })).toBe(true);
  });

  it("draws path data for each non-rectangular kind and nothing when too dense", () => {
    const vb = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
    for (const kind of ["axonometric", "modular", "polar"] as const) {
      const g: GridSpec = { size: 20, subdivisions: 2, show: true, kind, originX: 50, originY: 50 };
      const d = gridDrawing(g, vb, 4);
      expect(d.major.length, kind).toBeGreaterThan(0);
    }
    expect(gridDrawing({ size: 10, subdivisions: 5, show: true }, vb, 4)).toEqual({ minor: "", major: "" });
    expect(gridDrawing({ size: 0.01, subdivisions: 1, show: true, kind: "axonometric" }, vb, 1).major).toBe("");
  });
});

describe("snapping to the other grid kinds", () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it("rectangular (and documents without a kind) behave exactly like snapMove / snapPoint", () => {
    const g: GridSpec = { size: 10, subdivisions: 5, show: true };
    expect(snapMoveGrid(box, 3.3, 5.1, noTargets(), 1, S, g)).toEqual(snapMove(box, 3.3, 5.1, noTargets(), 1, S));
    expect(snapPointGrid({ x: 3.3, y: 5.1 }, noTargets(), 1, S, g)).toEqual(snapPoint({ x: 3.3, y: 5.1 }, noTargets(), 1, S));
    expect(snapMoveGrid(box, 3.3, 5.1, noTargets(), 1, S, { ...g, kind: "rectangular" })).toEqual(snapMove(box, 3.3, 5.1, noTargets(), 1, S));
  });

  it("axonometric: a corner or the centre lands on a lattice node", () => {
    const g: GridSpec = { size: 10, subdivisions: 1, show: true, kind: "axonometric", angleX: 30, angleZ: 30 };
    const r = snapMoveGrid(box, 0.4, -9.6, noTargets(), 1, S, g);
    expect(near({ x: r.dx, y: r.dy }, { x: 0, y: -10 })).toBe(true);
    const p = snapPointGrid({ x: 8.9, y: 4.6 }, noTargets(), 1, S, g).p;
    expect(near(p, { x: Math.cos(Math.PI / 6) * 10, y: 5 })).toBe(true);
    // Off: nothing moves.
    expect(snapMoveGrid(box, 0.4, -9.6, noTargets(), 1, { ...S, grid: false }, g)).toEqual({ dx: 0.4, dy: -9.6, lines: [] });
  });

  it("modular: box edges snap to module edges per axis", () => {
    const g: GridSpec = { size: 10, subdivisions: 1, show: true, kind: "modular", moduleW: 40, moduleH: 40, gutterX: 5, gutterY: 5 };
    // Right edge (10 + 29.6) → 40; top edge (0 + 44.7) → 45.
    const r = snapMoveGrid(box, 29.6, 44.7, noTargets(), 1, S, g);
    expect(r.dx).toBeCloseTo(30, 9);
    expect(r.dy).toBeCloseTo(45, 9);
    const p = snapPointGrid({ x: 84.6, y: 12 }, noTargets(), 1, S, g).p;
    expect(p).toEqual({ x: 85, y: 12 });
  });

  it("polar: snaps to ring and spoke crossings within the tolerance only", () => {
    const g: GridSpec = { size: 10, subdivisions: 1, show: true, kind: "polar", divisions: 8 };
    const p = snapPointGrid({ x: 20.5, y: 0.4 }, noTargets(), 1, S, g).p;
    expect(near(p, { x: 20, y: 0 })).toBe(true);
    const far = snapPointGrid({ x: 15, y: 3 }, noTargets(), 1, S, g).p;
    expect(far).toEqual({ x: 15, y: 3 });
  });

  it("objects still win over the grid", () => {
    const g: GridSpec = { size: 10, subdivisions: 1, show: true, kind: "polar", divisions: 8 };
    const t = { ...noTargets(), xs: [{ at: 20.8, lo: -1e6, hi: 1e6, kind: "guide" as const }] };
    const r = snapMoveGrid(box, 10.5, 0.2, t, 1, S, g);
    expect(r.dx).toBeCloseTo(10.8, 9);
    expect(r.lines.length).toBe(1);
  });
});

describe("Document Setup", () => {
  it("offers machine beds and the large common sheets", () => {
    const p = pagePresets();
    for (const [w, h] of [[300, 200], [400, 400], [600, 400], [900, 600], [1300, 900], [210, 297], [297, 420], [430, 390], [110, 110]]) {
      expect(p.some((x) => x.w === w && x.h === h), `${w}×${h}`).toBe(true);
    }
    expect(new Set(p.map((x) => x.id)).size).toBe(p.length);
    expect(presetFor(1300, 900)?.name).toBe("1300 × 900 mm");
  });

  it("applies page, units, background, guides and grid in one undoable step, and documents stay valid", () => {
    const api = createEditorStore(docWith(square("a", 0, 0)));
    const before = JSON.stringify(api.getState().doc);
    const s = readSetup(api.getState().doc);
    s.units = "in"; s.sheetW = 900; s.sheetH = 600; s.background = "wood"; s.snapGrid = true;
    s.guides = [{ axis: "x", at: 25 }, { axis: "y", at: 40 }];
    s.grid = { ...s.grid, kind: "polar", divisions: 16, originX: 450, originY: 300, angleX: undefined };
    api.getState().edit("Document Setup", (d) => { applyDocumentSetup(d, s); });
    const d = api.getState().doc;
    expect(d.units).toBe("in");
    expect(d.sheets[0]).toMatchObject({ w: 900, h: 600, name: "900 × 600 mm" });
    expect(d.background).toBe("wood");
    expect(d.guides).toEqual([{ axis: "x", at: 25 }, { axis: "y", at: 40 }]);
    expect(d.grid).toEqual({ size: 10, subdivisions: 5, show: true, kind: "polar", divisions: 16, originX: 450, originY: 300 });
    expect(d.snapping.grid).toBe(true);
    expect(() => assertDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
    expect(migrateDocument(JSON.parse(JSON.stringify(d))).grid.kind).toBe("polar");
    // Back to rectangular drops the optional fields again; "none" removes the background.
    const back = readSetup(d);
    back.grid = { ...back.grid, kind: "rectangular" }; back.background = "none";
    api.getState().edit("Document Setup", (x) => { applyDocumentSetup(x, back); });
    expect(api.getState().doc.grid).toEqual({ size: 10, subdivisions: 5, show: true });
    expect("background" in api.getState().doc).toBe(false);
    api.getState().undo(); api.getState().undo();
    expect(JSON.stringify({ ...api.getState().doc, updatedAt: "" })).toBe(JSON.stringify({ ...JSON.parse(before), updatedAt: "" }));
  });

  it("older documents without the new fields open unchanged", () => {
    const old = JSON.parse(JSON.stringify(docWith(square("a", 0, 0))));
    const d = migrateDocument(old);
    expect(d.grid).toEqual({ size: 10, subdivisions: 5, show: true });
    expect(d.background).toBeUndefined();
  });
});

describe("Structure Inspector data", () => {
  it("summarises geometry and decomposes transforms", () => {
    const p: PathNode = { ...square("a", 5, 7), name: "Lid", effects: [{ id: "e1", kind: "offset", enabled: true, params: { delta: 1, join: "round", miterLimit: 4 } as never }] };
    const g: GroupNode = { id: "g", type: "group", layer: 2, transform: [0, 1, -1, 0, 10, 20], children: [p] };
    const d = docWith(g);
    const j = inspectNode(d, g) as Record<string, unknown>;
    expect(j).toMatchObject({ type: "group", id: "g", layer: expect.stringMatching(/^C02 /) });
    expect(j.transform).toMatchObject({ x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 90, skew: 0 });
    const child = (j.children as Record<string, unknown>[])[0];
    expect(child).toMatchObject({ type: "path", name: "Lid", subpaths: { subpaths: 1, nodes: 4, closed: 1 } });
    expect((child.effects as Record<string, unknown>[])[0]).toMatchObject({ kind: "offset", enabled: true, params: { delta: 1 } });
    expect(JSON.parse(JSON.stringify(j))).toEqual(j);
    const doc = inspectDocument(d) as Record<string, unknown>;
    expect(doc).toMatchObject({ type: "document", objects: 2, topLevel: 1 });
  });
});

describe("Parity 7a commands", () => {
  const dialogs: EditorDialog[] = [];
  const panels: string[] = [];
  const handlers = (api: StoreApi<EditorState>) => buildHandlers({
    api, canvas: () => null, toast: () => {}, navigate: () => {}, openFile: () => {}, save: () => {}, saveCopy: () => {}, download: () => {},
    rename: () => {}, revert: () => {}, dialog: (d) => { dialogs.push(d); }, showPanel: (p) => { panels.push(p); }, workspace: "essentials", setWorkspace: () => {}, resetWorkspace: () => {},
    theme: "dark", setTheme: () => {}, lastField: () => null, viewCenter: () => ({ x: 0, y: 0 }), offsetStep: 1,
  } as CommandContext);
  beforeEach(() => { dialogs.length = 0; panels.length = 0; mem.clear(); });

  it("are registered, in menus, searchable and bound in the familiar set without conflicts", () => {
    const inMenus = new Set(menuIds(MENUS.flatMap((m) => m.items)));
    for (const id of ["path.traceBitmap", "window.panel.inspector", "file.documentSetup"]) {
      expect(inMenus.has(id), id).toBe(true);
      expect(COMMAND_BY_ID.get(id)?.keywords, id).toBeTruthy();
    }
    expect(COMMAND_BY_ID.get("path.traceBitmap")?.keywords).toContain("vectorize");
    expect(COMMAND_BY_ID.get("path.traceBitmap")?.keywords).toContain("image trace");
    expect(COMMAND_BY_ID.get("path.traceBitmap")?.keywords).toContain("live trace");
    const ink = bindingsFor("inkscape");
    expect(ink.get("path.traceBitmap")).toEqual(["Shift+Alt+B"]);
    expect(ink.get("window.panel.inspector")).toEqual(["Ctrl+Shift+X"]);
    expect(ink.get("file.documentSetup")?.[0]).toBe("Ctrl+Shift+D");
    expect(conflicts(ink)).toEqual([]);
    expect(PANEL_IDS).toContain("inspector");
    expect(PANEL_LABELS.inspector).toBe("Structure");
    for (const label of [COMMAND_BY_ID.get("path.traceBitmap")!.label, COMMAND_BY_ID.get("window.panel.inspector")!.label]) expect(label).not.toMatch(/inkscape/i);
  });

  it("Trace Bitmap needs exactly one image; the inspector opens as a panel", () => {
    const api = createEditorStore(docWith(image, square("a", 0, 0)));
    api.getState().select(["a"]);
    expect(handlers(api)["path.traceBitmap"].enabled).toBe(false);
    api.getState().select(["img", "a"]);
    expect(handlers(api)["path.traceBitmap"].enabled).toBe(false);
    api.getState().select(["img"]);
    const h = handlers(api);
    expect(h["path.traceBitmap"].enabled).toBe(true);
    h["path.traceBitmap"].run();
    expect(dialogs).toEqual(["traceBitmap"]);
    h["window.panel.inspector"].run();
    expect(panels).toEqual(["inspector"]);
  });
});
