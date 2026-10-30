"use client";

import { useCallback, useRef, useState } from "react";

/** Undo/redo over JSON snapshots of a parameter object. Depth is capped at 100. */
export function useHistory<T>(initial: T) {
  const [params, setParamsState] = useState(initial);
  const [rev, setRev] = useState(0);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastSnap = useRef(JSON.stringify(initial));
  const paramsRef = useRef(params);
  /** A change made without an undo step since the last one (typing, a drag in progress). */
  const dirty = useRef(false);
  paramsRef.current = params;

  const commit = useCallback((next?: T) => {
    const snap = JSON.stringify(next ?? paramsRef.current);
    dirty.current = false;
    if (snap === lastSnap.current) return;
    undoStack.current.push(lastSnap.current);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    lastSnap.current = snap;
    setRev((n) => n + 1);
  }, []);

  const replace = useCallback((next: T, history: boolean) => {
    paramsRef.current = next;
    setParamsState(next);
    if (history) commit(next);
    else dirty.current = true;
  }, [commit]);

  const undo = useCallback(() => {
    const now = JSON.stringify(paramsRef.current);
    // a change not yet recorded (text typed but not left, a drag in progress) is undone first
    if (dirty.current && now !== lastSnap.current) {
      dirty.current = false;
      redoStack.current.push(now);
      const parsed = JSON.parse(lastSnap.current) as T;
      paramsRef.current = parsed;
      setParamsState(parsed);
      setRev((n) => n + 1);
      return true;
    }
    dirty.current = false;
    if (!undoStack.current.length) return false;
    redoStack.current.push(now);
    const prev = undoStack.current.pop() as string;
    lastSnap.current = prev;
    const parsed = JSON.parse(prev) as T;
    paramsRef.current = parsed;
    setParamsState(parsed);
    setRev((n) => n + 1);
    return true;
  }, []);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return false;
    dirty.current = false;
    undoStack.current.push(JSON.stringify(paramsRef.current));
    const next = redoStack.current.pop() as string;
    lastSnap.current = next;
    const parsed = JSON.parse(next) as T;
    paramsRef.current = parsed;
    setParamsState(parsed);
    setRev((n) => n + 1);
    return true;
  }, []);

  return {
    params,
    replace,
    commit,
    undo,
    redo,
    canUndo: undoStack.current.length > 0 || dirty.current,
    canRedo: redoStack.current.length > 0,
    rev,
  };
}
