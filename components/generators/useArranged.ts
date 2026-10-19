"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { arrangeGenerator, type GenArranged } from "@/lib/generators/output";
import type { AnyGenerator, BuildContext, GenBase } from "@/lib/generators/types";
import type { GeneratorId } from "@/lib/generators/ids";
import type { NestJob } from "@/lib/nest/deferred";
import type { OutlineNest } from "@/lib/nest/outline";
import type { BuildReply, BuildRequest } from "./buildProtocol";

/** A design that took longer than this to build moves to the build worker. */
export const SLOW_MS = 30;
/** Slow designs rebuild this long after the last change (the last result shows meanwhile). */
export const SETTLE_MS = 150;

type Nest = { arrange: <T>(run: () => T) => T; tick: number; queue: (jobs: NestJob[]) => void };

let shared: Worker | null = null;
const listeners = new Set<(m: BuildReply) => void>();
function buildWorker(): Worker | null {
  if (shared || typeof Worker === "undefined") return shared;
  try {
    shared = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" });
    shared.onmessage = (e: MessageEvent<BuildReply>) => listeners.forEach((l) => l(e.data));
    shared.onerror = () => { shared?.terminate(); shared = null; listeners.forEach((l) => l({ type: "error", id: -1, message: "worker failed" })); };
  } catch {
    shared = null;
  }
  return shared;
}

/** Nests the page's nest worker made, passed on so the build worker can use them too. */
export function shareNests(results: { job: NestJob; res: OutlineNest; ms: number }[]) {
  if (!shared || !results.length) return;
  const m: BuildRequest = { type: "nests", results };
  shared.postMessage(m);
}

let nextId = 0;

/**
 * The arranged design for the editor. Quick designs build on the page as they always did; once a
 * build takes longer than SLOW_MS, changes rebuild in the build worker SETTLE_MS after the last
 * one, the last result stays on screen, and replies to older requests are dropped. A design the
 * worker cannot build (or a browser without workers) stays on the page.
 */
export function useArranged<P extends GenBase>(def: AnyGenerator, params: P, ctx: BuildContext, nest: Nest): GenArranged<P> {
  const slow = useRef(false);
  const pageOnly = useRef(false);
  const last = useRef<GenArranged<P> | null>(null);
  const [fromWorker, setFromWorker] = useState<{ params: P; arranged: GenArranged<P> } | null>(null);
  const pending = useRef(0);
  /** Bumped when the worker gives up, so the next render builds on the page. */
  const [mode, setMode] = useState(0);

  const onPage = useMemo(() => {
    if (slow.current && !pageOnly.current && last.current) return null;
    const t0 = performance.now();
    const a = nest.arrange(() => arrangeGenerator(def as never, params, ctx)) as GenArranged<P>;
    if (performance.now() - t0 > SLOW_MS && !pageOnly.current) slow.current = true;
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nest.tick: a nest finished, build again with it
  }, [def, params, ctx, nest.arrange, nest.tick, mode]);

  const fontKey = (def.fonts?.(params as never) ?? []).join("|");
  useEffect(() => {
    if (onPage) return;
    const w = buildWorker();
    if (!w) { pageOnly.current = true; setMode((n) => n + 1); return; }
    const id = ++nextId;
    pending.current = id;
    const listen = (m: BuildReply) => {
      if (m.id !== pending.current && m.id !== -1) return;
      listeners.delete(listen);
      if (m.type === "error") { pageOnly.current = true; slow.current = false; setMode((n) => n + 1); return; }
      slow.current = m.ms > SLOW_MS;
      nest.queue(m.jobs);
      setFromWorker({ params, arranged: m.arranged as GenArranged<P> });
    };
    const t = window.setTimeout(() => {
      listeners.add(listen);
      const req: BuildRequest = { type: "arrange", id, gen: def.id as GeneratorId, params, fonts: fontKey ? fontKey.split("|") : [] };
      w.postMessage(req);
    }, SETTLE_MS);
    return () => { window.clearTimeout(t); listeners.delete(listen); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nest.tick: rebuild with the nests that arrived
  }, [onPage, def, params, fontKey, nest.tick]);

  const result = onPage ?? fromWorker?.arranged ?? last.current!;
  last.current = result;
  return result;
}
