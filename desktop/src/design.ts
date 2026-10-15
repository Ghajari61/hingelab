/**
 * One open design: its settings, the server's latest answer, undo and redo. Every edit is sent to
 * the server (typing is debounced); answers that arrive after a newer request are dropped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ipc, type AppError, type GenerateRequest, type GenerateResponse } from "./ipc";

export type Params = Record<string, unknown>;

export function setPath(o: Params, key: string, v: unknown): Params {
  const [head, ...rest] = key.split(".");
  if (!rest.length) return { ...o, [head]: v };
  const child = o[head] && typeof o[head] === "object" ? (o[head] as Params) : {};
  return { ...o, [head]: setPath(child, rest.join("."), v) };
}

export function getPath(o: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Params)[k] : undefined), o);
}

/** The project file a design was opened from or saved to. */
export interface DesignFile {
  path: string;
  name: string;
}

export interface DesignState {
  product: string | null;
  params: Params | null;
  result: (GenerateResponse & { designId?: number }) | null;
  status: number;
  busy: boolean;
  error: AppError | null;
  canUndo: boolean;
  canRedo: boolean;
  file: DesignFile | null;
  /** The settings as last saved to (or opened from) `file`, as JSON. */
  savedJson: string | null;
}

/** Changes since the design was opened or last saved. */
export const isDirty = (s: DesignState): boolean => (s.file ? s.savedJson !== null && JSON.stringify(s.params) !== s.savedJson : s.canUndo);

const TYPE_DELAY = 450;
const MAX_HISTORY = 100;

export function useDesign(onFatal: (e: AppError) => void) {
  const [state, setState] = useState<DesignState>({ product: null, params: null, result: null, status: 0, busy: false, error: null, canUndo: false, canRedo: false, file: null, savedJson: null });
  /** The first answer after opening a file sets what "saved" means (the server fills in defaults). */
  const cleanNext = useRef(false);
  const seq = useRef(0);
  const params = useRef<Params | null>(null);
  const product = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<{ key: string; value: unknown } | null>(null);
  const past = useRef<Params[]>([]);
  const future = useRef<Params[]>([]);
  const retryTimer = useRef<number | null>(null);
  const lastRequest = useRef<GenerateRequest | null>(null);
  /** The 3D view is open: builds also bring the assembled model. */
  const want3d = useRef(false);
  const hasModel = useRef(false);

  const flags = () => ({ canUndo: past.current.length > 1, canRedo: future.current.length > 0 });

  const send = useCallback(async (request: GenerateRequest, record = true): Promise<void> => {
    const req: GenerateRequest = want3d.current ? { ...request, model: true } : request;
    const id = ++seq.current;
    lastRequest.current = req;
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    setState((s) => ({ ...s, busy: true }));
    try {
      const out = await ipc.generate(req);
      if (id !== seq.current) return;
      const next = out.body.params;
      params.current = next;
      hasModel.current = !!out.body.model;
      if (record) {
        const prev = past.current[past.current.length - 1];
        if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
          past.current = [...past.current, next].slice(-MAX_HISTORY);
          future.current = [];
        }
      }
      const clean = cleanNext.current ? JSON.stringify(next) : null;
      cleanNext.current = false;
      setState((s) => ({ ...s, product: out.body.product, params: next, result: out.body, status: out.status, busy: false, error: null, ...flags(), ...(clean ? { savedJson: clean } : {}) }));
      // The 3D view opened while this build was on its way: build again with the model.
      if (want3d.current && !req.model && out.status === 200) void send({ product: out.body.product, params: next }, false);
    } catch (e) {
      if (id !== seq.current) return;
      const err = e as AppError;
      if (err.kind === "unauthorized" || err.kind === "update_required") onFatal(err);
      if (err.kind === "rate_limited") {
        retryTimer.current = window.setTimeout(() => {
          if (lastRequest.current) void send(lastRequest.current, record);
        }, Math.min(60, err.retryAfter ?? 5) * 1000);
      }
      setState((s) => ({ ...s, busy: false, error: err }));
    }
  }, [onFatal]);

  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const ch = pending.current;
    pending.current = null;
    if (ch && product.current) void send({ product: product.current as GenerateRequest["product"], params: params.current ?? undefined, change: ch });
  }, [send]);

  const open = useCallback((p: string, from: { preset?: string; params?: Params; version?: number; file?: DesignFile }) => {
    if (timer.current) window.clearTimeout(timer.current);
    pending.current = null;
    product.current = p;
    params.current = from.params ?? null;
    past.current = [];
    future.current = [];
    cleanNext.current = !!from.file;
    setState({ product: p, params: from.params ?? null, result: null, status: 0, busy: true, error: null, canUndo: false, canRedo: false, file: from.file ?? null, savedJson: null });
    void send({ product: p as GenerateRequest["product"], preset: from.preset, params: from.params, ...(from.version ? { version: from.version } : {}) });
  }, [send]);

  /** The design was saved to `file`: what it is now is what "saved" means. */
  const markSaved = useCallback((file: DesignFile) => {
    setState((s) => ({ ...s, file, savedJson: JSON.stringify(params.current) }));
  }, []);

  /** The settings as they are now, including typing not yet sent. */
  const current = useCallback(() => ({ product: product.current, params: params.current }), []);

  /** An edit: shown at once, sent after a pause in typing (or at once for clicks). */
  const change = useCallback((key: string, value: unknown, immediate: boolean) => {
    if (!product.current || !params.current) return;
    if (pending.current && pending.current.key !== key) flush();
    params.current = setPath(params.current, key, value);
    setState((s) => ({ ...s, params: params.current }));
    pending.current = { key, value };
    if (timer.current) window.clearTimeout(timer.current);
    if (immediate) flush();
    else timer.current = window.setTimeout(flush, TYPE_DELAY);
  }, [flush]);

  /** Several settings at once (the 3D scale gizmo), sent at once as one edit. */
  const changeMany = useCallback((values: Params) => {
    const keys = Object.keys(values);
    if (!product.current || !params.current || !keys.length) return;
    if (pending.current && !keys.includes(pending.current.key)) flush();
    for (const k of keys) params.current = setPath(params.current, k, values[k]);
    setState((s) => ({ ...s, params: params.current }));
    const last = keys[keys.length - 1];
    pending.current = { key: last, value: values[last] };
    flush();
  }, [flush]);

  /** Settings no field edits (a picked picture): sent as the design's settings, one undo step. */
  const setValues = useCallback((values: Params) => {
    if (!product.current || !params.current || !Object.keys(values).length) return;
    flush();
    for (const k of Object.keys(values)) params.current = setPath(params.current, k, values[k]);
    setState((s) => ({ ...s, params: params.current }));
    void send({ product: product.current as GenerateRequest["product"], params: params.current });
  }, [flush, send]);

  const request = useCallback((extra: Partial<GenerateRequest>, record = true) => {
    if (!product.current) return;
    flush();
    void send({ product: product.current as GenerateRequest["product"], params: params.current ?? undefined, ...extra }, record);
  }, [flush, send]);

  const fix = useCallback((code: string, id: string) => request({ fix: { code, id } }), [request]);
  const autofix = useCallback(() => request({ autofix: true }), [request]);
  /** The whole design scaled by `s` (the 3D scale gizmo), on the server as one edit. */
  const scaleBy = useCallback((s: number) => request({ scale: s }), [request]);
  const refresh = useCallback(() => request({}, false), [request]);
  /** A new random design on the server (one undo step); `locked` settings stay. */
  const randomise = useCallback((locked: string[]) => request({ randomise: { locked } }), [request]);

  const setWant3d = useCallback((on: boolean) => {
    want3d.current = on;
    if (on && !hasModel.current && product.current && params.current && !timer.current) request({}, false);
  }, [request]);

  const travel = useCallback((dir: -1 | 1) => {
    if (!product.current) return;
    // Typing not sent yet: Undo takes it back (it never reached the history); Redo sends it first.
    if (pending.current) {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      if (dir > 0) { flush(); return; }
      pending.current = null;
      params.current = past.current[past.current.length - 1] ?? params.current;
      setState((s) => ({ ...s, params: params.current, ...flags() }));
      void send({ product: product.current as GenerateRequest["product"], params: params.current ?? undefined }, false);
      return;
    }
    if (dir < 0 && past.current.length > 1) {
      future.current = [past.current[past.current.length - 1], ...future.current];
      past.current = past.current.slice(0, -1);
    } else if (dir > 0 && future.current.length) {
      past.current = [...past.current, future.current[0]];
      future.current = future.current.slice(1);
    } else return;
    params.current = past.current[past.current.length - 1];
    setState((s) => ({ ...s, params: params.current, ...flags() }));
    void send({ product: product.current as GenerateRequest["product"], params: params.current }, false);
  }, [send, flush]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
  }, []);

  return { state, open, markSaved, current, change, changeMany, setValues, scaleBy, flush, fix, autofix, refresh, randomise, setWant3d, undo: () => travel(-1), redo: () => travel(1) };
}
