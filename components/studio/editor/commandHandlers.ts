"use client";

import type { StoreApi } from "zustand";
import { newId } from "@/lib/studio/doc";
import { boxCenter, emptyBox, invert, isEmptyBox, mul, rotateAt, scaleAt, translate, unionBox } from "@/lib/studio/geom";
import {
  alignSelected, anchorsCenter, breakAt, canJoinEnds, curveSegments, deleteSegments, editAnchors, extractSubpaths, hasSelectedSegment, insertMidpoints, joinAnchors,
  setKinds, straightenSegments, transformSelected, type MSub, type NodeRef,
} from "@/lib/studio/nodeOps";
import { cutPathNodes, flattenNodes, fractureNodes, insetOutsetNodes, removeDuplicateNodesIn, splitPathNodes } from "@/lib/studio/pathMenu";
import { clipToSvg, copyNodes, loadClip, storeClip } from "@/lib/studio/clipboard";
import { canHaveEffects, EFFECT_KINDS, EFFECTS, hasEffects } from "@/lib/studio/effects";
import { LINK_SPACE } from "@/lib/studio/effects/meta";
import { addEffect, addLinkedEffect, stackOrder } from "@/lib/studio/effects/ops";
import { addAnchorNodes, breakApartNodes, closeNodes, joinNodes, makeClip, makeCompound, releaseClip, resetBoxNodes, reverseNodes } from "@/lib/studio/pathOps";
import { distributeSpacing } from "@/lib/studio/arrays";
import { alignAnchors, alignTarget, exchangePositions, removeOverlaps } from "@/lib/studio/alignOps";
import { cloneNodes, clonesOf, originalsOf, relinkClones, removeClonesOf, unlinkClones, wouldCycle } from "@/lib/studio/links";
import { canCarryText, canHoldText, clearManual, flowIntoShape, hasManual, putOnPath, removeFromPath, setVertical, unflow } from "@/lib/studio/textOps";
import { clipBox, pasteSize, pasteStyle } from "@/lib/studio/pasteOps";
import { BOOLEAN_LABELS, booleanOp, cleanupForLaser, createBoundary, editPaths, smoothSubpath, type BooleanOp } from "@/lib/studio/pathfinder";
import {
  alignNodes, arrangeNodes, distributeNodes, duplicateNodes, expandNodes, findNode, groupNodes, isEditable, pasteNodes, removeNodes, selectionBox,
  topLevel, transformNodes, ungroupNodes, walk, type AlignMode,
} from "@/lib/studio/scene";
import { TOOL_IDS } from "@/lib/studio/commands";
import type { Theme } from "@/lib/studio/prefs";
import { isTurned, PX_PER_MM } from "@/lib/studio/viewTransform";
import type { Document, Mat, SceneNode, TextNode } from "@/lib/studio/types";
import type { PanelId } from "@/lib/studio/workspace";
import { RESET_FIELD_EVENT, RESET_SECTION_EVENT } from "@/components/ui";
import type { CanvasApi } from "./Canvas";
import type { EditorState } from "./store";
import { runPreflight, type Notify } from "./preflightToast";
import { textLayoutNow } from "./textRuntime";

export interface Handler { run: () => void; enabled?: boolean; reason?: string; checked?: boolean }

export type EditorDialog = "documentSetup" | "move" | "shortcuts" | "preferences" | "palette" | "resetPrefs" | "offset" | "contour" | "simplify" | "corners"
  | "stepRepeat" | "transformEach" | "gridArray" | "circularArray" | "pathArray" | "strokeToPath" | "joinNearby" | "transform" | "arrange" | "tiledClones" | "traceBitmap";

export interface CommandContext {
  api: StoreApi<EditorState>;
  canvas: () => CanvasApi | null;
  toast: (message: string, undo?: boolean) => void;
  /** A toast with an optional action button (pre-flight's "Select them"). */
  notify?: Notify;
  navigate: (href: string) => void;
  openFile: () => void;
  /** File ▸ Import SVG…: opens the file picker; the editor places the drawing. */
  importSvg?: () => void;
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
  /** Preferences → snap angle, degrees (15 when absent). */
  snapAngle?: number;
  /** View ▸ Swatch Bar state and toggle (the editor's workspace layout). */
  swatchBar?: boolean;
  toggleSwatchBar?: () => void;
  /** Opens the snapping options popover in the status bar. */
  openSnapOptions?: () => void;
  /** View ▸ 3D Assembly: whether it is shown, and the switch between it and the drawing. */
  view3d?: boolean;
  toggleView3d?: () => void;
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
  const preflight = (ids: string[], label: string, open = true) => runPreflight(api, ctx.notify ?? ((m) => ctx.toast(m)), ids, label, open);
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
  const live = nodesOf(s, (n) => n.type === "shape" || n.type === "text" || n.type === "generator" || n.type === "clone" || hasEffects(n) || (n.type === "path" && !!n.connector));
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
    if (!clip?.nodes.length) { ctx.toast("The clipboard has no HingeLab objects. To bring in an SVG drawing, use File ▸ Import SVG… (Ctrl+I)."); return; }
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
  set("file.import", () => ctx.importSvg?.(), !!ctx.importSvg, "Import is not available here");
  set("file.templates", () => ctx.navigate("/templates"));
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
  const fromClip = () => {
    const clip = loadClip();
    if (!clip?.nodes.length) ctx.toast("Copy an object first.");
    return clip?.nodes.length ? clip.nodes : null;
  };
  for (const [suffix, mode, sep, label] of [
    ["width", "width", false, "Paste Width"], ["height", "height", false, "Paste Height"], ["both", "both", false, "Paste Size"],
    ["widthSep", "width", true, "Paste Width Separately"], ["heightSep", "height", true, "Paste Height Separately"], ["bothSep", "both", true, "Paste Size Separately"],
  ] as const) {
    set(`edit.pasteSize.${suffix}`, () => {
      const nodes = fromClip(), ids = selected(st());
      if (!nodes || !ids.length) return;
      const target = clipBox(nodes), { refPoint, lockRatio } = st();
      st().edit(label, (d) => { pasteSize(d, ids, target, mode, sep, refPoint, lockRatio); });
    }, one, NEED_ONE);
  }
  set("edit.pasteStyle", () => {
    const nodes = fromClip(), ids = selected(st());
    if (nodes && ids.length) st().edit("Paste Style", (d) => { pasteStyle(d, ids, nodes[0]); });
  }, one, NEED_ONE);
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
  const nodeAlign = s.tool === "direct" && s.anchors.length >= 2;
  for (const m of ["left", "hcenter", "right", "top", "vcenter", "bottom"] as AlignMode[]) {
    set(`object.align.${m}`, () => {
      const s1 = st();
      if (s1.tool === "direct" && s1.anchors.length >= 2) {
        const r = s1.anchors;
        let out: NodeRef[] = r;
        s1.edit("Align Nodes", (d) => { out = alignAnchors(d, r, m); });
        st().setAnchors(out);
        return;
      }
      const ids = selected(s1);
      const to = alignTarget(s1.doc, ids, ids.length === 1 ? "artboard" : s1.alignTo);
      st().edit("Align", (d) => alignNodes(d, ids, m, to));
    }, one || nodeAlign, NEED_ONE);
  }
  set("object.distribute.x", editSel("Distribute", (d, ids) => distributeNodes(d, ids, "x")), three, NEED_THREE);
  set("object.distribute.y", editSel("Distribute", (d, ids) => distributeNodes(d, ids, "y")), three, NEED_THREE);
  const spacingOk = s.alignGap === null ? three : two;
  set("object.distribute.spaceX", editSel("Distribute Spacing", (d, ids) => distributeSpacing(d, ids, "x", st().alignGap)), spacingOk, s.alignGap === null ? NEED_THREE : NEED_TWO);
  set("object.distribute.spaceY", editSel("Distribute Spacing", (d, ids) => distributeSpacing(d, ids, "y", st().alignGap)), spacingOk, s.alignGap === null ? NEED_THREE : NEED_TWO);
  set("object.removeOverlaps", editSel("Remove Overlaps", (d, ids) => { removeOverlaps(d, ids, st().alignGap ?? 0); }), two, NEED_TWO);
  for (const o of ["selection", "stack", "clockwise", "random"] as const) {
    set(`object.exchange.${o}`, () => {
      const seed = Math.floor(Math.random() * 2 ** 31);
      editSel("Exchange Positions", (d, ids) => exchangePositions(d, ids, o, seed))();
    }, two, NEED_TWO);
  }
  set("object.transform", () => ctx.dialog("transform"), one, NEED_ONE);
  set("object.arrange", () => ctx.dialog("arrange"), two, NEED_TWO);
  // Clones
  const clones = nodesOf(s, (n) => n.type === "clone");
  const NEED_CLONE = "Select a clone";
  set("object.clone", () => {
    const ids = selected(st());
    let out: string[] = [];
    st().edit("Clone", (d) => { out = cloneNodes(d, ids); });
    st().select(out);
  }, one, NEED_ONE);
  set("object.clone.linkedOffset", () => {
    const ids = selected(st());
    let out: string[] = [];
    st().edit("Linked Offset", (d) => { out = cloneNodes(d, ids); addEffect(d, out, "offset"); });
    st().select(out);
    ctx.showPanel("liveEffects");
  }, one, NEED_ONE);
  set("object.clone.unlink", () => {
    const ids = nodesOf(st(), (n) => n.type === "clone");
    st().edit("Unlink Clone", (d) => { unlinkClones(d, ids); });
  }, clones.length > 0, NEED_CLONE);
  set("object.clone.selectOriginal", () => {
    const out = originalsOf(st().doc, nodesOf(st(), (n) => n.type === "clone"));
    if (out.length) st().select(out);
  }, clones.length > 0, NEED_CLONE);
  set("object.clone.relink", () => {
    const src = loadClip()?.nodes[0]?.id;
    if (!src || !findNode(st().doc.root, src)) { ctx.toast("Copy the object the clones should follow first (it must be in this document)."); return; }
    const ids = nodesOf(st(), (n) => n.type === "clone");
    let out: string[] = [];
    st().edit("Relink to Copied", (d) => { out = relinkClones(d, ids, src); });
    if (out.length < ids.length) ctx.toast("A clone can't follow itself or one of its own clones; those were left as they were.");
  }, clones.length > 0, NEED_CLONE);
  set("object.clone.tiled", () => ctx.dialog("tiledClones"), sel.length === 1, "Select one object to tile");
  set("object.clone.removeTiled", () => {
    const ids = selected(st());
    let n = 0;
    st().edit("Remove Tiled Clones", (d) => { n = removeClonesOf(d, ids); });
    ctx.toast(`Removed ${n} clone${n === 1 ? "" : "s"}`, true);
  }, one && clonesOf(s.doc, sel).length > 0, one ? "The selected objects have no clones" : NEED_ONE);
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
  set("object.expand", () => st().edit("Expand", (d) => {
    expandNodes(d, live);
    for (const id of live) { const n = findNode(d.root, id); if (n?.type === "path") delete n.connector; }
  }), live.length > 0, "Select a live shape, text, clone, connector or an object with Live Effects");
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
  /** One text and one other object that suits it (text on a path / flow into a shape). */
  const textPair = (ok: (n: SceneNode) => boolean) => {
    if (sel.length !== 2) return null;
    const ns = sel.map((id) => findNode(s.doc.root, id)!);
    const t = ns.find((n) => n.type === "text"), o = ns.find((n) => n !== t);
    return t && o && ok(o) && !wouldCycle(s.doc, t.id, o.id) ? { text: t.id, other: o.id } : null;
  };
  const textNodes = (ids: string[]) => ids.map((id) => findNode(s.doc.root, id) as TextNode);
  const onPathPair = textPair(canCarryText), flowPair = textPair(canHoldText);
  const onPath = nodesOf(s, (n) => n.type === "text" && !!n.onPath), flowed = nodesOf(s, (n) => n.type === "text" && !!n.flowInto);
  const straight = nodesOf(s, (n) => n.type === "text" && !n.onPath && !n.flowInto);
  const kerned = nodesOf(s, (n) => n.type === "text" && hasManual(n));
  set("type.putOnPath", () => { if (onPathPair) st().edit("Put on Path", (d) => { putOnPath(d, onPathPair.text, onPathPair.other); }, { select: [onPathPair.text] }); },
    !!onPathPair, "Select one text and one path or shape");
  set("type.removeFromPath", () => st().edit("Remove from Path", (d) => { onPath.forEach((id) => removeFromPath(d, id)); }), onPath.length > 0, "Select a text on a path");
  const otherSide = onPath.length > 0 && textNodes(onPath).every((t) => t.pathSide === "right");
  set("type.pathSide", textEdit("Text on Other Side of Path", (t) => { if (!t.onPath) return; if (otherSide) delete t.pathSide; else t.pathSide = "right"; }), onPath.length > 0, "Select a text on a path", otherSide);
  set("type.flowIntoShape", () => { if (flowPair) st().edit("Flow into Shape", (d) => { flowIntoShape(d, flowPair.text, flowPair.other); }, { select: [flowPair.text] }); },
    !!flowPair, "Select one text and one closed shape");
  set("type.unflow", () => {
    const first = new Map(textNodes(flowed).map((t) => [t.id, textLayoutNow(t.font, t)?.lines[0]?.baseline]));
    st().edit("Unflow", (d) => { flowed.forEach((id) => unflow(d, id, first.get(id))); });
  }, flowed.length > 0, "Select flowed text");
  const allVertical = straight.length > 0 && textNodes(straight).every((t) => t.vertical);
  set("type.dir.horizontal", () => st().edit("Horizontal Type", (d) => { setVertical(d, straight, false); }), straight.length > 0, "Select a text that is not on a path or flowed", straight.length > 0 && !allVertical);
  set("type.dir.vertical", () => st().edit("Vertical Type", (d) => { setVertical(d, straight, true); }), straight.length > 0, "Select a text that is not on a path or flowed", allVertical);
  set("type.removeKerns", () => st().edit("Remove Manual Kerns", (d) => { kerned.forEach((id) => { const n = findNode(d.root, id); if (n?.type === "text") clearManual(n); }); }), kerned.length > 0, "Select a text with manual kerning");
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
  set("path.contour", () => ctx.dialog("contour"), anyOutline, "Select a path, shape or text");
  set("path.boundary", () => {
    const ids = selected(st());
    let out: string | null = null;
    st().edit("Create Boundary", (d) => { out = createBoundary(d, ids, st().currentLayer); });
    if (out) st().select([out]); else ctx.toast("Select closed shapes to draw a boundary round.");
  }, anyOutline, "Select closed shapes");
  set("path.simplify", () => ctx.dialog("simplify"), anyOutline, "Select a path, shape or text");
  set("path.roundCorners", () => ctx.dialog("corners"), anyOutline, "Select a path, shape or text");
  const fxTargets = (state: EditorState) => selected(state).filter((id) => { const n = findNode(state.doc.root, id); return !!n && canHaveEffects(n); });
  const canFx = fxTargets(s).length > 0;
  for (const k of EFFECT_KINDS) {
    set(`path.effect.add.${k}`, () => {
      const two = selected(st());
      if (LINK_SPACE[k] && two.length === 2) {
        const [bottom, top] = stackOrder(st().doc, two);
        const b = findNode(st().doc.root, bottom);
        if (b && canHaveEffects(b)) {
          st().edit(`Add Live Effect: ${EFFECTS[k].label}`, (d) => { addLinkedEffect(d, bottom, top, k); }, { select: [bottom] });
          ctx.showPanel("liveEffects");
          return;
        }
      }
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
      else { st().select(r.ids); preflight(r.ids, BOOLEAN_LABELS[op]); }
    }, single ? anyOutline : twoOutlines, single ? "Select shapes to split" : "Select two or more closed shapes");
  }
  const pfRun = (label: string, fn: (d: Document, ids: string[]) => { ids: string[]; error?: string }, open = true) => () => {
    const ids = selected(st());
    let r: { ids: string[]; error?: string } = { ids: [] };
    st().edit(label, (d) => { r = fn(d, ids); });
    if (r.error) ctx.toast(r.error);
    else { st().select(r.ids); preflight(r.ids, label, open); }
  };
  set("path.fracture", pfRun("Fracture", (d, ids) => fractureNodes(d, ids)), anyOutline, "Select overlapping closed shapes");
  set("path.flatten", pfRun("Flatten", flattenNodes), twoOutlines, "Select two or more overlapping closed shapes");
  set("path.cutPath", pfRun("Cut Path", cutPathNodes, false), twoOutlines, "Select paths and, on top, the path that cuts them");
  set("path.splitPath", () => { let out: string[] = []; st().edit("Split Path", (d) => { out = splitPathNodes(d, selected(st())); }); st().select(out); preflight(out, "Split Path"); }, anyOutline, "Select a path with several parts");
  set("path.strokeToPath", () => ctx.dialog("strokeToPath"), anyOutline, "Select a path, shape or text");
  set("path.dynamicOffset", () => {
    const ids = fxTargets(st());
    if (!ids.length) return;
    st().edit("Dynamic Offset", (d) => { addEffect(d, ids, "offset"); });
    ctx.showPanel("liveEffects");
  }, canFx, "Select a path, shape, text or clone");
  const offStep = ctx.offsetStep;
  for (const [id, label, delta] of [["path.inset", "Inset", -offStep], ["path.outset", "Outset", offStep]] as const) {
    set(id, () => {
      const ids = selected(st());
      let out: string[] = [];
      st().edit(label, (d) => { out = insetOutsetNodes(d, ids, delta); });
      if (out.length) { st().select(out); preflight(out, label); } else ctx.toast(delta < 0 ? "The shapes are too small to inset by that step" : "Select closed shapes");
    }, anyOutline, "Select closed shapes");
  }
  set("path.removeDuplicates", () => {
    const ids = selected(st());
    let n = 0;
    st().edit("Remove Duplicate Nodes", (d) => { n = removeDuplicateNodesIn(d, ids); });
    ctx.toast(n ? `Removed ${n} duplicate node${n === 1 ? "" : "s"}` : "No duplicate nodes found", n > 0);
  }, paths.length > 0, "Select a path");
  set("path.joinNearby", () => ctx.dialog("joinNearby"), paths.length > 0, "Select paths with open ends");
  const oneImage = s.selection.length === 1 && findNode(s.doc.root, s.selection[0])?.type === "image";
  set("path.traceBitmap", () => ctx.dialog("traceBitmap"), oneImage, "Select one image");
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
  const angleStep = ctx.snapAngle ?? 15;
  set("node.rotateCCW", nodeTransform("Rotate Nodes", (c) => rotateAt(-angleStep, c.x, c.y)), refs.length > 0, NEED_NODES);
  set("node.rotateCW", nodeTransform("Rotate Nodes", (c) => rotateAt(angleStep, c.x, c.y)), refs.length > 0, NEED_NODES);
  set("node.reflectH", nodeTransform("Reflect Nodes", (c) => scaleAt(-1, 1, c.x, c.y)), refs.length > 0, NEED_NODES);
  set("node.reflectV", nodeTransform("Reflect Nodes", (c) => scaleAt(1, -1, c.x, c.y)), refs.length > 0, NEED_NODES);
  for (const [cmd, axis] of [["node.alignH", "y"], ["node.alignV", "x"]] as const) {
    set(cmd, () => {
      const r = st().anchors;
      const c = anchorsCenter(st().doc, r);
      if (!c) return;
      let out: NodeRef[] = r;
      st().edit("Align Nodes", (d) => { out = editAnchors(d, r, (ms, world) => alignSelected(ms, world, axis, axis === "x" ? c.x : c.y)); });
      st().setAnchors(out);
    }, refs.length > 1, "Select two or more nodes with Direct Selection");
  }
  set("node.extract", () => {
    const r = st().anchors;
    let out: string[] = [];
    st().edit("Extract Subpath", (d) => { out = extractSubpaths(d, r, newId); });
    if (out.length) { st().setAnchors([]); st().select(out); }
    else ctx.toast("Select a node on one subpath of a path with several.");
  }, refs.length > 0, NEED_NODES);
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
  set("view.zoom.half", cv((c) => c.zoomTo(PX_PER_MM / 2)));
  set("view.zoom.double", cv((c) => c.zoomTo(PX_PER_MM * 2)));
  set("view.zoom.prev", cv((c) => c.zoomPrev()), s.zoomHistory.back.length > 0, "No earlier zoom in this session");
  set("view.zoom.next", cv((c) => c.zoomNext()), s.zoomHistory.fwd.length > 0, "No later zoom — go back first");
  const turnedView = isTurned(s.view);
  set("view.rotate.cw", cv((c) => c.rotate(angleStep)));
  set("view.rotate.ccw", cv((c) => c.rotate(-angleStep)));
  set("view.rotate.reset", cv((c) => c.resetOrientation()), turnedView, "The view is upright and not flipped");
  set("view.flipH", cv((c) => c.flip("h")), true, undefined, !!s.view.flipX);
  set("view.flipV", cv((c) => c.flip("v")), true, undefined, !!s.view.flipY);
  set("view.outlineOverlay", () => st().setUi({ outlineOverlay: !st().ui.outlineOverlay }), true, undefined, s.ui.outlineOverlay);
  set("view.split", () => st().setUi({ split: !st().ui.split }), true, undefined, s.ui.split);
  set("view.snap.toggle", () => {
    const on = st().doc.snapping.enabled === false;
    st().quiet((d) => { d.snapping.enabled = on; });
    ctx.toast(on ? "Snapping on" : "Snapping off");
  }, true, undefined, s.doc.snapping.enabled !== false);
  set("view.snap.options", () => ctx.openSnapOptions?.(), !!ctx.openSnapOptions, "Not available here");
  set("view.swatchBar", () => ctx.toggleSwatchBar?.(), !!ctx.toggleSwatchBar, "Not available here", !!ctx.swatchBar);
  set("view.assembly3d", () => ctx.toggleView3d?.(), !!ctx.toggleView3d, "Not available here", !!ctx.view3d);
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
  const panels: [string, PanelId][] = [["properties", "properties"], ["layers", "layers"], ["cutLayers", "cutLayers"], ["align", "align"], ["pathfinder", "pathfinder"], ["history", "history"], ["document", "document"], ["liveEffects", "liveEffects"], ["inspector", "inspector"], ["aiStudio", "aiStudio"]];
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
