"use client";

import type { StoreApi } from "zustand";
import { newId } from "@/lib/studio/doc";
import { boxCenter, emptyBox, isEmptyBox, rotateAt, scaleAt, translate, unionBox } from "@/lib/studio/geom";
import { clipToSvg, copyNodes, loadClip, storeClip } from "@/lib/studio/clipboard";
import { addAnchorNodes, breakApartNodes, closeNodes, joinNodes, makeClip, makeCompound, releaseClip, resetBoxNodes, reverseNodes } from "@/lib/studio/pathOps";
import {
  alignNodes, arrangeNodes, distributeNodes, duplicateNodes, expandNodes, findNode, groupNodes, isEditable, pasteNodes, removeNodes, selectionBox,
  topLevel, transformNodes, ungroupNodes, walk, type AlignMode,
} from "@/lib/studio/scene";
import { TOOL_IDS } from "@/lib/studio/commands";
import type { Theme } from "@/lib/studio/prefs";
import type { Document, SceneNode, TextNode } from "@/lib/studio/types";
import type { PanelId } from "@/lib/studio/workspace";
import { RESET_FIELD_EVENT, RESET_SECTION_EVENT } from "@/components/ui";
import type { CanvasApi } from "./Canvas";
import type { EditorState } from "./store";

export interface Handler { run: () => void; enabled?: boolean; reason?: string; checked?: boolean }

export interface CommandContext {
  api: StoreApi<EditorState>;
  canvas: () => CanvasApi | null;
  toast: (message: string, undo?: boolean) => void;
  navigate: (href: string) => void;
  openFile: () => void;
  save: () => void;
  saveCopy: () => void;
  download: () => void;
  rename: () => void;
  revert: () => void;
  dialog: (d: "documentSetup" | "move" | "shortcuts" | "preferences" | "palette" | "resetPrefs") => void;
  showPanel: (p: PanelId) => void;
  workspace: string;
  setWorkspace: (id: string) => void;
  resetWorkspace: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  lastField: () => HTMLElement | null;
  viewCenter: () => { x: number; y: number };
}

const NEED_ONE = "Select an object first";
const NEED_TWO = "Select two or more objects";
const NEED_THREE = "Select three or more objects";

function selected(s: EditorState): string[] {
  return topLevel(s.doc.root, s.selection).filter((id) => isEditable(s.doc.root, id));
}

function nodesOf(s: EditorState, pred: (n: SceneNode) => boolean): string[] {
  return s.selection.map((id) => findNode(s.doc.root, id)).filter((n): n is SceneNode => !!n && pred(n)).map((n) => n.id);
}

/** Top-level objects that can be selected (visible, unlocked). */
function selectable(doc: Document): string[] {
  return doc.root.children.filter((n) => !n.hidden && !n.locked).map((n) => n.id);
}

function setLayerDeep(n: SceneNode, layer: number) {
  n.layer = layer;
  if (n.type === "group") n.children.forEach((c) => setLayerDeep(c, layer));
}

const titleCase = (t: string) => t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** What every registry command does in the editor, and whether it can run now. */
export function buildHandlers(ctx: CommandContext): Record<string, Handler> {
  const { api } = ctx;
  const s = api.getState();
  const sel = selected(s);
  const one = sel.length >= 1, two = sel.length >= 2, three = sel.length >= 3;
  const st = () => api.getState();
  const editSel = (label: string, fn: (d: Document, ids: string[]) => void, o?: { mergeKey?: string }) => () => {
    const ids = selected(st());
    if (ids.length) st().edit(label, (d) => fn(d, ids), o);
  };
  const transform = (label: string, make: (c: { x: number; y: number }) => [number, number, number, number, number, number]) => () => {
    const ids = selected(st());
    if (!ids.length) return;
    const m = make(boxCenter(selectionBox(st().doc, ids)));
    st().edit(label, (d) => transformNodes(d, ids, m));
    st().set({ lastTransform: m });
  };
  const paths = nodesOf(s, (n) => n.type === "path");
  const texts = nodesOf(s, (n) => n.type === "text");
  const groups = nodesOf(s, (n) => n.type === "group");
  const clipGroups = nodesOf(s, (n) => n.type === "group" && n.role === "clip");
  const live = nodesOf(s, (n) => n.type === "shape" || n.type === "text" || n.type === "generator");
  const h: Record<string, Handler> = {};
  const set = (id: string, run: () => void, enabled = true, reason?: string, checked?: boolean) => {
    h[id] = { run, enabled, ...(enabled ? {} : { reason }), ...(checked === undefined ? {} : { checked }) };
  };

  const copy = (cut: boolean) => {
    const ids = selected(st());
    if (!ids.length) return;
    const clip = copyNodes(st().doc, ids);
    storeClip(clip);
    const svg = clipToSvg(st().doc, clip);
    try {
      const item = typeof ClipboardItem !== "undefined"
        ? new ClipboardItem({ "text/plain": new Blob([svg], { type: "text/plain" }), "image/svg+xml": new Blob([svg], { type: "image/svg+xml" }) })
        : null;
      if (item && navigator.clipboard?.write) void navigator.clipboard.write([item]).catch(() => navigator.clipboard?.writeText(svg));
      else void navigator.clipboard?.writeText(svg);
    } catch { void navigator.clipboard?.writeText(svg).catch(() => {}); }
    if (cut) st().edit("Cut", (d) => removeNodes(d, ids), { select: [] });
  };
  const paste = (where: "center" | "inPlace" | "front" | "back") => {
    const clip = loadClip();
    if (!clip?.nodes.length) { ctx.toast("The clipboard has no HingeLab objects. SVG import arrives with File → Import."); return; }
    let offset = { x: 0, y: 0 };
    if (where === "center") {
      const b = clip.nodes.reduce((acc, n) => {
        const d: Document = { ...st().doc, root: { ...st().doc.root, children: [n] } };
        return unionBox(acc, selectionBox(d, [n.id]));
      }, emptyBox());
      const c = ctx.viewCenter();
      if (!isEmptyBox(b)) offset = { x: c.x - (b.minX + b.maxX) / 2, y: c.y - (b.minY + b.maxY) / 2 };
    }
    let out: string[] = [];
    st().edit("Paste", (d) => { out = pasteNodes(d, clip.nodes, offset, newId, where === "back" ? "back" : "front"); });
    st().select(out);
  };

  // File
  set("file.new", () => ctx.navigate("/home?new=blank"));
  set("file.open", ctx.openFile);
  set("file.close", () => ctx.navigate("/home"));
  set("file.save", ctx.save);
  set("file.saveCopy", ctx.saveCopy);
  set("file.saveComputer", ctx.download);
  set("file.rename", ctx.rename);
  set("file.revert", ctx.revert, s.history.past.length > 0, "No changes since the project was opened");
  set("file.documentSetup", () => ctx.dialog("documentSetup"));
  set("file.exit", () => ctx.navigate("/home"));
  // Edit
  set("edit.undo", () => { const l = st().undo(); if (l) ctx.toast(`Undo ${l}`); }, s.history.past.length > 0, "Nothing to undo");
  set("edit.redo", () => { const l = st().redo(); if (l) ctx.toast(`Redo ${l}`); }, s.history.future.length > 0, "Nothing to redo");
  set("edit.cut", () => copy(true), one, NEED_ONE);
  set("edit.copy", () => copy(false), one, NEED_ONE);
  set("edit.paste", () => paste("center"));
  set("edit.pasteFront", () => paste("front"));
  set("edit.pasteBack", () => paste("back"));
  set("edit.pasteInPlace", () => paste("inPlace"));
  set("edit.duplicate", () => {
    const ids = selected(st());
    let out: string[] = [];
    st().edit("Duplicate", (d) => { out = duplicateNodes(d, ids, { x: 5, y: 5 }); });
    st().select(out);
  }, one, NEED_ONE);
  set("edit.transformAgain", () => {
    const m = st().lastTransform, ids = selected(st());
    if (m && ids.length) st().edit("Transform Again", (d) => transformNodes(d, ids, m));
  }, one && !!s.lastTransform, one ? "Move, scale or rotate something first" : NEED_ONE);
  set("edit.delete", () => { const ids = selected(st()); st().edit("Delete", (d) => removeNodes(d, ids), { select: [] }); }, one, NEED_ONE);
  set("edit.selectAll", () => st().select(selectable(st().doc)));
  set("edit.reset.field", () => {
    const f = ctx.lastField();
    if (f && document.contains(f)) f.dispatchEvent(new Event(RESET_FIELD_EVENT));
    else ctx.toast("Click in a number field first, then choose Reset ▸ Selected Field.");
  });
  set("edit.reset.section", () => {
    const f = ctx.lastField();
    if (f && document.contains(f) && f.closest(".ui-section")) f.dispatchEvent(new Event(RESET_SECTION_EVENT, { bubbles: true }));
    else ctx.toast("Click in a panel section first, then choose Reset ▸ Section.");
  });
  set("edit.reset.workspace", ctx.resetWorkspace);
  set("edit.reset.preferences", () => ctx.dialog("resetPrefs"));
  set("edit.shortcuts", () => ctx.dialog("shortcuts"));
  set("edit.preferences", () => ctx.dialog("preferences"));
  // Object
  set("object.move", () => ctx.dialog("move"), one, NEED_ONE);
  set("object.rotate90", transform("Rotate", (c) => rotateAt(90, c.x, c.y)), one, NEED_ONE);
  set("object.rotate-90", transform("Rotate", (c) => rotateAt(-90, c.x, c.y)), one, NEED_ONE);
  set("object.reflectH", transform("Reflect", (c) => scaleAt(-1, 1, c.x, c.y)), one, NEED_ONE);
  set("object.reflectV", transform("Reflect", (c) => scaleAt(1, -1, c.x, c.y)), one, NEED_ONE);
  set("object.resetBox", editSel("Reset Bounding Box", resetBoxNodes), paths.length > 0, "Select a path (expand live shapes first)");
  for (const a of ["front", "forward", "backward", "back"] as const) set(`object.${a}`, editSel("Arrange", (d, ids) => arrangeNodes(d, ids, a)), one, NEED_ONE);
  for (const m of ["left", "hcenter", "right", "top", "vcenter", "bottom"] as AlignMode[]) {
    set(`object.align.${m}`, () => {
      const ids = selected(st());
      const sheet = st().doc.sheets[0];
      const to = ids.length === 1 && sheet ? { minX: sheet.x, minY: sheet.y, maxX: sheet.x + sheet.w, maxY: sheet.y + sheet.h } : undefined;
      st().edit("Align", (d) => alignNodes(d, ids, m, to));
    }, one, NEED_ONE);
  }
  set("object.distribute.x", editSel("Distribute", (d, ids) => distributeNodes(d, ids, "x")), three, NEED_THREE);
  set("object.distribute.y", editSel("Distribute", (d, ids) => distributeNodes(d, ids, "y")), three, NEED_THREE);
  set("object.group", () => { const ids = selected(st()); let g: string | null = null; st().edit("Group", (d) => { g = groupNodes(d, ids); }); if (g) st().select([g]); }, two, NEED_TWO);
  set("object.ungroup", () => { let out: string[] = []; st().edit("Ungroup", (d) => { out = ungroupNodes(d, groups); }); st().select(out); }, groups.length > 0, "Select a group");
  set("object.lock", () => {
    const ids = selected(st());
    st().edit("Lock", (d) => ids.forEach((id) => { const n = findNode(d.root, id); if (n) n.locked = true; }), { select: [] });
  }, one, NEED_ONE);
  set("object.unlockAll", () => {
    const out: string[] = [];
    st().edit("Unlock All", (d) => walk(d.root, ({ node }) => { if (node.locked) { node.locked = false; out.push(node.id); } }));
    st().select(out);
  });
  set("object.hide", () => {
    const ids = selected(st());
    st().edit("Hide", (d) => ids.forEach((id) => { const n = findNode(d.root, id); if (n) n.hidden = true; }), { select: [] });
  }, one, NEED_ONE);
  set("object.showAll", () => {
    const out: string[] = [];
    st().edit("Show All", (d) => walk(d.root, ({ node }) => { if (node.hidden) { node.hidden = false; out.push(node.id); } }));
    st().select(out);
  });
  set("object.compound.make", () => { let id: string | null = null; st().edit("Make Compound Path", (d) => { id = makeCompound(d, selected(st())); }); if (id) st().select([id]); }, two, NEED_TWO);
  set("object.compound.release", () => { let out: string[] = []; st().edit("Release Compound Path", (d) => { out = breakApartNodes(d, paths); }); st().select(out); }, paths.some((id) => ((findNode(s.doc.root, id) as { subpaths?: unknown[] })?.subpaths?.length ?? 0) > 1), "Select a compound path");
  set("object.clip.make", () => { let id: string | null = null; st().edit("Make Clipping Mask", (d) => { id = makeClip(d, selected(st())); }); if (id) st().select([id]); }, two, NEED_TWO);
  set("object.clip.release", () => { let out: string[] = []; st().edit("Release Clipping Mask", (d) => { out = releaseClip(d, clipGroups); }); st().select(out); }, clipGroups.length > 0, "Select a clipping group");
  set("object.expand", () => st().edit("Expand", (d) => { expandNodes(d, live); }), live.length > 0, "Select a live shape or text");
  set("object.sheets.fit", () => {
    const d0 = st().doc;
    const b = selectionBox(d0, d0.root.children.filter((n) => !n.hidden).map((n) => n.id));
    if (isEmptyBox(b)) { ctx.toast("There is no artwork to fit the sheet to."); return; }
    st().edit("Fit Sheet to Artwork", (d) => { const sh = d.sheets[0]; sh.x = b.minX; sh.y = b.minY; sh.w = b.maxX - b.minX; sh.h = b.maxY - b.minY; sh.name = "Custom size"; });
  }, s.doc.root.children.length > 0, "The document is empty");
  set("object.sheets.add", () => st().edit("Add Sheet", (d) => {
    const last = d.sheets[d.sheets.length - 1];
    d.sheets.push({ ...last, id: newId(), x: last.x + last.w + 20, name: last.name });
  }));
  // Type
  set("type.outlines", () => st().edit("Create Outlines", (d) => { expandNodes(d, texts); }), texts.length > 0, "Select a text object");
  const textEdit = (label: string, fn: (t: TextNode) => void) => () => st().edit(label, (d) => texts.forEach((id) => { const n = findNode(d.root, id); if (n?.type === "text") fn(n); }));
  set("type.dir.ltr", textEdit("Direction", (t) => { t.direction = "ltr"; }), texts.length > 0, "Select a text object");
  set("type.dir.rtl", textEdit("Direction", (t) => { t.direction = "rtl"; }), texts.length > 0, "Select a text object");
  set("type.case.upper", textEdit("Change Case", (t) => { t.text = t.text.toUpperCase(); }), texts.length > 0, "Select a text object");
  set("type.case.lower", textEdit("Change Case", (t) => { t.text = t.text.toLowerCase(); }), texts.length > 0, "Select a text object");
  set("type.case.title", textEdit("Change Case", (t) => { t.text = titleCase(t.text); }), texts.length > 0, "Select a text object");
  // Select
  set("select.none", () => st().select([]), s.selection.length > 0, "Nothing is selected");
  set("select.inverse", () => { const cur = new Set(st().selection); st().select(selectable(st().doc).filter((id) => !cur.has(id))); });
  set("select.sameLayer", () => {
    const layers = new Set(sel.map((id) => findNode(st().doc.root, id)!.layer));
    st().select(st().doc.root.children.filter((n) => !n.hidden && !n.locked && layers.has(n.layer)).map((n) => n.id));
  }, one, NEED_ONE);
  set("select.sameType", () => {
    const types = new Set(sel.map((id) => findNode(st().doc.root, id)!.type));
    st().select(st().doc.root.children.filter((n) => !n.hidden && !n.locked && types.has(n.type)).map((n) => n.id));
  }, one, NEED_ONE);
  set("select.openPaths", () => {
    const out: string[] = [];
    walk(st().doc.root, ({ node }) => { if (!node.hidden && !node.locked && node.type === "path" && node.subpaths.some((p) => !p.closed)) out.push(node.id); });
    st().select(out);
    ctx.toast(out.length ? `${out.length} open path${out.length === 1 ? "" : "s"} selected` : "No open paths");
  });
  const step = (dir: 1 | -1) => () => {
    const all = selectable(st().doc);
    if (!all.length) return;
    const cur = all.indexOf(st().selection[st().selection.length - 1]);
    st().select([all[(cur + dir + all.length + (cur < 0 && dir === 1 ? 1 : 0)) % all.length]]);
  };
  set("select.next", step(1));
  set("select.prev", step(-1));
  // Path
  set("path.join", () => { let id: string | null = null; st().edit("Join", (d) => { id = joinNodes(d, paths); }); if (id) st().select([id]); else ctx.toast("There are no open ends to join."); }, paths.length > 0, "Select open paths");
  set("path.close", editSel("Close Path", (d) => closeNodes(d, paths)), paths.length > 0, "Select a path");
  set("path.reverse", editSel("Reverse Direction", (d) => reverseNodes(d, paths)), paths.length > 0, "Select a path");
  set("path.breakApart", () => { let out: string[] = []; st().edit("Break Apart", (d) => { out = breakApartNodes(d, paths); }); st().select(out); }, paths.length > 0, "Select a path");
  set("path.addAnchors", editSel("Add Anchor Points", (d) => addAnchorNodes(d, paths)), paths.length > 0, "Select a path");
  // Laser
  for (let k = 0; k < 30; k++) {
    set(`laser.assign.${k}`, () => {
      st().set({ currentLayer: k });
      const ids = selected(st());
      if (ids.length) st().edit("Assign Cut Layer", (d) => ids.forEach((id) => { const n = findNode(d.root, id); if (n) setLayerDeep(n, k); }));
    }, true, undefined, sel.length > 0 && sel.every((id) => findNode(s.doc.root, id)?.layer === k));
  }
  // View
  const cv = (fn: (c: CanvasApi) => void) => () => { const c = ctx.canvas(); if (c) fn(c); };
  set("view.zoomIn", cv((c) => c.zoomBy(1.25)));
  set("view.zoomOut", cv((c) => c.zoomBy(0.8)));
  set("view.fitArtboard", cv((c) => c.fit("artboard")));
  set("view.fitAll", cv((c) => c.fit("all")));
  set("view.actual", cv((c) => c.actual()));
  set("view.zoomSelection", cv((c) => c.fit("selection")), one, NEED_ONE);
  set("view.outline", () => st().setUi({ outline: !st().ui.outline }), true, undefined, s.ui.outline);
  set("view.rulers", () => st().setUi({ rulers: !st().ui.rulers }), true, undefined, s.ui.rulers);
  set("view.guides.show", () => st().setUi({ guidesShown: !st().ui.guidesShown }), true, undefined, s.ui.guidesShown);
  set("view.guides.lock", () => st().setUi({ guidesLocked: !st().ui.guidesLocked }), true, undefined, s.ui.guidesLocked);
  set("view.guides.fromSelection", () => {
    const b = selectionBox(st().doc, selected(st()));
    if (isEmptyBox(b)) return;
    st().edit("Make Guides", (d) => { d.guides.push({ axis: "x", at: b.minX }, { axis: "x", at: b.maxX }, { axis: "y", at: b.minY }, { axis: "y", at: b.maxY }); });
    st().setUi({ guidesShown: true });
  }, one, NEED_ONE);
  set("view.guides.clear", () => st().edit("Clear Guides", (d) => { d.guides = []; }), s.doc.guides.length > 0, "There are no guides");
  set("view.grid", () => st().quiet((d) => { d.grid.show = !d.grid.show; }), true, undefined, s.doc.grid.show);
  set("view.snapGrid", () => st().quiet((d) => { d.snapping.grid = !d.snapping.grid; }), true, undefined, s.doc.snapping.grid);
  set("view.snapPoint", () => st().quiet((d) => { d.snapping.points = !d.snapping.points; }), true, undefined, s.doc.snapping.points);
  set("view.smartGuides", () => st().quiet((d) => { d.snapping.smart = !d.snapping.smart; }), true, undefined, s.doc.snapping.smart);
  set("view.presentation", () => { st().setUi({ presentation: !st().ui.presentation }); requestAnimationFrame(() => ctx.canvas()?.fit("artboard")); }, true, undefined, s.ui.presentation);
  for (const t of ["dark", "darker", "light", "system"] as const) set(`view.theme.${t}`, () => ctx.setTheme(t), true, undefined, ctx.theme === t);
  // Window
  const panels: [string, PanelId][] = [["properties", "properties"], ["layers", "layers"], ["cutLayers", "cutLayers"], ["align", "align"], ["history", "history"], ["document", "document"]];
  for (const [id, p] of panels) set(`window.panel.${id}`, () => ctx.showPanel(p));
  for (const w of ["essentials", "laser", "typography", "minimal"]) set(`window.workspace.${w}`, () => ctx.setWorkspace(w), true, undefined, ctx.workspace === w);
  set("window.workspace.reset", ctx.resetWorkspace);
  set("window.palette", () => ctx.dialog("palette"));
  // Help
  set("help.search", () => window.open("/help", "_blank", "noopener"));
  set("help.shortcuts", () => window.open("/help#shortcuts", "_blank", "noopener"));
  set("help.whatsNew", () => window.open("/help#whats-new", "_blank", "noopener"));
  set("help.about", () => ctx.toast("HingeLab Studio — a design studio for laser cutting."));
  // Tools
  for (const t of TOOL_IDS) set(`tool.${t}`, () => st().setTool(t), true, undefined, s.tool === t);
  return h;
}
