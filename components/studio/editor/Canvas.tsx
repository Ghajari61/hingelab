"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createStore } from "zustand";
import { newId } from "@/lib/studio/doc";
import {
  apply, boxCenter, cubicAt, emptyBox, insertAnchor, isEmptyBox, nearestOnSubpaths, nodeBasePaths, nodeBox, nodePaths, normBox, pathD, rotateAt, scaleAt, segments, shapeForBox,
  shapePaths, transformSubpaths, translate, type Box,
} from "@/lib/studio/geom";
import { canHaveEffects, EFFECTS, effectDragPatch, effectGuides, effectHandleOutline, effectHandles, hasEffects, type EffectGuides } from "@/lib/studio/effects";
import { setEffectParams } from "@/lib/studio/effects/ops";
import { refreshAuto, snapToOutlines } from "@/lib/studio/nodeOps";
import { brushOutline, brushProfile, freehandPath, paraxialAppend, penSubpath } from "@/lib/studio/strokes";
import {
  addNode, duplicateNodes, expandNodes, findNode, hitTest, idsInBox, isEditable, locate, selectionBox, toLocal, topLevel, transformNodes, walk,
  type IdFactory,
} from "@/lib/studio/scene";
import { noTargets, snapMove, snapPoint, snapTargets, type SnapLine, type SnapSettings, type SnapTargets } from "@/lib/studio/snap";
import { fmtLength, fromMM } from "@/lib/studio/units";
import type { Anchor, Document, Mat, PathNode, SceneNode, ShapeKind, Subpath, TextNode, Vec } from "@/lib/studio/types";
import type { ToolId } from "@/lib/studio/commands";
import { layerCode } from "@/lib/studio/cutLayers";
import { builderFaces, buildShapes, curvaturePath, eraseAlong, eraseTouching, faceAt, knifeCut, lassoHits, scissorsAt, shearAt } from "@/lib/studio/toolOps";
import { measureAcross, measureTargets, type MeasureTarget } from "@/lib/studio/measure";
import { useEditor, useEditorApi, type AnchorRef, type EraserMode } from "./store";
import { TextEditor } from "./TextEditor";
import { fillClick, measureToItem, startCalligraphy, startSpray, startTweak, type ToolPointer, type ToolSession } from "./tools/brushTools";
import { MeasureOverlay } from "./tools/MeasureOverlay";

export const PX_PER_MM = 96 / 25.4;
const RULER = 20;
const SHAPE_TOOLS = new Set<ToolId>(["rect", "ellipse", "polygon", "star", "arc", "slot", "gear", "arrow", "bubble", "heart", "grid", "spiral"]);

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const handlePos = (b: Box, h: Handle): Vec => ({
  x: h.includes("w") ? b.minX : h.includes("e") ? b.maxX : (b.minX + b.maxX) / 2,
  y: h.includes("n") ? b.minY : h.includes("s") ? b.maxY : (b.minY + b.maxY) / 2,
});
const HANDLE_CURSOR: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };

type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "move"; start: Vec; ids: string[]; box: Box; targets: SnapTargets; dup: boolean; pool: string[]; moved: boolean; pointerId: number }
  | { kind: "scale"; handle: Handle; box: Box; ids: string[] }
  | { kind: "rotate"; center: Vec; a0: number; ids: string[]; tool?: boolean }
  | { kind: "toolScale"; center: Vec; start: Vec; ids: string[] }
  | { kind: "marquee"; start: Vec; cur: Vec; add: boolean; deep: boolean }
  | { kind: "guide"; index: number; axis: "x" | "y"; isNew: boolean }
  | { kind: "anchor"; ref: AnchorRef; part: "node" | "in" | "out"; start: Vec; alt: boolean; targets: SnapTargets; refs: AnchorRef[]; at: Vec; outlines: { subs: Subpath[]; box: Box }[] }
  | { kind: "draw"; tool: ToolId; start: Vec; cur: Vec; shift: boolean; alt: boolean }
  | { kind: "pencil"; pts: Vec[]; pressure: number[] }
  | { kind: "penHandle" }
  | { kind: "zoom"; start: Vec; cur: Vec; alt: boolean }
  | { kind: "text"; start: Vec; cur: Vec }
  | { kind: "lasso"; pts: Vec[]; mode: "set" | "add" | "remove" }
  | { kind: "knife"; pts: Vec[]; straight: boolean; ids: string[] }
  | { kind: "erase"; pts: Vec[]; ids: string[]; mode: EraserMode }
  | { kind: "shear"; center: Vec; start: Vec; ids: string[]; half: Vec }
  | { kind: "build"; faces: number[]; remove: boolean; ids: string[] }
  | { kind: "measure"; a: Vec; targets: SnapTargets; crossed: MeasureTarget[] }
  | { kind: "fxHandle"; node: string; effect: string; index: number; world: Mat; moved: boolean }
  | { kind: "session"; session: ToolSession };

interface Hud { x: number; y: number; text: string }

/** Local path data per node object (immer keeps unchanged nodes identical, so the cache stays valid). */
const dCache = new WeakMap<object, string>();
function localD(n: SceneNode): string {
  let d = dCache.get(n);
  if (d === undefined) { d = pathD(nodePaths(n)); dCache.set(n, d); }
  return d;
}
const matStr = (m: Mat) => `matrix(${m.join(" ")})`;

function snapSettings(doc: Document): SnapSettings {
  return { ...doc.snapping, gridSize: doc.grid.size / Math.max(1, doc.grid.subdivisions) };
}

/** Pen pressure 0–1; a mouse (or a device without pressure) counts as a steady half press. */
const penPressure = (e: React.PointerEvent) => (e.pointerType === "mouse" || !e.pressure ? 0.5 : e.pressure);
const toolPointer = (e: React.PointerEvent, p: Vec): ToolPointer => ({ p, shift: e.shiftKey, alt: e.altKey, pressure: penPressure(e), t: e.timeStamp });

/** Eraser preview/commit in either mode. */
const erase = (d: Document, mode: EraserMode, ids: string[], pts: Vec[], size: number) => {
  if (mode === "delete") eraseTouching(d, ids, pts, size); else eraseAlong(d, ids, pts, size);
};

/** Pencil smoothing 0–100 as the curve-fit tolerance in screen pixels (25 is the classic 1.5 px). */
const pencilTolerance = (smoothing: number) => 0.25 + Math.max(0, Math.min(100, smoothing)) * 0.05;

/** Brush width along a stroke from the pressure recorded at each raw point: half pressure gives `width`. */
function pressureWidth(pts: Vec[], pressure: number[], width: number): (u: number) => number {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const total = cum[cum.length - 1] || 1;
  return (u) => {
    const at = u * total;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < at) k++;
    const span = cum[k] - cum[k - 1] || 1, t = Math.max(0, Math.min(1, (at - cum[k - 1]) / span));
    const p = (pressure[k - 1] ?? 0.5) * (1 - t) + (pressure[k] ?? pressure[k - 1] ?? 0.5) * t;
    return width * Math.max(0.05, Math.min(2, p / 0.5));
  };
}

function idPool(pool: string[]): IdFactory {
  let k = 0;
  return () => { if (k >= pool.length) pool.push(newId()); return pool[k++]; };
}

function editableSubpaths(n: SceneNode): Subpath[] | null {
  if (n.type === "path") return n.subpaths;
  if (n.type === "shape") return shapePaths(n.shape);
  return null;
}

export interface CanvasApi { fit: (what: "artboard" | "all" | "selection") => void; zoomBy: (f: number) => void; actual: () => void; finishPen: () => void; center: () => Vec }

/** Pointer position in document space, for the status bar (kept out of the editor store: it changes on every move). */
export const pointerStore = createStore<{ p: Vec | null }>(() => ({ p: null }));

export function Canvas({ onContextMenu, apiRef, onToast }: {
  onContextMenu: (x: number, y: number) => void;
  apiRef: React.MutableRefObject<CanvasApi | null>;
  onToast: (message: string, undo?: boolean) => void;
}) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const anchors = useEditor((s) => s.anchors);
  const tool = useEditor((s) => s.tool);
  const penMode = useEditor((s) => s.penMode);
  const view = useEditor((s) => s.view);
  const ui = useEditor((s) => s.ui);
  const textEditing = useEditor((s) => s.textEditing);
  const fxHandles = useEditor((s) => s.fxHandles);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const drag = useRef<Drag | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [lines, setLines] = useState<SnapLine[]>([]);
  const [hud, setHud] = useState<Hud | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pointer, setPointer] = useState<Vec | null>(null);
  const space = useRef(false);
  const pen = useRef<{ nodes: Anchor[]; hoverClose: boolean } | null>(null);
  const curve = useRef<{ pts: Vec[]; corners: Set<number>; hoverClose: boolean } | null>(null);
  const [hoverFace, setHoverFace] = useState(-1);
  const fitted = useRef(false);
  const faces = useMemo(() => {
    if (tool !== "shapeBuilder") return [];
    const ids = topLevel(doc.root, selection).filter((id) => isEditable(doc.root, id));
    return ids.length ? builderFaces(doc, ids) : [];
  }, [tool, doc, selection]);

  const zoom = view.zoom;
  const S = useCallback((p: Vec): Vec => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y }), [view]);
  const toDoc = useCallback((cx: number, cy: number): Vec => {
    const r = stageRef.current!.getBoundingClientRect();
    const v = api.getState().view;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, [api]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitBox = useCallback((b: Box) => {
    const el = stageRef.current;
    if (!el || isEmptyBox(b)) return;
    const w = Math.max(b.maxX - b.minX, 1), h = Math.max(b.maxY - b.minY, 1);
    const pad = 48 + (api.getState().ui.rulers ? RULER : 0);
    const z = Math.max(0.02, Math.min(64, Math.min((el.clientWidth - pad * 2) / w, (el.clientHeight - pad * 2) / h)));
    api.getState().setView({ zoom: z, x: (el.clientWidth - w * z) / 2 - b.minX * z, y: (el.clientHeight - h * z) / 2 - b.minY * z });
  }, [api]);

  const zoomAt = useCallback((factor: number, sx?: number, sy?: number) => {
    const el = stageRef.current;
    if (!el) return;
    const px = sx ?? el.clientWidth / 2, py = sy ?? el.clientHeight / 2;
    api.getState().setView((v) => {
      const z = Math.min(64, Math.max(0.02, v.zoom * factor));
      return { zoom: z, x: px - ((px - v.x) / v.zoom) * z, y: py - ((py - v.y) / v.zoom) * z };
    });
  }, [api]);

  const sheetsBox = useCallback((d: Document): Box => d.sheets.reduce((b, s) => ({ minX: Math.min(b.minX, s.x), minY: Math.min(b.minY, s.y), maxX: Math.max(b.maxX, s.x + s.w), maxY: Math.max(b.maxY, s.y + s.h) }), emptyBox()), []);

  /** Adds the Pen's path; with a brush shape the line becomes its filled, tapered outline. */
  const addPenPath = useCallback((sub: Subpath) => {
    const s = api.getState();
    const subpaths = s.penShape === "none" ? [sub] : brushOutline(sub, brushProfile(s.penShape, s.brushWidth));
    if (!subpaths.length) return;
    const node: PathNode = { id: newId(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: s.currentLayer, subpaths };
    s.edit("Pen", (d) => addNode(d, node), { select: [node.id] });
  }, [api]);

  const finishPen = useCallback((closeCurve = false) => {
    const p = pen.current, c = curve.current;
    pen.current = null;
    curve.current = null;
    const s = api.getState();
    if (p && p.nodes.length >= 2) addPenPath(penSubpath(s.penMode, p.nodes, false));
    if (c && c.pts.length >= 2) {
      const node: PathNode = { id: newId(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: s.currentLayer, subpaths: [curvaturePath(c.pts, c.corners, closeCurve)] };
      s.edit("Curvature", (d) => addNode(d, node), { select: [node.id] });
    }
    rerender();
  }, [api, addPenPath]);

  useEffect(() => {
    apiRef.current = {
      fit: (what) => {
        const d = api.getState().doc;
        if (what === "artboard") fitBox(sheetsBox(d));
        else if (what === "selection") fitBox(selectionBox(d, api.getState().selection));
        else { const b = selectionBox(d, d.root.children.map((c) => c.id)); fitBox(isEmptyBox(b) ? sheetsBox(d) : { minX: Math.min(b.minX, sheetsBox(d).minX), minY: Math.min(b.minY, sheetsBox(d).minY), maxX: Math.max(b.maxX, sheetsBox(d).maxX), maxY: Math.max(b.maxY, sheetsBox(d).maxY) }); }
      },
      zoomBy: (f) => zoomAt(f),
      actual: () => { const v = api.getState().view; zoomAt(PX_PER_MM / v.zoom); },
      finishPen: () => finishPen(),
      center: () => {
        const el = stageRef.current, v = api.getState().view;
        return el ? { x: (el.clientWidth / 2 - v.x) / v.zoom, y: (el.clientHeight / 2 - v.y) / v.zoom } : { x: 0, y: 0 };
      },
    };
  }, [api, apiRef, fitBox, sheetsBox, zoomAt, finishPen]);

  useEffect(() => {
    if (!fitted.current && size.w > 100) { fitted.current = true; fitBox(sheetsBox(api.getState().doc)); }
  }, [size, fitBox, sheetsBox, api]);

  useEffect(() => { if ((tool !== "pen" && pen.current) || (tool !== "curvature" && curve.current)) finishPen(); setHoverFace(-1); }, [tool, finishPen]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      else api.getState().setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [api, zoomAt]);

  // Keys the canvas owns: Space (pan), Escape/Enter (pen, drags), Backspace in the pen, arrows (nudge), Delete on anchors.
  useEffect(() => {
    const typing = (t: EventTarget | null) => !!t && t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const onDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const s = api.getState();
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === " ") { if (!space.current) { space.current = true; setCursor("grab"); } stop(); return; }
      if (e.key === "Escape") {
        if (drag.current) { s.end("", null); drag.current = null; setLines([]); setHud(null); rerender(); stop(); return; }
        if (pen.current || curve.current) { finishPen(); stop(); return; }
        if (s.anchors.length) { s.setAnchors([]); stop(); return; }
        if (s.selection.length) { s.select([]); stop(); }
        return;
      }
      if (e.key === "Enter" && (pen.current || curve.current)) { finishPen(); stop(); return; }
      if (e.key === "Enter" && s.tool === "measure" && s.measure && !drag.current && !e.ctrlKey && !e.altKey) { measureToItem(api, onToast); stop(); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && pen.current) {
        pen.current.nodes.pop();
        if (!pen.current.nodes.length) pen.current = null;
        rerender(); stop(); return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && curve.current) {
        const c = curve.current;
        c.corners.delete(c.pts.length - 1);
        c.pts.pop();
        if (!c.pts.length) curve.current = null;
        rerender(); stop(); return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && !e.altKey && s.anchors.length && s.tool === "direct") { deleteAnchors(); stop(); return; }
      if (e.key.startsWith("Arrow") && !e.ctrlKey && !e.metaKey) {
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (s.anchors.length && s.tool === "direct") { moveAnchors(s.anchors, dx, dy, "nudge-anchors"); stop(); return; }
        const ids = s.selection.filter((id) => isEditable(s.doc.root, id));
        if (ids.length) { s.edit("Nudge", (d) => transformNodes(d, ids, translate(dx, dy)), { mergeKey: "nudge" }); s.set({ lastTransform: translate(dx, dy) }); stop(); }
      }
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === " ") { space.current = false; setCursor(null); } };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => { window.removeEventListener("keydown", onDown, true); window.removeEventListener("keyup", onUp, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, finishPen]);

  // ---------- anchors (Direct Selection) ----------

  function ensurePath(d: Document, id: string): PathNode | null {
    const n = findNode(d.root, id);
    if (!n) return null;
    if (n.type === "shape") expandNodes(d, [id], true);
    const p = findNode(d.root, id);
    return p && p.type === "path" ? p : null;
  }

  function moveAnchors(refs: AnchorRef[], dx: number, dy: number, mergeKey?: string) {
    const s = api.getState();
    const converted = refs.some((r) => findNode(s.doc.root, r.id)?.type === "shape");
    s.edit("Move Anchor Points", (d) => {
      for (const r of refs) {
        const p = ensurePath(d, r.id);
        const a = p?.subpaths[r.sub]?.nodes[r.idx];
        if (!a) continue;
        const l = locate(d.root, r.id)!;
        const o = toLocalDelta(l.world, dx, dy);
        a.x += o.x; a.y += o.y;
        if (a.i) { a.i.x += o.x; a.i.y += o.y; }
        if (a.o) { a.o.x += o.x; a.o.y += o.y; }
      }
      for (const id of new Set(refs.map((r) => r.id))) {
        const p = findNode(d.root, id);
        if (p?.type === "path") p.subpaths = p.subpaths.map((sp) => refreshAuto(sp));
      }
    }, { mergeKey });
    if (converted) onToast("Converted the live shape to a path", true);
  }

  function deleteAnchors() {
    const s = api.getState();
    const byNode = new Map<string, AnchorRef[]>();
    for (const r of s.anchors) byNode.set(r.id, [...(byNode.get(r.id) ?? []), r]);
    s.edit("Delete Anchor Points", (d) => {
      for (const [id, refs] of byNode) {
        const p = ensurePath(d, id);
        if (!p) continue;
        p.subpaths = p.subpaths.map((sp, si) => refreshAuto({ ...sp, nodes: sp.nodes.filter((_, k) => !refs.some((r) => r.sub === si && r.idx === k)) }))
          .filter((sp) => sp.nodes.length >= 2);
        if (!p.subpaths.length) { const l = locate(d.root, id); if (l) l.parent.children.splice(l.index, 1); }
      }
    });
    s.setAnchors([]);
  }

  /** Snap targets for dragging nodes: everything else, the unmoved nodes of the edited paths, and outlines to slide along. */
  function nodeSnapTargets(d: Document, ref: AnchorRef & { part?: "node" | "in" | "out" }, moving: AnchorRef[], settings: SnapSettings) {
    const own = new Set(moving.map((r) => r.id));
    const targets = snapTargets(d, own, settings);
    const movingKey = new Set(moving.map((r) => `${r.id}:${r.sub}:${r.idx}`));
    const outlines: { subs: Subpath[]; box: Box }[] = [];
    let at: Vec = { x: 0, y: 0 };
    for (const id of own) {
      const l = locate(d.root, id);
      const subs = l && editableSubpaths(l.node);
      if (!l || !subs) continue;
      transformSubpaths(subs, l.world).forEach((sp, si) => sp.nodes.forEach((a, k) => {
        if (id === ref.id && si === ref.sub && k === ref.idx) at = { x: a.x, y: a.y };
        else if (settings.points && !movingKey.has(`${id}:${si}:${k}`)) targets.points.push({ x: a.x, y: a.y });
      }));
    }
    if (settings.points) {
      walk(d.root, (l) => {
        if (l.node.hidden) return "skip";
        if (own.has(l.node.id) || l.node.type === "group") return;
        const subs = transformSubpaths(nodePaths(l.node), l.world);
        if (subs.length) outlines.push({ subs, box: nodeBox(l.node, l.world) });
      });
    }
    return { targets, outlines, at };
  }

  function toLocalDelta(world: Mat, dx: number, dy: number): Vec {
    const det = world[0] * world[3] - world[1] * world[2] || 1;
    return { x: (world[3] * dx - world[2] * dy) / det, y: (-world[1] * dx + world[0] * dy) / det };
  }

  /** Anchors and handles of the selected editable leaves, in screen space. */
  const anchorView = useMemo(() => {
    if (tool !== "direct") return [];
    const out: { ref: AnchorRef; p: Vec; i?: Vec; o?: Vec; k?: Anchor["k"] }[] = [];
    for (const id of selection) {
      const l = locate(doc.root, id);
      if (!l) continue;
      const subs = editableSubpaths(l.node);
      if (!subs) continue;
      transformSubpaths(subs, l.world).forEach((sp, si) => sp.nodes.forEach((a, k) => out.push({ ref: { id, sub: si, idx: k }, p: S(a), i: a.i && S(a.i), o: a.o && S(a.o), k: a.k })));
    }
    return out;
  }, [tool, selection, doc, S]);

  /** View ▸ Show Path Direction: a chevron at the middle of every segment of the edited paths, pointing along the path. */
  const directionMarks = useMemo(() => {
    if (tool !== "direct" || !ui.pathDirection) return [];
    const out: { p: Vec; a: number }[] = [];
    for (const id of selection) {
      const l = locate(doc.root, id);
      const subs = l && editableSubpaths(l.node);
      if (!l || !subs) continue;
      for (const sp of transformSubpaths(subs, l.world)) {
        for (const g of segments(sp)) {
          const m = cubicAt(g, 0.5), a = cubicAt(g, 0.45), b = cubicAt(g, 0.55);
          if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
          out.push({ p: S(m), a: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
        }
      }
    }
    return out;
  }, [tool, ui.pathDirection, selection, doc, S]);

  /** Handles of the Live Effects open in the panel (page coordinates), with their guide lines. */
  const fxView = useMemo(() => {
    if (!fxHandles || (tool !== "select" && tool !== "direct")) return [];
    const l = locate(doc.root, fxHandles.node);
    if (!l) return [];
    return fxHandles.effects.map((effect) => ({
      effect, world: l.world,
      pts: effectHandles(l.node, effect).map((q) => apply(l.world, q)),
      outline: transformSubpaths(effectHandleOutline(l.node, effect), l.world),
    }));
  }, [doc, fxHandles, tool]);

  /** Canvas-only Live Effect marks (Measure Segments labels) of every visible object. */
  const fxGuides = useMemo(() => {
    const out: { id: string; g: EffectGuides }[] = [];
    walk(doc.root, (l) => {
      if (l.node.hidden) return "skip";
      if (!canHaveEffects(l.node) || !l.node.effects?.some((e) => e.enabled && e.kind === "measureSegments")) return;
      const g = effectGuides(l.node, l.world, doc.units);
      if (g) out.push({ id: l.node.id, g });
    });
    return out;
  }, [doc]);

  // ---------- hit helpers ----------

  function fxHandleAt(sp: Vec): { effect: string; index: number; world: Mat } | null {
    for (let k = fxView.length - 1; k >= 0; k--) {
      const v = fxView[k];
      for (let j = v.pts.length - 1; j >= 0; j--) { const q = S(v.pts[j]); if (Math.hypot(sp.x - q.x, sp.y - q.y) <= 7) return { effect: v.effect, index: j, world: v.world }; }
    }
    return null;
  }

  const selBox = useMemo(() => (selection.length && tool !== "direct" ? selectionBox(doc, selection) : emptyBox()), [doc, selection, tool]);

  function handleAt(sp: Vec): { kind: "scale"; h: Handle } | { kind: "rotate"; h: Handle } | null {
    if (isEmptyBox(selBox) || tool !== "select") return null;
    const b = { minX: S({ x: selBox.minX, y: 0 }).x, minY: S({ x: 0, y: selBox.minY }).y, maxX: S({ x: selBox.maxX, y: 0 }).x, maxY: S({ x: 0, y: selBox.maxY }).y };
    for (const h of HANDLES) { const p = handlePos(b, h); if (Math.abs(sp.x - p.x) <= 6 && Math.abs(sp.y - p.y) <= 6) return { kind: "scale", h }; }
    for (const h of ["nw", "ne", "se", "sw"] as Handle[]) {
      const p = handlePos(b, h);
      const d = Math.hypot(sp.x - p.x, sp.y - p.y);
      const outside = sp.x < b.minX || sp.x > b.maxX || sp.y < b.minY || sp.y > b.maxY;
      if (d > 6 && d <= 20 && outside) return { kind: "rotate", h };
    }
    return null;
  }

  function guideAt(p: Vec): number {
    const s = api.getState();
    if (!s.ui.guidesShown || s.ui.guidesLocked) return -1;
    return s.doc.guides.findIndex((g) => Math.abs((g.axis === "x" ? p.x : p.y) - g.at) * s.view.zoom <= 4);
  }

  function anchorAt(sp: Vec): { ref: AnchorRef; part: "node" | "in" | "out" } | null {
    for (let k = anchorView.length - 1; k >= 0; k--) {
      const a = anchorView[k];
      const sel = ui.nodeHandles || anchors.some((r) => r.id === a.ref.id && r.sub === a.ref.sub && r.idx === a.ref.idx);
      if (sel && a.i && Math.hypot(sp.x - a.i.x, sp.y - a.i.y) <= 5) return { ref: a.ref, part: "in" };
      if (sel && a.o && Math.hypot(sp.x - a.o.x, sp.y - a.o.y) <= 5) return { ref: a.ref, part: "out" };
    }
    for (let k = anchorView.length - 1; k >= 0; k--) {
      const a = anchorView[k];
      if (Math.hypot(sp.x - a.p.x, sp.y - a.p.y) <= 5) return { ref: a.ref, part: "node" };
    }
    return null;
  }

  const fmt = (mm: number) => fmtLength(mm, doc.units);

  // ---------- pointer ----------

  function screenPoint(e: React.PointerEvent | React.MouseEvent): Vec {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const s = api.getState();
    if (s.textEditing) return;
    if (e.button === 2) return;
    const sp = screenPoint(e);
    const p = toDoc(e.clientX, e.clientY);
    const tol = 4 / s.view.zoom;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current || s.tool === "hand") {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: s.view.x, vy: s.view.y };
      setCursor("grabbing");
      return;
    }
    if (s.ui.rulers && (sp.x < RULER || sp.y < RULER)) {
      const axis: "x" | "y" = sp.y < RULER ? "y" : "x";
      s.begin();
      s.preview((d) => { d.guides.push({ axis, at: axis === "x" ? p.x : p.y }); });
      drag.current = { kind: "guide", index: s.doc.guides.length, axis, isNew: true };
      s.setUi({ guidesShown: true });
      return;
    }
    const settings = snapSettings(s.doc);
    if ((s.tool === "select" || s.tool === "direct") && s.fxHandles) {
      const fh = fxHandleAt(sp);
      if (fh) {
        s.begin();
        drag.current = { kind: "fxHandle", node: s.fxHandles.node, effect: fh.effect, index: fh.index, world: fh.world, moved: false };
        return;
      }
    }
    switch (s.tool) {
      case "select": {
        const h = handleAt(sp);
        if (h) {
          s.begin();
          const ids = s.selection.filter((id) => isEditable(s.doc.root, id));
          if (h.kind === "scale") drag.current = { kind: "scale", handle: h.h, box: selBox, ids };
          else { const c = boxCenter(selBox); drag.current = { kind: "rotate", center: c, a0: Math.atan2(p.y - c.y, p.x - c.x), ids }; }
          return;
        }
        const gi = guideAt(p);
        const hit = hitTest(s.doc, p, tol);
        if (!hit && gi >= 0) { s.begin(); drag.current = { kind: "guide", index: gi, axis: s.doc.guides[gi].axis, isNew: false }; return; }
        if (hit) {
          if (e.shiftKey) { s.select([hit], "toggle"); return; }
          const sel = s.selection.includes(hit) ? s.selection : [hit];
          if (!s.selection.includes(hit)) s.select([hit]);
          startMove(p, sel, e.altKey, e.pointerId, settings);
          return;
        }
        if (!e.shiftKey) s.select([]);
        drag.current = { kind: "marquee", start: p, cur: p, add: e.shiftKey, deep: false };
        return;
      }
      case "direct": {
        const a = anchorAt(sp);
        if (a) {
          const isSel = s.anchors.some((r) => r.id === a.ref.id && r.sub === a.ref.sub && r.idx === a.ref.idx);
          if (a.part === "node" && e.altKey && !e.shiftKey) { convertAnchor(a.ref); return; }
          const refs = a.part !== "node" ? [a.ref] : e.shiftKey ? (isSel ? s.anchors.filter((r) => !(r.id === a.ref.id && r.sub === a.ref.sub && r.idx === a.ref.idx)) : [...s.anchors, a.ref]) : isSel ? s.anchors : [a.ref];
          if (a.part === "node") s.setAnchors(refs);
          s.begin();
          const moving = a.part === "node" ? refs : [a.ref];
          drag.current = { kind: "anchor", ref: a.ref, part: a.part, start: p, alt: e.altKey, refs: moving, ...nodeSnapTargets(s.doc, a.ref, moving, settings) };
          return;
        }
        const hit = hitTest(s.doc, p, tol, { deep: true });
        if (hit) {
          if (e.shiftKey) { s.select([hit], "toggle"); return; }
          if (!s.selection.includes(hit)) s.select([hit]);
          startMove(p, s.selection.includes(hit) ? s.selection : [hit], e.altKey, e.pointerId, settings);
          return;
        }
        if (!e.shiftKey) s.setAnchors([]);
        drag.current = { kind: "marquee", start: p, cur: p, add: e.shiftKey, deep: true };
        return;
      }
      case "pen": {
        const q = snapPoint(p, snapTargets(s.doc, new Set(), settings), 6 / s.view.zoom, settings).p;
        const cur = pen.current;
        if (cur && cur.nodes.length >= 2) {
          const f = S(cur.nodes[0]);
          if (Math.hypot(sp.x - f.x, sp.y - f.y) <= 7) {
            const nodes = s.penMode === "paraxial" ? paraxialAppend(cur.nodes, cur.nodes[0]).slice(0, -1) : cur.nodes;
            pen.current = null;
            addPenPath(penSubpath(s.penMode, nodes, true));
            rerender();
            return;
          }
        }
        let pt = q;
        if (e.shiftKey && cur?.nodes.length) pt = constrain45(cur.nodes[cur.nodes.length - 1], p);
        const prev = cur?.nodes ?? [];
        pen.current = { nodes: s.penMode === "paraxial" ? paraxialAppend(prev, pt) : [...prev, { x: pt.x, y: pt.y }], hoverClose: false };
        if (s.penMode === "bezier") drag.current = { kind: "penHandle" };
        rerender();
        return;
      }
      case "pencil": drag.current = { kind: "pencil", pts: [p], pressure: [penPressure(e)] }; return;
      case "text": drag.current = { kind: "text", start: p, cur: p }; return;
      case "zoom": drag.current = { kind: "zoom", start: p, cur: p, alt: e.altKey }; return;
      case "rotate": case "scale": {
        const ids = s.selection.filter((id) => isEditable(s.doc.root, id));
        if (!ids.length) { onToast("Select something first"); return; }
        const c = boxCenter(selectionBox(s.doc, ids));
        s.begin();
        drag.current = s.tool === "rotate" ? { kind: "rotate", center: c, a0: Math.atan2(p.y - c.y, p.x - c.x), ids, tool: true } : { kind: "toolScale", center: c, start: p, ids };
        return;
      }
      case "reflect": {
        const ids = s.selection.filter((id) => isEditable(s.doc.root, id));
        if (!ids.length) { onToast("Select something first"); return; }
        const c = boxCenter(selectionBox(s.doc, ids));
        const m = e.altKey ? scaleAt(1, -1, c.x, c.y) : scaleAt(-1, 1, c.x, c.y);
        s.edit("Reflect", (d) => transformNodes(d, ids, m));
        s.set({ lastTransform: m });
        return;
      }
      case "shear": {
        const ids = s.selection.filter((id) => isEditable(s.doc.root, id));
        if (!ids.length) { onToast("Select something first"); return; }
        const b = selectionBox(s.doc, ids);
        s.begin();
        drag.current = { kind: "shear", center: boxCenter(b), start: p, ids, half: { x: (b.maxX - b.minX) / 2, y: (b.maxY - b.minY) / 2 } };
        return;
      }
      case "lasso": drag.current = { kind: "lasso", pts: [p], mode: e.altKey ? "remove" : e.shiftKey ? "add" : "set" }; return;
      case "magicWand": {
        const hit = hitTest(s.doc, p, tol);
        const n = hit ? findNode(s.doc.root, hit) : null;
        if (!n) { if (!e.shiftKey) s.select([]); return; }
        const same = s.doc.root.children.filter((c) => !c.hidden && !c.locked && c.layer === n.layer).map((c) => c.id);
        s.select(same, e.shiftKey ? "add" : "set");
        onToast(`${same.length} object${same.length === 1 ? "" : "s"} on ${layerCode(n.layer)} · ${s.doc.cutLayers[n.layer]?.name ?? ""}`);
        return;
      }
      case "curvature": {
        const q = snapPoint(p, snapTargets(s.doc, new Set(), settings), 6 / s.view.zoom, settings).p;
        const cur = curve.current;
        if (cur && cur.pts.length >= 2) {
          const f = S(cur.pts[0]);
          if (Math.hypot(sp.x - f.x, sp.y - f.y) <= 7) { finishPen(true); return; }
        }
        const next = cur ?? { pts: [], corners: new Set<number>(), hoverClose: false };
        if (e.altKey) next.corners.add(next.pts.length);
        next.pts.push(q);
        curve.current = next;
        rerender();
        return;
      }
      case "scissors": {
        let out: string[] | null = null;
        s.edit("Scissors", (d) => { out = scissorsAt(d, p, 6 / s.view.zoom); });
        if (out) s.select(out); else onToast("Click right on a path to cut it there.");
        return;
      }
      case "knife": drag.current = { kind: "knife", pts: [p], straight: e.altKey, ids: s.selection.filter((id) => isEditable(s.doc.root, id)) }; return;
      case "eraser": {
        s.begin();
        const dr = { kind: "erase" as const, pts: [p], ids: s.selection.filter((id) => isEditable(s.doc.root, id)), mode: s.eraserMode };
        drag.current = dr;
        s.preview((d) => erase(d, dr.mode, dr.ids, [p], s.eraserSize));
        rerender();
        return;
      }
      case "fill": fillClick(api, toolPointer(e, p), onToast); return;
      case "calligraphy": drag.current = { kind: "session", session: startCalligraphy(api, toolPointer(e, p), { zoom: s.view.zoom, widthMm: size.w / s.view.zoom }) }; return;
      case "tweak": drag.current = { kind: "session", session: startTweak(api, toolPointer(e, p)) }; rerender(); return;
      case "spray": {
        const session = startSpray(api, toolPointer(e, p), onToast);
        if (session) drag.current = { kind: "session", session };
        rerender();
        return;
      }
      case "shapeBuilder": {
        const ids = s.selection.filter((id) => isEditable(s.doc.root, id));
        const k = faceAt(faces, p);
        if (!faces.length) { onToast("Select overlapping shapes first, then drag across the regions to merge."); return; }
        if (k < 0) { s.select([]); return; }
        drag.current = { kind: "build", faces: [k], remove: e.altKey, ids };
        rerender();
        return;
      }
      case "eyedropper": {
        const hit = hitTest(s.doc, p, tol, { deep: true });
        const src = hit ? findNode(s.doc.root, hit) : null;
        if (!src) { onToast("Click an object to pick up its cut layer."); return; }
        const ids = s.selection.filter((id) => isEditable(s.doc.root, id) && id !== src.id);
        s.set({ currentLayer: src.layer });
        if (ids.length) {
          s.edit("Eyedropper", (d) => ids.forEach((id) => {
            const n = findNode(d.root, id);
            if (!n) return;
            const deep = (m: SceneNode) => { m.layer = src.layer; if (m.type === "group") m.children.forEach(deep); };
            deep(n);
            if (n.type === "text" && src.type === "text") { n.font = src.font; n.size = src.size; n.tracking = src.tracking; n.lineHeight = src.lineHeight; }
          }));
        }
        onToast(`${layerCode(src.layer)} · ${s.doc.cutLayers[src.layer]?.name ?? ""}${ids.length ? ` applied to ${ids.length} object${ids.length === 1 ? "" : "s"}` : " is now the layer for new objects"}`);
        return;
      }
      case "measure": {
        const targets = snapTargets(s.doc, new Set(), settings);
        const a = snapPoint(p, targets, 6 / s.view.zoom, settings).p;
        const crossed = measureTargets(s.doc);
        drag.current = { kind: "measure", a, targets, crossed };
        s.set({ measure: { a, b: a, result: measureAcross(crossed, a, a) } });
        return;
      }
      default:
        if (SHAPE_TOOLS.has(s.tool) || s.tool === "line") {
          const q = snapPoint(p, snapTargets(s.doc, new Set(), settings), 6 / s.view.zoom, settings).p;
          drag.current = { kind: "draw", tool: s.tool, start: q, cur: q, shift: e.shiftKey, alt: e.altKey };
        }
    }
  }

  function startMove(p: Vec, ids: string[], dup: boolean, pointerId: number, settings: SnapSettings) {
    const s = api.getState();
    const editable = topLevel(s.doc.root, ids).filter((id) => isEditable(s.doc.root, id));
    if (!editable.length) return;
    s.begin();
    drag.current = { kind: "move", start: p, ids: editable, box: selectionBox(s.doc, editable), targets: snapTargets(s.doc, new Set(editable), settings), dup, pool: [], moved: false, pointerId };
  }

  function convertAnchor(ref: AnchorRef) {
    const s = api.getState();
    s.edit("Convert Anchor Point", (d) => {
      const p = ensurePath(d, ref.id);
      const sp = p?.subpaths[ref.sub];
      const a = sp?.nodes[ref.idx];
      if (!sp || !a) return;
      if (a.i || a.o) { delete a.i; delete a.o; a.k = "corner"; return; }
      const n = sp.nodes.length;
      const prev = sp.nodes[(ref.idx - 1 + n) % n], next = sp.nodes[(ref.idx + 1) % n];
      const tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
      a.i = { x: a.x - tx, y: a.y - ty }; a.o = { x: a.x + tx, y: a.y + ty }; a.k = "smooth";
    });
    s.setAnchors([ref]);
  }

  function constrain45(from: Vec, to: Vec): Vec {
    const a = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    return { x: from.x + len * Math.cos(a), y: from.y + len * Math.sin(a) };
  }

  function drawBox(dr: Extract<Drag, { kind: "draw" }>): { c: Vec; w: number; h: number } {
    let w = dr.cur.x - dr.start.x, h = dr.cur.y - dr.start.y;
    if (dr.shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    if (dr.alt) return { c: dr.start, w: Math.abs(w) * 2, h: Math.abs(h) * 2 };
    return { c: { x: dr.start.x + w / 2, y: dr.start.y + h / 2 }, w: Math.abs(w), h: Math.abs(h) };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = api.getState();
    const p = toDoc(e.clientX, e.clientY);
    const sp = screenPoint(e);
    setPointer(p);
    pointerStore.setState({ p });
    const dr = drag.current;
    const settings = snapSettings(s.doc);
    const tol = 6 / s.view.zoom;
    if (!dr) {
      if (pen.current && s.tool === "pen") {
        const f = S(pen.current.nodes[0]);
        pen.current.hoverClose = pen.current.nodes.length >= 2 && Math.hypot(sp.x - f.x, sp.y - f.y) <= 7;
        rerender();
      }
      if (curve.current && s.tool === "curvature") {
        const f = S(curve.current.pts[0]);
        curve.current.hoverClose = curve.current.pts.length >= 2 && Math.hypot(sp.x - f.x, sp.y - f.y) <= 7;
      }
      if (s.tool === "shapeBuilder") setHoverFace(faceAt(faces, p));
      const overFx = (s.tool === "select" || s.tool === "direct") && !space.current && fxView.length > 0 && !!fxHandleAt(sp);
      if (s.tool === "select" && !space.current) {
        const h = handleAt(sp);
        setCursor(overFx ? "move" : h ? (h.kind === "scale" ? HANDLE_CURSOR[h.h] : "alias") : guideAt(p) >= 0 && !hitTest(s.doc, p, 4 / s.view.zoom) ? (s.doc.guides[guideAt(p)].axis === "x" ? "ew-resize" : "ns-resize") : null);
      } else if (s.tool === "direct" && !space.current) setCursor(overFx ? "move" : null);
      return;
    }
    switch (dr.kind) {
      case "pan": s.setView({ x: dr.vx + e.clientX - dr.sx, y: dr.vy + e.clientY - dr.sy }); return;
      case "fxHandle": {
        const patch = fxHandlePatch(dr, p);
        if (!patch) return;
        dr.moved = true;
        s.preview((d) => { setEffectParams(d, dr.node, dr.effect, patch as never); });
        setHud({ x: sp.x, y: sp.y, text: `X ${fmt(p.x)}  Y ${fmt(p.y)} ${doc.units}` });
        return;
      }
      case "guide": {
        const at = dr.axis === "x" ? p.x : p.y;
        s.preview((d) => { if (d.guides[dr.index]) d.guides[dr.index].at = at; else d.guides.push({ axis: dr.axis, at }); });
        setHud({ x: sp.x, y: sp.y, text: `${dr.axis === "x" ? "X" : "Y"} ${fmt(at)} ${doc.units}` });
        return;
      }
      case "move": {
        let dx = p.x - dr.start.x, dy = p.y - dr.start.y;
        if (!dr.moved && Math.hypot(dx, dy) * s.view.zoom < 3) return;
        dr.moved = true;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const r = snapMove(dr.box, dx, dy, e.ctrlKey ? noTargets() : dr.targets, tol, settings);
        if (e.shiftKey) { if (dx === 0) r.dx = 0; if (dy === 0) r.dy = 0; }
        setLines(r.lines);
        const m = translate(r.dx, r.dy);
        const dup = e.altKey || dr.dup;
        s.preview((d) => {
          const ids = dup ? duplicateNodes(d, dr.ids, { x: 0, y: 0 }, idPool(dr.pool)) : dr.ids;
          transformNodes(d, ids, m);
        });
        setHud({ x: sp.x, y: sp.y, text: `dX ${fmt(r.dx)}  dY ${fmt(r.dy)} ${doc.units}${dup ? "  (copy)" : ""}` });
        return;
      }
      case "scale": {
        const b = dr.box, h = dr.handle;
        const W = b.maxX - b.minX, H = b.maxY - b.minY;
        const alt = e.altKey;
        const c = boxCenter(b);
        const ax = alt ? c.x : h.includes("w") ? b.maxX : b.minX;
        const ay = alt ? c.y : h.includes("n") ? b.maxY : b.minY;
        const k = alt ? 2 : 1;
        let sx = h.includes("e") || h.includes("w") ? (W > 1e-9 ? (k * (p.x - ax)) / (h.includes("w") ? -W : W) : 1) : 1;
        let sy = h.includes("n") || h.includes("s") ? (H > 1e-9 ? (k * (p.y - ay)) / (h.includes("n") ? -H : H) : 1) : 1;
        if (e.shiftKey && h.length === 2) { const m = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * m; sy = Math.sign(sy || 1) * m; }
        if (e.shiftKey && h.length === 1) { if (h === "e" || h === "w") sy = Math.abs(sx); else sx = Math.abs(sy); }
        const m = scaleAt(sx || 1e-6, sy || 1e-6, ax, ay);
        s.preview((d) => transformNodes(d, dr.ids, m));
        setHud({ x: sp.x, y: sp.y, text: `W ${fmt(Math.abs(W * sx))}  H ${fmt(Math.abs(H * sy))} ${doc.units}` });
        return;
      }
      case "rotate": {
        let a = ((Math.atan2(p.y - dr.center.y, p.x - dr.center.x) - dr.a0) * 180) / Math.PI;
        if (e.shiftKey) a = Math.round(a / 15) * 15;
        const m = rotateAt(a, dr.center.x, dr.center.y);
        s.preview((d) => transformNodes(d, dr.ids, m));
        setHud({ x: sp.x, y: sp.y, text: `${Math.round(((a % 360) + 540) % 360 - 180)}°` });
        return;
      }
      case "toolScale": {
        const vx = dr.start.x - dr.center.x, vy = dr.start.y - dr.center.y;
        let sx = Math.abs(vx) > 1e-6 ? (p.x - dr.center.x) / vx : 1, sy = Math.abs(vy) > 1e-6 ? (p.y - dr.center.y) / vy : 1;
        if (e.shiftKey) { const f = Math.hypot(p.x - dr.center.x, p.y - dr.center.y) / Math.max(Math.hypot(vx, vy), 1e-6); sx = f; sy = f; }
        const m = scaleAt(sx || 1e-6, sy || 1e-6, dr.center.x, dr.center.y);
        s.preview((d) => transformNodes(d, dr.ids, m));
        setHud({ x: sp.x, y: sp.y, text: `${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%` });
        return;
      }
      case "marquee": case "zoom": case "text": dr.cur = p; rerender(); return;
      case "pencil": dr.pts.push(p); dr.pressure.push(penPressure(e)); rerender(); return;
      case "lasso": dr.pts.push(p); rerender(); return;
      case "knife": {
        if (dr.straight || e.altKey) { dr.straight = true; dr.pts = [dr.pts[0], e.shiftKey ? constrain45(dr.pts[0], p) : p]; }
        else dr.pts.push(p);
        rerender();
        return;
      }
      case "erase": {
        dr.pts.push(p);
        const size = s.eraserSize;
        s.preview((d) => erase(d, dr.mode, dr.ids, dr.pts, size));
        rerender();
        return;
      }
      case "session": dr.session.move(toolPointer(e, p)); rerender(); return;
      case "shear": {
        const dx = p.x - dr.start.x, dy = p.y - dr.start.y;
        const axis: "x" | "y" = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        const arm = axis === "x" ? dr.start.y - dr.center.y : dr.start.x - dr.center.x;
        const span = Math.abs(arm) > 1e-3 ? arm : -Math.max(dr.half[axis === "x" ? "y" : "x"], 1);
        let k = (axis === "x" ? dx : dy) / span;
        let deg = (Math.atan(k) * 180) / Math.PI;
        if (e.shiftKey) { deg = Math.round(deg / 15) * 15; k = Math.tan((deg * Math.PI) / 180); }
        const m = shearAt(k, axis, dr.center);
        s.preview((d) => transformNodes(d, dr.ids, m));
        setHud({ x: sp.x, y: sp.y, text: `Shear ${axis === "x" ? "horizontal" : "vertical"} ${Math.round(deg * 10) / 10}°` });
        return;
      }
      case "build": {
        const k = faceAt(faces, p);
        if (k >= 0 && !dr.faces.includes(k)) { dr.faces.push(k); rerender(); }
        setHoverFace(k);
        return;
      }
      case "measure": {
        let b = snapPoint(p, dr.targets, tol, settings).p;
        if (e.shiftKey) b = constrain45(dr.a, b);
        s.set({ measure: { a: dr.a, b, result: measureAcross(dr.crossed, dr.a, b) } });
        const dx = b.x - dr.a.x, dy = b.y - dr.a.y;
        setHud({ x: sp.x, y: sp.y, text: `D ${fmt(Math.hypot(dx, dy))} ${doc.units}  ${Math.round((Math.atan2(-dy, dx) * 1800) / Math.PI) / 10}°` });
        return;
      }
      case "penHandle": {
        const cur = pen.current;
        if (!cur) return;
        const a = cur.nodes[cur.nodes.length - 1];
        if (Math.hypot(p.x - a.x, p.y - a.y) * s.view.zoom > 2) {
          cur.nodes[cur.nodes.length - 1] = { x: a.x, y: a.y, o: { x: p.x, y: p.y }, i: { x: 2 * a.x - p.x, y: 2 * a.y - p.y }, k: "symmetric" };
          rerender();
        }
        return;
      }
      case "draw": {
        let q = snapPoint(p, dr.tool === "line" ? snapTargets(s.doc, new Set(), settings) : noTargets(), tol, settings).p;
        if (dr.tool === "line" && e.shiftKey) q = constrain45(dr.start, p);
        dr.cur = q; dr.shift = e.shiftKey; dr.alt = e.altKey;
        const bx = drawBox(dr);
        setHud({ x: sp.x, y: sp.y, text: dr.tool === "line" ? `${fmt(Math.hypot(q.x - dr.start.x, q.y - dr.start.y))} ${doc.units}  ${Math.round((Math.atan2(dr.start.y - q.y, q.x - dr.start.x) * 180) / Math.PI)}°` : `W ${fmt(bx.w)}  H ${fmt(bx.h)} ${doc.units}` });
        rerender();
        return;
      }
      case "anchor": {
        const base = s.base!;
        const l = locate(base.root, dr.ref.id);
        if (!l) return;
        if (dr.part === "node") {
          let want = { x: dr.at.x + p.x - dr.start.x, y: dr.at.y + p.y - dr.start.y };
          if (e.shiftKey) { if (Math.abs(want.x - dr.at.x) > Math.abs(want.y - dr.at.y)) want.y = dr.at.y; else want.x = dr.at.x; }
          let q = want, snapLines: SnapLine[] = [];
          if (!e.ctrlKey) {
            const r = snapPoint(want, dr.targets, tol, settings);
            const onOutline = r.lines.some((x) => x.kind === "point") ? null : snapToOutlines(want, dr.outlines, tol);
            if (onOutline) { q = onOutline; snapLines = [{ axis: "x", at: q.x, from: q.y, to: q.y, kind: "point" }]; }
            else { q = r.p; snapLines = r.lines; }
          }
          setLines(snapLines);
          const dx = q.x - dr.at.x, dy = q.y - dr.at.y;
          s.preview((d) => {
            const byId = new Map<string, AnchorRef[]>();
            for (const r of dr.refs) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
            for (const [id, rs] of byId) {
              const lb = locate(base.root, id);
              const path = lb && ensurePath(d, id);
              if (!lb || !path) continue;
              const o = toLocalDelta(lb.world, dx, dy);
              for (const r of rs) {
                const a = path.subpaths[r.sub]?.nodes[r.idx];
                if (!a) continue;
                a.x += o.x; a.y += o.y;
                if (a.i) { a.i.x += o.x; a.i.y += o.y; }
                if (a.o) { a.o.x += o.x; a.o.y += o.y; }
              }
              path.subpaths = path.subpaths.map((sp) => refreshAuto(sp));
            }
          });
          setHud({ x: sp.x, y: sp.y, text: `X ${fmt(q.x)}  Y ${fmt(q.y)} ${doc.units}` });
          return;
        }
        const q = e.ctrlKey ? p : snapPoint(p, dr.targets, tol, settings).p;
        s.preview((d) => {
          const path = ensurePath(d, dr.ref.id);
          if (!path) return;
          const lp = apply(invertWorld(l.world), q);
          const a = path.subpaths[dr.ref.sub]?.nodes[dr.ref.idx];
          if (!a) return;
          const mine = dr.part === "in" ? "i" : "o", other = dr.part === "in" ? "o" : "i";
          a[mine] = { x: lp.x, y: lp.y };
          if (a.k === "auto") a.k = "smooth";
          if (e.altKey || dr.alt) a.k = "corner";
          else if (a[other] && a.k !== "corner") {
            const vx = a.x - lp.x, vy = a.y - lp.y, len = Math.hypot(vx, vy) || 1;
            const keep = a.k === "symmetric" ? len : Math.hypot(a[other]!.x - a.x, a[other]!.y - a.y);
            a[other] = { x: a.x + (vx / len) * keep, y: a.y + (vy / len) * keep };
          }
        });
        setHud({ x: sp.x, y: sp.y, text: `X ${fmt(q.x)}  Y ${fmt(q.y)} ${doc.units}` });
        return;
      }
    }
  }

  function invertWorld(m: Mat): Mat {
    const det = m[0] * m[3] - m[1] * m[2] || 1;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  }

  /** Parameters for a dragged effect handle, always computed from the document before the drag. */
  function fxHandlePatch(dr: Extract<Drag, { kind: "fxHandle" }>, p: Vec) {
    const s = api.getState();
    const n = findNode((s.base ?? s.doc).root, dr.node);
    return n ? effectDragPatch(n, dr.effect, dr.index, apply(invertWorld(dr.world), p)) : null;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const s = api.getState();
    const dr = drag.current;
    drag.current = null;
    setLines([]);
    setHud(null);
    if (!dr) return;
    const p = toDoc(e.clientX, e.clientY);
    switch (dr.kind) {
      case "pan": setCursor(space.current ? "grab" : null); return;
      case "fxHandle": {
        const patch = dr.moved ? fxHandlePatch(dr, p) : null;
        const n = findNode((s.base ?? s.doc).root, dr.node);
        const kind = n && canHaveEffects(n) ? n.effects?.find((f) => f.id === dr.effect)?.kind : undefined;
        s.end(`Move ${kind ? EFFECTS[kind].label : "Effect"} Handle`, patch ? (d) => { setEffectParams(d, dr.node, dr.effect, patch as never); } : null);
        return;
      }
      case "guide": {
        const sp = screenPoint(e);
        const off = s.ui.rulers && ((dr.axis === "x" && sp.x < RULER) || (dr.axis === "y" && sp.y < RULER));
        const at = dr.axis === "x" ? p.x : p.y;
        s.end(dr.isNew ? "Add Guide" : off ? "Delete Guide" : "Move Guide", (d) => {
          if (off) { if (!dr.isNew) d.guides.splice(dr.index, 1); return; }
          if (dr.isNew) d.guides.push({ axis: dr.axis, at }); else d.guides[dr.index].at = at;
        });
        return;
      }
      case "move": {
        if (!dr.moved) {
          s.end("", null);
          return;
        }
        let dx = p.x - dr.start.x, dy = p.y - dr.start.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const r = snapMove(dr.box, dx, dy, e.ctrlKey ? noTargets() : dr.targets, 6 / s.view.zoom, snapSettings(s.base ?? s.doc));
        if (e.shiftKey) { if (dx === 0) r.dx = 0; if (dy === 0) r.dy = 0; }
        const m = translate(r.dx, r.dy);
        const dup = e.altKey || dr.dup;
        let copies: string[] = [];
        s.end(dup ? "Duplicate" : "Move", (d) => {
          const ids = dup ? (copies = duplicateNodes(d, dr.ids, { x: 0, y: 0 }, idPool(dr.pool))) : dr.ids;
          transformNodes(d, ids, m);
        }, dup ? copies : undefined);
        if (dup) s.select(copies);
        s.set({ lastTransform: m });
        return;
      }
      case "lasso": {
        rerender();
        const ids = lassoHits(s.doc, dr.pts);
        if (dr.mode === "remove") { const out = new Set(ids); s.select(s.selection.filter((id) => !out.has(id))); }
        else s.select(ids, dr.mode === "add" ? "add" : "set");
        return;
      }
      case "knife": {
        rerender();
        let out: string[] = [];
        s.edit("Knife", (d) => { out = knifeCut(d, dr.ids, dr.pts); });
        if (out.length) s.select(out); else onToast("Drag all the way across a closed shape to slice it.");
        return;
      }
      case "erase": {
        const size = s.eraserSize;
        s.end(dr.mode === "delete" ? "Erase Objects" : "Erase", (d) => erase(d, dr.mode, dr.ids, dr.pts, size));
        rerender();
        return;
      }
      case "session": dr.session.up(toolPointer(e, p)); rerender(); return;
      case "build": {
        let out: string[] = [];
        s.edit(dr.remove ? "Shape Builder: Delete" : "Shape Builder", (d) => { out = buildShapes(d, dr.ids, dr.remove ? [] : dr.faces, dr.remove ? dr.faces : []); });
        s.select(out);
        setHoverFace(-1);
        rerender();
        return;
      }
      case "measure": rerender(); return;
      case "scale": case "rotate": case "toolScale": case "shear": {
        const cur = s.doc, base = s.base;
        if (!base) return;
        const label = dr.kind === "rotate" ? "Rotate" : dr.kind === "shear" ? "Shear" : "Scale";
        const ids = dr.ids;
        const finals = ids.map((id) => findNode(cur.root, id)?.transform);
        s.end(label, (d) => { ids.forEach((id, k) => { const n = findNode(d.root, id); if (n && finals[k]) n.transform = finals[k]!; }); });
        const n0 = findNode(base.root, ids[0]), n1 = findNode(cur.root, ids[0]);
        if (n0 && n1) {
          const l0 = locate(base.root, ids[0])!, l1 = locate(cur.root, ids[0])!;
          s.set({ lastTransform: mulInv(l1.world, l0.world) });
        }
        return;
      }
      case "marquee": {
        const b = normBox(dr.start, p);
        if ((b.maxX - b.minX) * s.view.zoom < 2 && (b.maxY - b.minY) * s.view.zoom < 2) { if (dr.deep && !dr.add) s.select([]); rerender(); return; }
        if (dr.deep && s.selection.length) {
          const inside: AnchorRef[] = [];
          for (const id of s.selection) {
            const l = locate(s.doc.root, id);
            const subs = l && editableSubpaths(l.node);
            if (!l || !subs) continue;
            transformSubpaths(subs, l.world).forEach((sp, si) => sp.nodes.forEach((a, k) => { if (a.x >= b.minX && a.x <= b.maxX && a.y >= b.minY && a.y <= b.maxY) inside.push({ id, sub: si, idx: k }); }));
          }
          if (inside.length) { s.setAnchors(inside); rerender(); return; }
        }
        const ids = idsInBox(s.doc, b, "touch", dr.deep);
        s.select(ids, dr.add ? "add" : "set");
        rerender();
        return;
      }
      case "zoom": {
        const b = normBox(dr.start, p);
        if ((b.maxX - b.minX) * s.view.zoom > 6) fitBox(b);
        else { const sp = screenPoint(e); zoomAt(dr.alt || e.altKey ? 0.5 : 2, sp.x, sp.y); }
        rerender();
        return;
      }
      case "pencil": {
        rerender();
        if (dr.pts.length < 2) return;
        const z = s.view.zoom;
        const closed = Math.hypot(dr.pts[0].x - dr.pts[dr.pts.length - 1].x, dr.pts[0].y - dr.pts[dr.pts.length - 1].y) * z < 10 && dr.pts.length > 8;
        const sub = freehandPath(dr.pts, pencilTolerance(s.pencilSmoothing) / z, closed, s.pencilMode);
        if (sub.nodes.length < 2) return;
        const subpaths = s.pencilPressure ? brushOutline(sub, pressureWidth(dr.pts, dr.pressure, s.brushWidth)) : [sub];
        if (!subpaths.length) return;
        const node: PathNode = { id: newId(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: s.currentLayer, subpaths };
        s.edit("Pencil", (d) => addNode(d, node), { select: [node.id] });
        return;
      }
      case "penHandle": rerender(); return;
      case "text": {
        const b = normBox(dr.start, p);
        const area = (b.maxX - b.minX) * s.view.zoom > 8;
        const t = s.textDefaults;
        const node: TextNode = {
          id: newId(), type: "text", transform: translate(area ? b.minX : dr.start.x, area ? b.minY + t.size : dr.start.y), layer: s.currentLayer,
          text: "", font: t.font, size: t.size, tracking: t.tracking, lineHeight: t.lineHeight, align: t.align, direction: t.direction,
          ...(area ? { width: b.maxX - b.minX } : {}), outline: [],
        };
        s.edit("Type", (d) => addNode(d, node), { select: [node.id] });
        s.set({ textEditing: node.id });
        rerender();
        return;
      }
      case "draw": {
        rerender();
        const z = s.view.zoom;
        if (dr.tool === "line") {
          if (Math.hypot(dr.cur.x - dr.start.x, dr.cur.y - dr.start.y) * z < 2) return;
          const node: PathNode = { id: newId(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: s.currentLayer, subpaths: [{ closed: false, nodes: [{ ...dr.start }, { ...dr.cur }] }] };
          s.edit("Line", (d) => addNode(d, node), { select: [node.id] });
          return;
        }
        let bx = drawBox(dr);
        if (bx.w * z < 3 && bx.h * z < 3) bx = { c: dr.start, w: 40, h: 40 };
        const kind = dr.tool as ShapeKind;
        const shape = shapeForBox(kind, bx.w, bx.h, s.shapeDefaults[kind]);
        const node: SceneNode = { id: newId(), type: "shape", transform: translate(bx.c.x, bx.c.y), layer: s.currentLayer, shape };
        s.edit(`Draw ${kind[0].toUpperCase()}${kind.slice(1)}`, (d) => addNode(d, node), { select: [node.id] });
        return;
      }
      case "anchor": {
        s.end(dr.part === "node" ? "Move Anchor Points" : "Move Handle", (d) => {
          const fin = findNode(s.doc.root, dr.ref.id);
          const l = locate(d.root, dr.ref.id);
          if (fin && l) l.parent.children[l.index] = fin;
        });
        return;
      }
    }
  }

  function mulInv(a: Mat, b: Mat): Mat {
    const ib = invertWorld(b);
    return [a[0] * ib[0] + a[2] * ib[1], a[1] * ib[0] + a[3] * ib[1], a[0] * ib[2] + a[2] * ib[3], a[1] * ib[2] + a[3] * ib[3], a[0] * ib[4] + a[2] * ib[5] + a[4], a[1] * ib[4] + a[3] * ib[5] + a[5]];
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const s = api.getState();
    const p = toDoc(e.clientX, e.clientY);
    const tol = 4 / s.view.zoom;
    if (s.tool === "select" || s.tool === "text") {
      const id = hitTest(s.doc, p, tol, { deep: true });
      const n = id ? findNode(s.doc.root, id) : null;
      if (n?.type === "text") { s.select([n.id]); s.set({ textEditing: n.id }); return; }
      if (id && s.tool === "select") { s.setTool("direct"); s.select([id]); }
      return;
    }
    if (s.tool === "direct") {
      for (const id of s.selection) {
        const l = locate(s.doc.root, id);
        const subs = l && editableSubpaths(l.node);
        if (!l || !subs) continue;
        const near = nearestOnSubpaths(toLocal(s.doc.root, id, p), subs);
        if (near && near.dist * s.view.zoom * Math.hypot(l.world[0], l.world[1]) <= 6) {
          s.edit("Add Anchor Point", (d) => {
            const path = ensurePath(d, id);
            if (path) path.subpaths[near.sub] = insertAnchor(path.subpaths[near.sub], near.seg, near.t);
          });
          s.setAnchors([{ id, sub: near.sub, idx: near.seg + 1 }]);
          return;
        }
      }
    }
  }

  function onContextMenuEvent(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const s = api.getState();
    const p = toDoc(e.clientX, e.clientY);
    const hit = hitTest(s.doc, p, 4 / s.view.zoom, { deep: s.tool === "direct" });
    if (hit && !s.selection.includes(hit)) s.select([hit]);
    onContextMenu(e.clientX, e.clientY);
  }

  // ---------- render ----------

  const layerColor = (n: SceneNode) => { const c = doc.cutLayers[n.layer]?.color ?? "#888888"; return c === "#000000" ? "var(--ink)" : c; };
  const outline = ui.outline;
  const renderNode = (n: SceneNode): ReactNode => {
    if (n.hidden) return null;
    if (textEditing === n.id) return null;
    const layer = doc.cutLayers[n.layer];
    const dim = layer && !layer.show ? 0.25 : 1;
    if (n.type === "group") {
      if (n.role === "clip" && n.children.length > 1) {
        const [mask, ...rest] = n.children;
        const cid = `clip-${n.id}`;
        return (
          <g key={n.id} transform={matStr(n.transform)} data-id={n.id}>
            <clipPath id={cid}><path d={localD(mask)} transform={matStr(mask.transform)} clipRule="evenodd" /></clipPath>
            <g clipPath={`url(#${cid})`}>{rest.map(renderNode)}</g>
            <path d={localD(mask)} transform={matStr(mask.transform)} fill="none" stroke="var(--text-disabled)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        );
      }
      return <g key={n.id} transform={matStr(n.transform)} data-id={n.id}>{n.children.map(renderNode)}</g>;
    }
    if (n.type === "image") {
      return <rect key={n.id} x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} transform={matStr(n.transform)} fill="url(#hl-hatch)" stroke={outline ? "var(--text-secondary)" : layerColor(n)} vectorEffect="non-scaling-stroke" opacity={dim} />;
    }
    if (n.type === "dimension" && n.points.length >= 2) {
      const m = n.transform, [a, b] = n.points;
      const len = Math.hypot(b.x - a.x, b.y - a.y) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      return (
        <g key={n.id} transform={matStr(n.transform)} data-id={n.id} opacity={dim}>
          <path d={localD(n)} fill="none" stroke={outline ? "var(--ink)" : layerColor(n)} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
          <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4 / zoom} fontSize={11 / zoom} textAnchor="middle" fill={outline ? "var(--ink)" : layerColor(n)} fontFamily="var(--font-num)" data-testid="dimension-label">{fmt(len)} {doc.units}</text>
        </g>
      );
    }
    const fillMode = !outline && layer?.mode === "fill" && n.type !== "dimension";
    return (
      <path
        key={n.id} d={localD(n)} transform={matStr(n.transform)} data-id={n.id}
        fill={fillMode ? layerColor(n) : "none"} fillOpacity={fillMode ? 0.35 : undefined} fillRule="evenodd"
        stroke={outline ? "var(--ink)" : layerColor(n)} strokeWidth={1} vectorEffect="non-scaling-stroke"
        strokeDasharray={layer?.mode === "score" && !outline ? "4 2" : n.type === "dimension" ? "2 2" : undefined}
        opacity={dim}
      />
    );
  };

  const vb = { minX: -view.x / zoom, minY: -view.y / zoom, maxX: (size.w - view.x) / zoom, maxY: (size.h - view.y) / zoom };
  const gridLines = useMemo(() => {
    if (!doc.grid.show) return null;
    const out: ReactNode[] = [];
    const major = doc.grid.size, minor = major / Math.max(1, doc.grid.subdivisions);
    const steps: [number, string][] = [];
    if (minor * zoom >= 7) steps.push([minor, "var(--grid-minor)"]);
    if (major * zoom >= 7) steps.push([major, "var(--grid-major)"]);
    for (const [step, color] of steps) {
      const x0 = Math.floor(vb.minX / step) * step, y0 = Math.floor(vb.minY / step) * step;
      const nx = Math.ceil((vb.maxX - x0) / step), ny = Math.ceil((vb.maxY - y0) / step);
      if (nx + ny > 1200) continue;
      let d = "";
      for (let k = 0; k <= nx; k++) { const x = x0 + k * step; d += `M${x} ${vb.minY}V${vb.maxY}`; }
      for (let k = 0; k <= ny; k++) { const y = y0 + k * step; d += `M${vb.minX} ${y}H${vb.maxX}`; }
      out.push(<path key={step + color} d={d} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.grid, zoom, vb.minX, vb.minY, vb.maxX, vb.maxY]);

  const dr = drag.current;
  const penState = pen.current;
  const draftPaths = useMemo((): string | null => {
    if (!dr) return null;
    if (dr.kind === "draw") {
      if (dr.tool === "line") return pathD([{ closed: false, nodes: [dr.start, dr.cur] }]);
      const bx = drawBox(dr);
      if (bx.w < 1e-6 && bx.h < 1e-6) return null;
      const kind = dr.tool as ShapeKind;
      return pathD(transformSubpaths(shapePaths(shapeForBox(kind, bx.w, bx.h, api.getState().shapeDefaults[kind])), translate(bx.c.x, bx.c.y)));
    }
    if (dr.kind === "pencil" || dr.kind === "knife") return pathD([{ closed: false, nodes: dr.pts.map((q) => ({ x: q.x, y: q.y })) }]);
    if (dr.kind === "lasso") return pathD([{ closed: true, nodes: dr.pts.map((q) => ({ x: q.x, y: q.y })) }]);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dr, dr && "cur" in dr ? dr.cur : null, dr && "pts" in dr ? dr.pts.length : 0, dr && "pts" in dr ? dr.pts[dr.pts.length - 1] : null]);
  const curveState = curve.current;
  const measure = useEditor((s) => s.measure);
  const brushRadius = useEditor((s) => (s.tool === "eraser" ? s.eraserSize / 2 : s.tool === "tweak" ? s.tweak.radius : s.tool === "spray" ? s.spray.radius : null));
  const sessionDraft = dr?.kind === "session" && dr.session.draft ? dr.session.draft() : null;

  const box = (b: Box) => { const a = S({ x: b.minX, y: b.minY }), c = S({ x: b.maxX, y: b.maxY }); return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y }; };
  const selRect = !isEmptyBox(selBox) ? box(selBox) : null;
  const toolCursor = cursor ?? (tool === "hand" ? "grab" : tool === "zoom" ? "zoom-in" : tool === "text" ? "text" : tool === "select" || tool === "direct" ? "default" : "crosshair");

  return (
    <div
      className={`st-stage${ui.rulers ? " with-rulers" : ""}`} ref={stageRef} data-testid="stage" tabIndex={-1}
      style={{ cursor: toolCursor }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerLeave={() => { setPointer(null); pointerStore.setState({ p: null }); }} onDoubleClick={onDoubleClick} onContextMenu={onContextMenuEvent}
    >
      <svg className="st-canvas" width={size.w} height={size.h} aria-label="Canvas" role="img">
        <defs>
          <pattern id="hl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--text-disabled)" strokeWidth="1" /></pattern>
          <filter id="hl-artboard-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy={2 / zoom} stdDeviation={6 / zoom} floodColor="#000" floodOpacity="0.35" />
          </filter>
          <pattern id="hl-build" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / zoom}) rotate(45)`}>
            <rect width="8" height="8" fill="color-mix(in srgb, var(--accent) 22%, transparent)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--accent)" strokeWidth="2" opacity="0.55" />
          </pattern>
          <clipPath id="hl-sheets">{doc.sheets.map((sh) => <rect key={sh.id} x={sh.x} y={sh.y} width={sh.w} height={sh.h} />)}</clipPath>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${zoom})`}>
          {doc.sheets.map((sh) => (
            <g key={sh.id}>
              <rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} fill="var(--surface-sheet)" filter={ui.presentation ? undefined : "url(#hl-artboard-shadow)"} />
              <rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} fill="none" stroke="var(--sheet-edge)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={sh.x} y={sh.y - 6 / zoom} fontSize={11 / zoom} fill="var(--text-secondary)" className="st-sheet-label">{sh.name} · {fmtLength(sh.w, doc.units)} × {fmtLength(sh.h, doc.units, true)}</text>
            </g>
          ))}
          {gridLines && <g clipPath={doc.sheets.length ? "url(#hl-sheets)" : undefined}>{gridLines}</g>}
          <g data-testid="scene">{doc.root.children.map(renderNode)}</g>
          {fxGuides.length > 0 && !ui.presentation && (
            <g className="fx-guides" data-testid="effect-guides" pointerEvents="none">
              {fxGuides.map(({ id, g }) => (
                <g key={id}>
                  <path d={pathD(g.lines)} fill="none" stroke="var(--guide)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  {g.labels.map((t, k) => (
                    <text key={k} x={t.x} y={t.y} fontSize={t.size} textAnchor="middle" dominantBaseline="central" fill="var(--guide)"
                      transform={`rotate(${t.angle} ${t.x} ${t.y})`} style={{ strokeWidth: 3 / zoom }} data-testid="effect-guide-label">{t.text}</text>
                  ))}
                </g>
              ))}
            </g>
          )}
          {ui.guidesShown && doc.guides.map((g, k) => g.axis === "x"
            ? <line key={k} x1={g.at} x2={g.at} y1={vb.minY} y2={vb.maxY} stroke="var(--guide)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            : <line key={k} y1={g.at} y2={g.at} x1={vb.minX} x2={vb.maxX} stroke="var(--guide)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          {tool === "shapeBuilder" && faces.length > 0 && (
            <g data-testid="builder-faces">
              {faces.map((f, k) => {
                const on = dr?.kind === "build" && dr.faces.includes(k);
                const hot = on || k === hoverFace;
                const del = dr?.kind === "build" ? dr.remove : false;
                return (
                  <path key={k} d={f.d} fillRule="evenodd" vectorEffect="non-scaling-stroke"
                    fill={hot ? (del ? "color-mix(in srgb, var(--danger, #e5484d) 35%, transparent)" : "url(#hl-build)") : "transparent"}
                    stroke={hot ? "var(--accent)" : "var(--accent)"} strokeOpacity={hot ? 1 : 0.35} strokeWidth={hot ? 1.5 : 1} strokeDasharray={hot ? undefined : "3 3"} />
                );
              })}
            </g>
          )}
          {draftPaths && (
            <path d={draftPaths} vectorEffect="non-scaling-stroke"
              fill={dr?.kind === "lasso" ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "none"}
              stroke={dr?.kind === "knife" ? "var(--danger, #e5484d)" : "var(--accent)"} strokeWidth={dr?.kind === "knife" ? 1.5 : 1}
              strokeDasharray={dr?.kind === "lasso" ? "4 3" : undefined} />
          )}
          {sessionDraft && <path d={sessionDraft} fill="var(--accent)" fillOpacity={0.55} fillRule="nonzero" stroke="none" data-testid="calligraphy-draft" />}
        </g>
        {curveState && curveState.pts.length > 0 && (() => {
          const pts = curveState.pts.map(S);
          const live = pointer && !curveState.hoverClose ? [...pts, S(pointer)] : pts;
          return (
            <g data-testid="curvature-draft">
              <path d={pathD([curvaturePath(live, curveState.corners, curveState.hoverClose)])} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
              {pts.map((q, k) => curveState.corners.has(k)
                ? <rect key={k} x={q.x - 3} y={q.y - 3} width={6} height={6} fill={k === 0 && curveState.hoverClose ? "var(--accent)" : "var(--handle-fill)"} stroke="var(--accent)" />
                : <circle key={k} cx={q.x} cy={q.y} r={3.5} fill={k === 0 && curveState.hoverClose ? "var(--accent)" : "var(--handle-fill)"} stroke="var(--accent)" />)}
            </g>
          );
        })()}
        {brushRadius !== null && pointer && (() => { const q = S(pointer); return <circle cx={q.x} cy={q.y} r={Math.max(2, brushRadius * zoom)} fill={tool === "eraser" ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "none"} stroke="var(--accent)" strokeDasharray={tool === "eraser" ? undefined : "4 3"} pointerEvents="none" data-testid={`${tool}-brush`} />; })()}
        {tool === "measure" && measure && <MeasureOverlay a={measure.a} b={measure.b} result={measure.result} S={S} zoom={zoom} fmt={(mm) => `${fmt(mm)} ${doc.units}`} />}
        {/* screen-space overlay */}
        {selection.map((id) => {
          const l = locate(doc.root, id);
          if (!l || l.node.type === "group") return null;
          const fx = hasEffects(l.node);
          if (tool !== "direct" && !fx) return null;
          return (
            <path key={"h" + id} d={pathD(transformSubpaths(nodeBasePaths(l.node), l.world))} transform={`translate(${view.x} ${view.y}) scale(${zoom})`}
              fill="none" stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none"
              {...(fx ? { strokeDasharray: "4 3", opacity: tool === "direct" ? 1 : 0.75, "data-testid": "effect-base-outline" } : {})} />
          );
        })}
        {selRect && (
          <g data-testid="selection-box">
            <rect x={selRect.x} y={selRect.y} width={selRect.w} height={selRect.h} fill="none" stroke="var(--accent)" strokeWidth={1} />
            {tool === "select" && HANDLES.map((h) => { const q = handlePos({ minX: selRect.x, minY: selRect.y, maxX: selRect.x + selRect.w, maxY: selRect.y + selRect.h }, h); return <rect key={h} x={q.x - 3.5} y={q.y - 3.5} width={7} height={7} fill="var(--handle-fill)" stroke="var(--accent)" strokeWidth={1} />; })}
            {tool === "select" && <circle cx={selRect.x + selRect.w / 2} cy={selRect.y + selRect.h / 2} r={2.5} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.8} />}
          </g>
        )}
        {fxView.length > 0 && (
          <g data-testid="effect-handles">
            {fxView.map((v) => (
              <g key={v.effect} data-effect={v.effect}>
                {v.outline.length > 0 && (
                  <path d={pathD(v.outline)} transform={`translate(${view.x} ${view.y}) scale(${zoom})`} fill="none" stroke="var(--smart-guide)"
                    strokeWidth={1} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                )}
                {v.pts.map((q, k) => { const a = S(q); return <rect key={k} className="fx-handle" x={a.x - 4} y={a.y - 4} width={8} height={8} transform={`rotate(45 ${a.x} ${a.y})`} data-testid="effect-handle" />; })}
              </g>
            ))}
          </g>
        )}
        {directionMarks.map((m, k) => (
          <path key={"dir" + k} d="M -4 -4 L 2 0 L -4 4" transform={`translate(${m.p.x} ${m.p.y}) rotate(${m.a})`} fill="none" stroke="var(--accent)" strokeWidth={1.5} data-testid="path-direction" />
        ))}
        {anchorView.map((a) => {
          const sel = anchors.some((r) => r.id === a.ref.id && r.sub === a.ref.sub && r.idx === a.ref.idx);
          const showH = sel || ui.nodeHandles;
          const fill = sel ? "var(--accent)" : "var(--handle-fill)";
          return (
            <g key={`${a.ref.id}-${a.ref.sub}-${a.ref.idx}`}>
              {showH && a.i && <><line x1={a.p.x} y1={a.p.y} x2={a.i.x} y2={a.i.y} stroke="var(--accent)" opacity={sel ? 1 : 0.6} /><circle cx={a.i.x} cy={a.i.y} r={3} fill="var(--accent)" opacity={sel ? 1 : 0.6} /></>}
              {showH && a.o && <><line x1={a.p.x} y1={a.p.y} x2={a.o.x} y2={a.o.y} stroke="var(--accent)" opacity={sel ? 1 : 0.6} /><circle cx={a.o.x} cy={a.o.y} r={3} fill="var(--accent)" opacity={sel ? 1 : 0.6} /></>}
              {a.k === "auto" ? <circle cx={a.p.x} cy={a.p.y} r={3.5} fill={fill} stroke="var(--accent)" data-node-kind="auto" />
                : a.k === "smooth" || a.k === "symmetric" ? <rect x={a.p.x - 3} y={a.p.y - 3} width={6} height={6} transform={`rotate(45 ${a.p.x} ${a.p.y})`} fill={fill} stroke="var(--accent)" data-node-kind={a.k} />
                : <rect x={a.p.x - 3} y={a.p.y - 3} width={6} height={6} fill={fill} stroke="var(--accent)" />}
            </g>
          );
        })}
        {penState && penState.nodes.length > 0 && (
          <g>
            <path d={pathD([penSubpath(penMode, penState.nodes.map((n) => ({ ...S(n), ...(n.i ? { i: S(n.i) } : {}), ...(n.o ? { o: S(n.o) } : {}) })), false)])} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
            {pointer && !dr && penMode !== "paraxial" && <line x1={S(penState.nodes[penState.nodes.length - 1]).x} y1={S(penState.nodes[penState.nodes.length - 1]).y} x2={S(pointer).x} y2={S(pointer).y} stroke="var(--accent)" strokeDasharray="3 3" />}
            {pointer && !dr && penMode === "paraxial" && <polyline points={paraxialAppend(penState.nodes, pointer).slice(penState.nodes.length - 1).map((q) => `${S(q).x},${S(q).y}`).join(" ")} fill="none" stroke="var(--accent)" strokeDasharray="3 3" />}
            {penState.nodes.map((n, k) => { const q = S(n); return <rect key={k} x={q.x - 3} y={q.y - 3} width={6} height={6} fill={k === 0 && penState.hoverClose ? "var(--accent)" : "var(--handle-fill)"} stroke="var(--accent)" />; })}
          </g>
        )}
        {dr && (dr.kind === "marquee" || dr.kind === "zoom" || dr.kind === "text") && (() => { const r = box(normBox(dr.start, dr.cur)); return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="color-mix(in srgb, var(--accent) 10%, transparent)" stroke="var(--accent)" strokeDasharray="4 3" data-testid="marquee" />; })()}
        {lines.map((l, k) => {
          const a = l.axis === "x" ? S({ x: l.at, y: l.from }) : S({ x: l.from, y: l.at });
          const b = l.axis === "x" ? S({ x: l.at, y: l.to }) : S({ x: l.to, y: l.at });
          if (l.kind === "point") return <circle key={k} cx={a.x} cy={a.y} r={4} fill="none" stroke="var(--smart-guide)" />;
          return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--smart-guide)" strokeWidth={1} strokeDasharray={l.kind === "spacing" ? "2 2" : undefined} />;
        })}
      </svg>
      {ui.rulers && <Rulers view={view} size={size} units={doc.units} pointer={pointer} />}
      {hud && <div className="st-hud" style={{ left: hud.x + 16, top: hud.y + 16 }} data-testid="hud">{hud.text}</div>}
      {textEditing && <TextEditor id={textEditing} S={S} zoom={zoom} />}
    </div>
  );
}

function niceStep(pxPerUnit: number): number {
  const target = 60 / pxPerUnit;
  const pow = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}

function Rulers({ view, size, units, pointer }: { view: { zoom: number; x: number; y: number }; size: { w: number; h: number }; units: Document["units"]; pointer: Vec | null }) {
  const unitMM = fromMM(1, units) === 0 ? 1 : 1 / fromMM(1, units);
  const pxPerUnit = view.zoom * unitMM;
  const step = niceStep(pxPerUnit);
  const ticks = (len: number, offset: number) => {
    const out: { at: number; v: number; major: boolean }[] = [];
    const first = Math.floor(-offset / pxPerUnit / (step / 5)) * (step / 5);
    for (let v = first; (v * pxPerUnit + offset) < len; v += step / 5) {
      const at = v * pxPerUnit + offset;
      if (at < RULER) continue;
      out.push({ at, v, major: Math.abs(v / step - Math.round(v / step)) < 1e-6 });
    }
    return out;
  };
  const label = (v: number) => String(Math.round(v * 1000) / 1000);
  return (
    <>
      <svg className="st-ruler top" width={size.w} height={RULER} aria-hidden>
        {ticks(size.w, view.x).map((t, k) => <g key={k}><line x1={t.at} x2={t.at} y1={t.major ? 4 : 14} y2={RULER} />{t.major && <text x={t.at + 3} y={11}>{label(t.v)}</text>}</g>)}
        {pointer && <line className="ptr" x1={pointer.x * view.zoom + view.x} x2={pointer.x * view.zoom + view.x} y1={0} y2={RULER} />}
      </svg>
      <svg className="st-ruler left" width={RULER} height={size.h} aria-hidden>
        {ticks(size.h, view.y).map((t, k) => <g key={k}><line y1={t.at} y2={t.at} x1={t.major ? 4 : 14} x2={RULER} />{t.major && <text x={11} y={t.at + 3} transform={`rotate(-90 11 ${t.at + 3})`}>{label(t.v)}</text>}</g>)}
        {pointer && <line className="ptr" y1={pointer.y * view.zoom + view.y} y2={pointer.y * view.zoom + view.y} x1={0} x2={RULER} />}
      </svg>
      <div className="st-ruler corner" aria-hidden />
    </>
  );
}
