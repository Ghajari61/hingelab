"use client";

import type { StoreApi } from "zustand";
import { newId } from "@/lib/studio/doc";
import { boxCenter, emptyBox, invert, isEmptyBox, mul, rotateAt, scaleAt, translate, unionBox } from "@/lib/studio/geom";
import {
  anchorsCenter, breakAt, canJoinEnds, curveSegments, deleteSegments, editAnchors, hasSelectedSegment, insertMidpoints, joinAnchors, setKinds,
  straightenSegments, transformSelected, type MSub, type NodeRef,
} from "@/lib/studio/nodeOps";
import { cutPathNodes, flattenNodes, fractureNodes, insetOutsetNodes, removeDuplicateNodesIn, splitPathNodes } from "@/lib/studio/pathMenu";
import { clipToSvg, copyNodes, loadClip, storeClip } from "@/lib/studio/clipboard";
import { canHaveEffects, EFFECT_KINDS, EFFECTS, hasEffects } from "@/lib/studio/effects";
import { addEffect } from "@/lib/studio/effects/ops";
import { addAnchorNodes, breakApartNodes, closeNodes, joinNodes, makeClip, makeCompound, releaseClip, resetBoxNodes, reverseNodes } from "@/lib/studio/pathOps";
import { distributeSpacing } from "@/lib/studio/arrays";
import { BOOLEAN_LABELS, booleanOp, cleanupForLaser, editPaths, smoothSubpath, type BooleanOp } from "@/lib/studio/pathfinder";
import {
  alignNodes, arrangeNodes, distributeNodes, duplicateNodes, expandNodes, findNode, groupNodes, isEditable, pasteNodes, removeNodes, selectionBox,
  topLevel, transformNodes, ungroupNodes, walk, type AlignMode,
} from "@/lib/studio/scene";
import { TOOL_IDS } from "@/lib/studio/commands";
import type { Theme } from "@/lib/studio/prefs";
import type { Document, Mat, SceneNode, TextNode } from "@/lib/studio/types";
import type { PanelId } from "@/lib/studio/workspace";
import { RESET_FIELD_EVENT, RESET_SECTION_EVENT } from "@/components/ui";
import type { CanvasApi } from "./Canvas";
import type { EditorState } from "./store";

export interface Handler { run: () => void; enabled?: boolean; reason?: string; checked?: boolean }

export type EditorDialog = "documentSetup" | "move" | "shortcuts" | "preferences" | "palette" | "resetPrefs" | "offset" | "simplify" | "corners"
  | "stepRepeat" | "transformEach" | "gridArray" | "circularArray" | "pathArray" | "strokeToPath" | "joinNearby";

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
  dialog: (d: EditorDialog) => void;
  showPanel: (p: PanelId) => void;
  workspace: string;
  setWorkspace: (id: string) => void;
  resetWorkspace: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  lastField: () => HTMLElement | null;
  viewCenter: () => { x: number; y: number };
  /** Preferences → Inset / Outset step, mm. */
  offsetStep: number;
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
  const live = nodesOf(s, (n) => n.type === "shape" || n.type === "text" || n.type === "generator" || hasEffects(n));
  const withFx = nodesOf(s, hasEffects);
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
      const s1 = st();
      const ids = selected(s1);
      const sheet = s1.doc.sheets[0];
      const sheetBox = sheet ? { minX: sheet.x, minY: sheet.y, maxX: sheet.x + sheet.w, maxY: sheet.y + sheet.h } : undefined;
      const key = s1.selection.filter((id) => ids.includes(id)).at(-1);
      const to = s1.alignTo === "artboard" || ids.length === 1 ? sheetBox
        : s1.alignTo === "key" && key ? selectionBox(s1.doc, [key]) : undefined;
      st().edit("Align", (d) => alignNodes(d, ids, m, to));
    }, one, NEED_ONE);
  }
  set("object.distribute.x", editSel("Distribute", (d, ids) => distributeNodes(d, ids, "x")), three, NEED_THREE);
  set("object.distribute.y", editSel("Distribute", (d, ids) => distributeNodes(d, ids, "y")), three, NEED_THREE);
  const spacingOk = s.alignGap === null ? three : two;
  set("object.distribute.spaceX", editSel("Distribute Spacing", (d, ids) => distributeSpacing(d, ids, "x", st().alignGap)), spacingOk, s.alignGap === null ? NEED_THREE : NEED_TWO);
  set("object.distribute.spaceY", editSel("Distribute Spacing", (d, ids) => distributeSpacing(d, ids, "y", st().alignGap)), spacingOk, s.alignGap === null ? NEED_THREE : NEED_TWO);
  set("object.stepRepeat", () => ctx.dialog("stepRepeat"), one, NEED_ONE);
  set("object.transformEach", () => ctx.dialog("transformEach"), one, NEED_ONE);
  set("object.array.grid", () => ctx.dialog("gridArray"), one, NEED_ONE);
  set("object.array.circular", () => ctx.dialog("circularArray"), one, NEED_ONE);
  set("object.array.path", () => ctx.dialog("pathArray"), two, "Select the objects and, on top, a path to follow");
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
  set("object.expand", () => st().edit("Expand", (d) => { expandNodes(d, live); }), live.length > 0, "Select a live shape, text or an object with Live Effects");
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
  const outlines = sel.filter((id) => { const t = findNode(s.doc.root, id)?.type; return t === "path" || t === "shape" || t === "text" || t === "group"; });
  const anyOutline = outlines.length > 0, twoOutlines = outlines.length >= 2 || groups.length > 0;
  set("path.offset", () => ctx.dialog("offset"), anyOutline, "Select a path, shape or text");
  set("path.simplify", () => ctx.dialog("simplify"), anyOutline, "Select a path, shape or text");
  set("path.roundCorners", () => ctx.dialog("corners"), anyOutline, "Select a path, shape or text");
  const fxTargets = (state: EditorState) => selected(state).filter((id) => { const n = findNode(state.doc.root, id); return !!n && canHaveEffects(n); });
  const canFx = fxTargets(s).length > 0;
  for (const k of EFFECT_KINDS) {
    set(`path.effect.add.${k}`, () => {
      const ids = fxTargets(st());
      if (!ids.length) return;
      st().edit(`Add Live Effect: ${EFFECTS[k].label}`, (d) => { addEffect(d, ids, k); });
      ctx.showPanel("liveEffects");
    }, canFx, "Select a path, shape or text");
  }
  set("path.effect.expand", () => st().edit("Expand Live Effects", (d) => { expandNodes(d, withFx); }), withFx.length > 0, "Select an object with Live Effects");
  set("path.smooth", () => { const ids = selected(st()); st().edit("Smooth", (d) => { editPaths(d, ids, smoothSubpath); }); }, anyOutline, "Select a path, shape or text");
  for (const op of Object.keys(BOOLEAN_LABELS) as BooleanOp[]) {
    const single = op === "divide" || op === "trim";
    set(`path.pf.${op}`, () => {
      const ids = selected(st());
      let r: { ids: string[]; error?: string } = { ids: [] };
      st().edit(BOOLEAN_LABELS[op], (d) => { r = booleanOp(d, ids, op); });
      if (r.error) ctx.toast(r.error);
      else st().select(r.ids);
    }, single ? anyOutline : twoOutlines, single ? "Select shapes to split" : "Select two or more closed shapes");
  }
  const pfRun = (label: string, fn: (d: Document, ids: string[]) => { ids: string[]; error?: string }) => () => {
    const ids = selected(st());
    let r: { ids: string[]; error?: string } = { ids: [] };
    st().edit(label, (d) => { r = fn(d, ids); });
    if (r.error) ctx.toast(r.error);
    else st().select(r.ids);
  };
  set("path.fracture", pfRun("Fracture", (d, ids) => fractureNodes(d, ids)), anyOutline, "Select overlapping closed shapes");
  set("path.flatten", pfRun("Flatten", flattenNodes), twoOutlines, "Select two or more overlapping closed shapes");
  set("path.cutPath", pfRun("Cut Path", cutPathNodes), twoOutlines, "Select paths and, on top, the path that cuts them");
  set("path.splitPath", () => { let out: string[] = []; st().edit("Split Path", (d) => { out = splitPathNodes(d, selected(st())); }); st().select(out); }, anyOutline, "Select a path with several parts");
  set("path.strokeToPath", () => ctx.dialog("strokeToPath"), anyOutline, "Select a path, shape or text");
  const offStep = ctx.offsetStep;
  for (const [id, label, delta] of [["path.inset", "Inset", -offStep], ["path.outset", "Outset", offStep]] as const) {
    set(id, () => {
      const ids = selected(st());
      let out: string[] = [];
      st().edit(label, (d) => { out = insetOutsetNodes(d, ids, delta); });
      if (out.length) st().select(out); else ctx.toast(delta < 0 ? "The shapes are too small to inset by that step" : "Select closed shapes");
    }, anyOutline, "Select closed shapes");
  }
  set("path.removeDuplicates", () => {
    const ids = selected(st());
    let n = 0;
    st().edit("Remove Duplicate Nodes", (d) => { n = removeDuplicateNodesIn(d, ids); });
    ctx.toast(n ? `Removed ${n} duplicate node${n === 1 ? "" : "s"}` : "No duplicate nodes found", n > 0);
  }, paths.length > 0, "Select a path");
  set("path.joinNearby", () => ctx.dialog("joinNearby"), paths.length > 0, "Select paths with open ends");
  // Nodes (Direct Selection)
  const refs = s.tool === "direct" ? s.anchors : [];
  const NEED_NODES = "Select nodes with Direct Selection";
  const nodeEdit = (label: string, fn: (ms: MSub[], world: Mat) => MSub[] | null) => () => {
    const r = st().anchors;
    if (!r.length) return;
    let out: NodeRef[] = r;
    st().edit(label, (d) => { out = editAnchors(d, r, fn); });
    st().setAnchors(out);
  };
  const segOk = refs.length > 1 && hasSelectedSegment(s.doc, refs);
  const NEED_SEG = "Select both ends of a segment";
  set("node.insert", nodeEdit("Insert Nodes", insertMidpoints), segOk, NEED_SEG);
  set("node.break", nodeEdit("Break Path", breakAt), refs.length > 0, NEED_NODES);
  for (const [id, label, merge] of [["node.join", "Join Nodes", true], ["node.joinSegment", "Join Nodes with Segment", false]] as const) {
    set(id, () => {
      const r = st().anchors;
      let out: NodeRef[] | null = null;
      st().edit(label, (d) => { out = joinAnchors(d, r, merge); });
      if (out) st().setAnchors(out);
    }, canJoinEnds(s.doc, refs), "Select two end nodes of open paths");
  }
  set("node.deleteSegment", nodeEdit("Delete Segment", deleteSegments), segOk, NEED_SEG);
  for (const [id, kind, label] of [["node.corner", "corner", "Corner"], ["node.smooth", "smooth", "Smooth"], ["node.symmetric", "symmetric", "Symmetric"], ["node.auto", "auto", "Auto-Smooth"]] as const) {
    set(id, nodeEdit(`Make Nodes ${label}`, (ms) => setKinds(ms, kind)), refs.length > 0, NEED_NODES);
  }
  set("node.straighten", nodeEdit("Straighten Segments", straightenSegments), segOk, NEED_SEG);
  set("node.curve", nodeEdit("Make Segments Curves", curveSegments), segOk, NEED_SEG);
  const nodeTransform = (label: string, make: (c: { x: number; y: number }) => Mat) => () => {
    const r = st().anchors;
    const c = anchorsCenter(st().doc, r);
    if (!c) return;
    const m = make(c);
    let out: NodeRef[] = r;
    st().edit(label, (d) => { out = editAnchors(d, r, (ms, world) => transformSelected(ms, mul(invert(world), mul(m, world)))); }, { mergeKey: `node-${label}` });
    st().setAnchors(out);
  };
  set("node.scaleUp", nodeTransform("Scale Nodes", (c) => scaleAt(1.1, 1.1, c.x, c.y)), refs.length > 0, NEED_NODES);
  set("node.scaleDown", nodeTransform("Scale Nodes", (c) => scaleAt(1 / 1.1, 1 / 1.1, c.x, c.y)), refs.length > 0, NEED_NODES);
  set("node.rotateCCW", nodeTransform("Rotate Nodes", (c) => rotateAt(-15, c.x, c.y)), refs.length > 0, NEED_NODES);
  set("node.rotateCW", nodeTransform("Rotate Nodes", (c) => rotateAt(15, c.x, c.y)), refs.length > 0, NEED_NODES);
  set("path.cleanup", () => {
    const ids = selected(st());
    let r = { points: 0, closed: 0, removed: 0, duplicates: 0 };
    st().edit("Clean Up for Laser", (d) => { r = cleanupForLaser(d, ids.length ? ids : null); });
    const parts = [
      r.closed && `${r.closed} path${r.closed === 1 ? "" : "s"} closed`,
      r.duplicates && `${r.duplicates} double cut${r.duplicates === 1 ? "" : "s"} removed`,
      r.removed && `${r.removed} empty path${r.removed === 1 ? "" : "s"} removed`,
      r.points && `${r.points} stray point${r.points === 1 ? "" : "s"} removed`,
    ].filter(Boolean);
    ctx.toast(parts.length ? `Clean up: ${parts.join(", ")}` : "Nothing to clean up — the paths are ready to cut", parts.length > 0);
  }, s.doc.root.children.length > 0, "The document is empty");
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
  set("view.nodeHandles", () => st().setUi({ nodeHandles: !st().ui.nodeHandles }), true, undefined, s.ui.nodeHandles);
  set("view.pathDirection", () => st().setUi({ pathDirection: !st().ui.pathDirection }), true, undefined, s.ui.pathDirection);
  set("view.presentation", () => { st().setUi({ presentation: !st().ui.presentation }); requestAnimationFrame(() => ctx.canvas()?.fit("artboard")); }, true, undefined, s.ui.presentation);
  for (const t of ["dark", "darker", "light", "system"] as const) set(`view.theme.${t}`, () => ctx.setTheme(t), true, undefined, ctx.theme === t);
  // Window
  const panels: [string, PanelId][] = [["properties", "properties"], ["layers", "layers"], ["cutLayers", "cutLayers"], ["align", "align"], ["pathfinder", "pathfinder"], ["history", "history"], ["document", "document"], ["liveEffects", "liveEffects"]];
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
