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
  paramsRef.current = params;

  const commit = useCallback((next?: T) => {
    const snap = JSON.stringify(next ?? paramsRef.current);
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
  }, [commit]);

  const undo = useCallback(() => {
    if (!undoStack.current.length) return false;
    redoStack.current.push(JSON.stringify(paramsRef.current));
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
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    rev,
  };
}
