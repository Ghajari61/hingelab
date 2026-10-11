import { beforeEach, describe, expect, it } from "vitest";
import { buildHandlers, type CommandContext, type EditorDialog } from "@/components/studio/editor/commandHandlers";
import { createEditorStore, type EditorState } from "@/components/studio/editor/store";
import { copyNodes, storeClip } from "../clipboard";
import { COMMAND_BY_ID, MENUS, menuIds } from "../commands";
import { createDocument } from "../doc";
import { arrangeGrid, arrangePolar } from "../arrange";
import { findNode } from "../scene";
import { createTiledClones, tileCopies, TILING_DEFAULTS } from "../tiling";
import { applyXform, XFORM_DEFAULTS } from "../transformDialog";
import type { CloneNode, Document, PathNode, SceneNode } from "../types";
import type { StoreApi } from "zustand";

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); },
};

const rect = (id: string, x: number, y: number, w: number, h: number, layer = 0): PathNode => ({
  id, type: "path", transform: [1, 0, 0, 1, x, y], layer,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }],
});
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z" });
  d.root.children.push(...nodes);
  return d;
};

const dialogs: EditorDialog[] = [];
const toasts: string[] = [];
const handlers = (api: StoreApi<EditorState>) => buildHandlers({
  api, canvas: () => null, toast: (m) => { toasts.push(m); }, navigate: () => {}, openFile: () => {}, save: () => {}, saveCopy: () => {}, download: () => {},
  rename: () => {}, revert: () => {}, dialog: (d) => { dialogs.push(d); }, showPanel: () => {}, workspace: "essentials", setWorkspace: () => {}, resetWorkspace: () => {},
  theme: "dark", setTheme: () => {}, lastField: () => null, viewCenter: () => ({ x: 0, y: 0 }), offsetStep: 1,
} as CommandContext);
const run = (api: StoreApi<EditorState>, id: string) => {
  const h = handlers(api)[id];
  expect(h, id).toBeDefined();
  expect(h.enabled, `${id}: ${h.reason}`).not.toBe(false);
  h.run();
};
/** Runs a command, then checks undo restores the document and redo brings the result back. */
const roundTrip = (api: StoreApi<EditorState>, id: string) => {
  const before = JSON.stringify(api.getState().doc.root);
  run(api, id);
  const after = JSON.stringify(api.getState().doc.root);
  expect(after, `${id} changed nothing`).not.toBe(before);
  api.getState().undo();
  expect(JSON.stringify(api.getState().doc.root), `${id} undo`).toBe(before);
  api.getState().redo();
  expect(JSON.stringify(api.getState().doc.root), `${id} redo`).toBe(after);
};
const three = () => createEditorStore(docWith(rect("a", 0, 0, 10, 10), rect("b", 5, 3, 20, 10, 1), rect("c", 40, 30, 4, 4)));

describe("parity commands", () => {
  beforeEach(() => { mem.clear(); dialogs.length = 0; toasts.length = 0; });

  it("every new command is registered, in a menu and palette-searchable", () => {
    const ids = [
      "object.clone", "object.clone.unlink", "object.clone.selectOriginal", "object.clone.relink", "object.clone.linkedOffset", "path.dynamicOffset",
      "object.clone.tiled", "object.clone.removeTiled", "object.arrange", "object.transform", "object.removeOverlaps",
      "object.exchange.selection", "object.exchange.stack", "object.exchange.clockwise", "object.exchange.random",
      "edit.pasteStyle", "edit.pasteSize.width", "edit.pasteSize.height", "edit.pasteSize.both", "edit.pasteSize.widthSep", "edit.pasteSize.heightSep", "edit.pasteSize.bothSep",
    ];
    const inMenus = new Set(menuIds(MENUS.flatMap((m) => m.items)));
    const h = handlers(three());
    for (const id of ids) {
      expect(COMMAND_BY_ID.get(id)?.keywords, id).toBeTruthy();
      expect(inMenus.has(id), id).toBe(true);
      expect(h[id], id).toBeDefined();
    }
    expect(COMMAND_BY_ID.get("object.clone")?.keywords).toContain("symbol instance");
    expect(COMMAND_BY_ID.get("object.clone.tiled")?.keywords).toContain("pattern fill wallpaper");
  });

  it("clone commands round-trip through undo and redo", () => {
    const api = three();
    api.getState().select(["a"]);
    roundTrip(api, "object.clone");
    const cloneId = api.getState().doc.root.children.find((n) => n.type === "clone")!.id;
    api.getState().select([cloneId]);
    run(api, "object.clone.selectOriginal");
    expect(api.getState().selection).toEqual(["a"]);
    api.getState().select(["b"]);
    storeClip(copyNodes(api.getState().doc, ["b"]));
    api.getState().select([cloneId]);
    roundTrip(api, "object.clone.relink");
    expect((findNode(api.getState().doc.root, cloneId) as CloneNode).source).toBe("b");
    roundTrip(api, "object.clone.unlink");
    expect(findNode(api.getState().doc.root, cloneId)?.type).toBe("path");
    api.getState().select(["c"]);
    roundTrip(api, "object.clone.linkedOffset");
    const lo = api.getState().doc.root.children.find((n) => n.type === "clone" && n.source === "c") as CloneNode;
    expect([lo.type, lo.effects?.[0]?.kind]).toEqual(["clone", "offset"]);
    api.getState().select(["a"]);
    roundTrip(api, "path.dynamicOffset");
    expect((findNode(api.getState().doc.root, "a") as PathNode).effects?.map((e) => e.kind)).toEqual(["offset"]);
  });

  it("removing tiled clones and expanding a clone round-trip", () => {
    const api = three();
    api.getState().select(["a"]);
    run(api, "object.clone");
    api.getState().select(["a"]);
    run(api, "object.clone");
    api.getState().select(["a"]);
    roundTrip(api, "object.clone.removeTiled");
    expect(api.getState().doc.root.children.map((n) => n.id)).toEqual(["a", "b", "c"]);
    api.getState().undo();
    const cl = api.getState().doc.root.children.find((n) => n.type === "clone")!;
    api.getState().select([cl.id]);
    roundTrip(api, "object.expand");
  });

  it("align, overlap and exchange commands round-trip", () => {
    for (const to of ["first", "key", "biggest", "smallest"] as const) {
      const api = three();
      api.getState().set({ alignTo: to });
      api.getState().select(["c", "a", "b"]);
      roundTrip(api, "object.align.left");
    }
    for (const id of ["object.removeOverlaps", "object.exchange.selection", "object.exchange.stack", "object.exchange.clockwise", "object.exchange.random"]) {
      const api = three();
      api.getState().select(["a", "b", "c"]);
      roundTrip(api, id);
    }
  });

  it("aligns selected nodes with Direct Selection", () => {
    const api = three();
    api.getState().select(["a"]);
    api.setState({ tool: "direct", anchors: [{ id: "b", sub: 0, idx: 0 }, { id: "b", sub: 0, idx: 2 }] });
    roundTrip(api, "object.align.left");
    const b = findNode(api.getState().doc.root, "b") as PathNode;
    expect(b.subpaths[0].nodes[2].x).toBe(0);
    expect(findNode(api.getState().doc.root, "a")?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("paste size and paste style round-trip", () => {
    for (const id of ["edit.pasteSize.width", "edit.pasteSize.height", "edit.pasteSize.both", "edit.pasteSize.widthSep", "edit.pasteSize.heightSep", "edit.pasteSize.bothSep", "edit.pasteStyle"]) {
      const api = three();
      storeClip(copyNodes(api.getState().doc, ["b"]));
      api.getState().select(["a", "c"]);
      roundTrip(api, id);
    }
  });

  it("dialog results (preview then apply) round-trip as one undo step", () => {
    const recipes: [string, (d: Document) => void][] = [
      ["Transform", (d) => { applyXform(d, ["a", "b"], "rotate", { ...XFORM_DEFAULTS, rotate: { angle: 30, dir: "cw" } }, [0.5, 0.5], true); }],
      ["Arrange", (d) => { arrangeGrid(d, ["a", "b", "c"], { rows: 1, cols: 0, spacingX: 2, spacingY: 0, alignX: 0, alignY: 0, equal: false }); }],
      ["Arrange", (d) => { arrangePolar(d, ["a", "b", "c"], { center: "first", rx: 30, ry: 30, start: 0, end: 360, rotate: true }); }],
      ["Create Tiled Clones", (d) => { createTiledClones(d, "a", tileCopies({ ...TILING_DEFAULTS, group: "P6M", rows: 2, cols: 2, w: 10, h: 10, cx: 5, cy: 5 }).slice(1)); }],
    ];
    for (const [label, recipe] of recipes) {
      const api = three();
      const before = JSON.stringify(api.getState().doc.root);
      api.getState().begin();
      api.getState().preview(recipe);
      api.getState().end(label, recipe);
      const after = JSON.stringify(api.getState().doc.root);
      expect(after).not.toBe(before);
      expect(api.getState().history.past.length).toBe(1);
      api.getState().undo();
      expect(JSON.stringify(api.getState().doc.root)).toBe(before);
      api.getState().redo();
      expect(JSON.stringify(api.getState().doc.root)).toBe(after);
    }
  });

  it("dialog commands open their dialogs", () => {
    const api = three();
    api.getState().select(["a", "b"]);
    run(api, "object.transform");
    run(api, "object.arrange");
    api.getState().select(["a"]);
    run(api, "object.clone.tiled");
    expect(dialogs).toEqual(["transform", "arrange", "tiledClones"]);
  });
});
