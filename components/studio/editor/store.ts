"use client";

import { createContext, useContext } from "react";
import { produce } from "immer";
import { createStore, useStore, type StoreApi } from "zustand";
import type { ToolId } from "@/lib/studio/commands";
import { commit, emptyHistory, jumpTo, redo, seal, undo, type History } from "@/lib/studio/history";
import { allIds } from "@/lib/studio/scene";
import type { Document, Mat, ShapeKind, ShapeParams, TextNode, Vec } from "@/lib/studio/types";

export interface AnchorRef { id: string; sub: number; idx: number }

export interface ViewState { zoom: number; x: number; y: number }

export interface UiState { rulers: boolean; outline: boolean; guidesShown: boolean; guidesLocked: boolean; presentation: boolean }

export type TextDefaults = Pick<TextNode, "font" | "size" | "tracking" | "lineHeight" | "align" | "direction">;

export interface EditorState {
  doc: Document;
  history: History;
  selection: string[];
  anchors: AnchorRef[];
  tool: ToolId;
  view: ViewState;
  ui: UiState;
  /** Document at the start of a drag; previews are built from it and the drag ends as one undo step. */
  base: Document | null;
  shapeDefaults: Partial<Record<ShapeKind, ShapeParams>>;
  textDefaults: TextDefaults;
  /** Last world transform applied to a selection (Edit → Transform Again). */
  lastTransform: Mat | null;
  /** Id of the text object being typed into. */
  textEditing: string | null;
  /** Layer for new objects. */
  currentLayer: number;
  /** Transform reference point as fractions of the selection box (0, 0.5, 1); X/Y, W/H and rotation use it. */
  refPoint: [number, number];
  /** W and H change together. */
  lockRatio: boolean;
  /** Eraser tool diameter, mm. */
  eraserSize: number;
  /** The Measure tool's last measurement (document space). */
  measure: { a: Vec; b: Vec } | null;
  /** What Align lines objects up with; the key object is the last one clicked. */
  alignTo: "selection" | "key" | "artboard";
  /** Distribute Spacing gap in mm, or null for equal gaps between the outer objects. */
  alignGap: number | null;

  edit: <T = void>(label: string, recipe: (d: Document) => T, o?: { mergeKey?: string; select?: string[] }) => T;
  begin: () => void;
  preview: (recipe: (d: Document) => void) => void;
  end: (label: string, recipe: ((d: Document) => void) | null, select?: string[]) => void;
  seal: () => void;
  undo: () => string | undefined;
  redo: () => string | undefined;
  jump: (index: number) => void;
  /** Replaces the document without history (load, revert). */
  replace: (doc: Document) => void;
  /** Updates derived caches (text outlines) without an undo step; skipped while a drag is running. */
  quiet: (recipe: (d: Document) => void) => void;
  select: (ids: string[], mode?: "set" | "add" | "toggle") => void;
  setAnchors: (a: AnchorRef[]) => void;
  setTool: (t: ToolId) => void;
  setView: (v: Partial<ViewState> | ((v: ViewState) => ViewState)) => void;
  setUi: (u: Partial<UiState>) => void;
  set: (p: Partial<Pick<EditorState, "shapeDefaults" | "textDefaults" | "lastTransform" | "textEditing" | "currentLayer" | "refPoint" | "lockRatio" | "eraserSize" | "measure" | "alignTo" | "alignGap">>) => void;
}

const keepExisting = (doc: Document, ids: string[]) => {
  if (!ids.length) return ids;
  const all = new Set(allIds(doc.root));
  return ids.filter((i) => all.has(i));
};

export const DEFAULT_TEXT: TextDefaults = { font: "fredoka", size: 12, tracking: 0, lineHeight: 1.2, align: "start", direction: "auto" };
export const DEFAULT_UI: UiState = { rulers: true, outline: false, guidesShown: true, guidesLocked: false, presentation: false };

export function createEditorStore(doc: Document): StoreApi<EditorState> {
  return createStore<EditorState>()((set, get) => ({
    doc,
    history: emptyHistory(),
    selection: [],
    anchors: [],
    tool: "select",
    view: { zoom: 1, x: 0, y: 0 },
    ui: { ...DEFAULT_UI },
    base: null,
    shapeDefaults: {},
    textDefaults: { ...DEFAULT_TEXT },
    lastTransform: null,
    textEditing: null,
    currentLayer: 2,
    refPoint: [0, 0],
    lockRatio: false,
    eraserSize: 4,
    measure: null,
    alignTo: "selection",
    alignGap: null,

    edit: (label, recipe, o = {}) => {
      const s = get();
      const r = commit(s.doc, s.history, label, recipe, { mergeKey: o.mergeKey });
      if (r.changed) {
        const doc = { ...r.doc, updatedAt: new Date().toISOString() };
        set({ doc, history: r.history, selection: o.select ?? keepExisting(doc, s.selection), anchors: o.select ? [] : s.anchors });
      } else if (o.select) set({ selection: o.select });
      return r.result;
    },
    begin: () => set((s) => ({ base: s.base ?? s.doc })),
    preview: (recipe) => {
      const base = get().base;
      if (!base) return;
      set({ doc: produce(base, recipe) });
    },
    end: (label, recipe, select) => {
      const s = get();
      const base = s.base;
      if (!base) return;
      if (!recipe) { set({ doc: base, base: null }); return; }
      const r = commit(base, s.history, label, recipe);
      const doc = r.changed ? { ...r.doc, updatedAt: new Date().toISOString() } : base;
      set({ doc, history: r.history, base: null, selection: select ?? keepExisting(doc, s.selection) });
    },
    seal: () => set((s) => ({ history: seal(s.history) })),
    undo: () => {
      const s = get();
      const r = undo(s.doc, s.history);
      if (!r.label) return undefined;
      set({ doc: { ...r.doc }, history: r.history, selection: keepExisting(r.doc, s.selection), anchors: [] });
      return r.label;
    },
    redo: () => {
      const s = get();
      const r = redo(s.doc, s.history);
      if (!r.label) return undefined;
      set({ doc: { ...r.doc }, history: r.history, selection: keepExisting(r.doc, s.selection), anchors: [] });
      return r.label;
    },
    jump: (index) => {
      const s = get();
      const r = jumpTo(s.doc, s.history, index);
      set({ doc: r.doc, history: r.history, selection: keepExisting(r.doc, s.selection), anchors: [] });
    },
    replace: (d) => set({ doc: d, history: emptyHistory(), selection: [], anchors: [], base: null }),
    quiet: (recipe) => { if (!get().base) set((s) => ({ doc: produce(s.doc, recipe) })); },
    select: (ids, mode = "set") => set((s) => {
      if (mode === "set") return { selection: ids, anchors: [] };
      if (mode === "add") return { selection: [...new Set([...s.selection, ...ids])] };
      const cur = new Set(s.selection);
      for (const id of ids) { if (cur.has(id)) cur.delete(id); else cur.add(id); }
      return { selection: [...cur] };
    }),
    setAnchors: (anchors) => set({ anchors }),
    setTool: (tool) => set((s) => ({ tool, anchors: tool === "direct" ? s.anchors : [], textEditing: null })),
    setView: (v) => set((s) => ({ view: typeof v === "function" ? v(s.view) : { ...s.view, ...v } })),
    setUi: (u) => set((s) => ({ ui: { ...s.ui, ...u } })),
    set: (p) => set(p),
  }));
}

export const EditorContext = createContext<StoreApi<EditorState> | null>(null);

export function useEditorApi(): StoreApi<EditorState> {
  const api = useContext(EditorContext);
  if (!api) throw new Error("Editor store missing");
  return api;
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(useEditorApi(), selector);
}
