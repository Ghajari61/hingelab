/**
 * Pointer handling for the click-and-brush tools (Fill Bounded Area, Calligraphy, Tweak, Spray and
 * Measure's Convert to Item). Canvas forwards pointer events here; every stroke or click is one undo step.
 */
import { produce } from "immer";
import type { StoreApi } from "zustand";
import { seeded } from "@/lib/studio/arrays";
import { calligraphyStroke, nibRibbon, nibWidthMm, type InkSample } from "@/lib/studio/calligraphy";
import { newId } from "@/lib/studio/doc";
import { fillBoundedArea } from "@/lib/studio/fillArea";
import { pathD } from "@/lib/studio/geom";
import { addDimension } from "@/lib/studio/measure";
import { addNode, isEditable, topLevel, type IdFactory } from "@/lib/studio/scene";
import { applySpray, sprayObstacles, spraySources, sprayStep, type SprayItem } from "@/lib/studio/spray";
import { tweakStep } from "@/lib/studio/tweak";
import type { Document, PathNode, Vec } from "@/lib/studio/types";
import type { EditorState } from "../store";

type Api = StoreApi<EditorState>;
export interface ToolPointer { p: Vec; shift: boolean; alt: boolean; ctrl?: boolean; /** 0–1, a mouse reports 0.5 */ pressure: number; /** ms */ t: number }
export interface ToolSession {
  move: (e: ToolPointer) => void;
  /** May return a follow-up session that gets the hover moves and then the next click (3-point tools, Crop). */
  up: (e: ToolPointer) => ToolSession | void;
  /** Live filled shape (document space) drawn while dragging. */
  draft?: () => string | null;
  /** Live outline (document space). */
  outline?: () => string | null;
  /** Enter while the session waits for its click. */
  enter?: () => void;
}

const editableSelection = (s: EditorState) => s.selection.filter((id) => isEditable(s.doc.root, id));
const reuse = (pool: string[]): IdFactory => { let k = 0; return () => { if (k >= pool.length) pool.push(newId()); return pool[k++]; }; };

/** The last Fill Bounded Area result per editor, for Shift+click (add) and Alt+click (remove). */
const lastFill = new WeakMap<Api, string>();

/** Fill Bounded Area click. Works on the selection's outlines when something is selected, else on everything. */
export function fillClick(api: Api, e: ToolPointer, toast: (m: string) => void) {
  const s = api.getState();
  const ids = editableSelection(s);
  const prev = lastFill.get(api);
  const addTo = (e.shift || e.alt) && prev && isEditable(s.doc.root, prev) ? prev : null;
  if (e.alt && !addTo) { toast("Alt+click removes from the last fill. Fill an area first."); return; }
  let out: string | null = null;
  s.edit(e.alt ? "Fill Bounded Area: Remove" : addTo ? "Fill Bounded Area: Add" : "Fill Bounded Area", (d) => {
    out = fillBoundedArea(d, e.p, s.fill, { ids: ids.length ? ids : null, layer: s.currentLayer, addTo, subtract: e.alt }).id;
  });
  if (out) lastFill.set(api, out);
  else if (!e.alt) toast("Click inside an area closed on all sides by paths. Raise the gap to bridge small openings.");
}

/** Measure ▸ Convert to Item: the last measurement becomes a dimension on the Measurements layer. */
export function measureToItem(api: Api, toast: (m: string) => void): boolean {
  const s = api.getState();
  const m = s.measure;
  if (!m || Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) < 1e-6) { toast("Drag with the Measure tool first."); return false; }
  const id = newId();
  s.edit("Convert to Item", (d) => { addDimension(d, m.a, m.b, () => id); }, { select: [id] });
  return true;
}

/** Calligraphy goes on the current layer when it engraves (fills); otherwise on the first fill layer. */
export function calligraphyLayer(d: Document, current: number): number {
  if (d.cutLayers[current]?.mode === "fill") return current;
  const k = d.cutLayers.findIndex((l) => l.mode === "fill");
  return k >= 0 ? k : current;
}

export function startCalligraphy(api: Api, e: ToolPointer, view: { zoom: number; widthMm: number }): ToolSession {
  const params = { ...api.getState().calligraphy };
  const opts = { widthMm: nibWidthMm(params, view.widthMm), pxPerMm: view.zoom, seed: (Math.floor(e.t) % 2147483646) + 1 };
  const samples: InkSample[] = [{ x: e.p.x, y: e.p.y, t: e.t, pressure: e.pressure }];
  const add = (q: ToolPointer) => samples.push({ x: q.p.x, y: q.p.y, t: q.t, pressure: q.pressure });
  return {
    move: add,
    up: (q) => {
      add(q);
      const s = api.getState();
      const subpaths = calligraphyStroke(samples, params, opts);
      if (!subpaths.length) return;
      const node: PathNode = { id: newId(), type: "path", name: "Calligraphy", transform: [1, 0, 0, 1, 0, 0], layer: calligraphyLayer(s.doc, s.currentLayer), subpaths };
      s.edit("Calligraphy", (d) => addNode(d, node), { select: [node.id] });
    },
    draft: () => {
      const r = nibRibbon(samples, params, opts);
      if (r.left.length < 2) return null;
      return pathD([{ closed: true, nodes: [...r.left, ...r.right.reverse()] }]);
    },
  };
}

/** Tweak: works on the selection, or (nothing selected) on everything unlocked under the brush. */
export function startTweak(api: Api, e: ToolPointer): ToolSession {
  const s = api.getState();
  const ids = editableSelection(s);
  const t = { ...s.tweak };
  const rnd = seeded((Math.floor(e.t) % 2147483646) + 1);
  s.begin();
  let work = s.doc, last = e.p, changed = false;
  const step = (q: ToolPointer) => {
    const b = { c: q.p, r: t.radius, force: t.force, delta: { x: q.p.x - last.x, y: q.p.y - last.y }, invert: q.alt, fidelity: t.fidelity, rnd };
    last = q.p;
    let hit: string[] = [];
    work = produce(work, (d) => { hit = tweakStep(d, ids.length ? ids : null, t.mode, b); });
    if (!hit.length) return;
    changed = true;
    const root = work.root;
    api.getState().preview((d) => { d.root = root; });
  };
  step(e);
  return {
    move: step,
    up: () => {
      const root = work.root;
      api.getState().end(changed ? "Tweak" : "", changed ? (d) => { d.root = root; } : null);
    },
  };
}

const sprayStrokes = new WeakMap<Api, number>();

/** Spray: copies, clones or one combined path of the selection, a step every quarter radius of movement. */
export function startSpray(api: Api, e: ToolPointer, toast: (m: string) => void): ToolSession | null {
  const s = api.getState();
  const ids = topLevel(s.doc.root, editableSelection(s));
  const p = { ...s.spray };
  const sources = spraySources(s.doc, ids);
  if (!sources.length) { toast("Select the objects to spray first."); return null; }
  const srcIds = sources.map((x) => x.id);
  const stroke = (sprayStrokes.get(api) ?? 0) + 1;
  sprayStrokes.set(api, stroke);
  const rnd = seeded(Math.max(1, Math.round(p.seed)) * 7919 + stroke);
  const obstacles = p.noOverlap ? sprayObstacles(s.doc) : [];
  const items: SprayItem[] = [];
  const pool: string[] = [];
  const spacing = Math.max(0.5, p.radius / 4);
  let at = e.p;
  s.begin();
  const step = (c: Vec) => {
    const got = sprayStep(sources, c, p, rnd, items, obstacles);
    if (!got.length) return;
    items.push(...got);
    api.getState().preview((d) => { applySpray(d, srcIds, items, p.mode, reuse(pool)); });
  };
  step(e.p);
  return {
    move: (q) => {
      if (Math.hypot(q.p.x - at.x, q.p.y - at.y) < spacing) return;
      at = q.p;
      step(q.p);
    },
    up: () => {
      if (!items.length) { api.getState().end("", null); return; }
      const label = p.mode === "single" ? "Spray: Single Path" : p.mode === "clones" ? "Spray: Clones" : "Spray";
      // The sources stay selected so the next stroke sprays them again.
      api.getState().end(label, (d) => { applySpray(d, srcIds, items, p.mode, reuse(pool)); }, srcIds);
    },
  };
}
