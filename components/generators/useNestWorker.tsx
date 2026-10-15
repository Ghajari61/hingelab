"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { putNest, skipNest, withNestDeferral, type NestJob } from "@/lib/nest/deferred";
import { nestOutlines, type OutlineNest, type OutlinePart, type OutlineSheetSpec } from "@/lib/nest/outline";

export type NestRequest = { id: number; parts: OutlinePart[]; spec: OutlineSheetSpec };
export type NestResponse = { id: number; progress: number } | { id: number; res: OutlineNest; ms: number } | { id: number; error: string };

/** Runs the nests one arrange asked for in a worker, one after another; a new set replaces the old. */
class NestRunner {
  private w: Worker | null = null;
  private jobs: NestJob[] = [];
  private at = 0;
  private id = 0;
  constructor(private onProgress: (p: number | null) => void, private onDone: () => void) {}

  start(jobs: NestJob[]) {
    const keys = jobs.map((j) => j.key).join(",");
    if (this.jobs.length && keys === this.jobs.map((j) => j.key).join(",")) return;
    this.stop();
    this.jobs = jobs;
    this.at = 0;
    if (!jobs.length) { this.onProgress(null); return; }
    this.onProgress(0);
    if (typeof Worker === "undefined") {
      for (const j of jobs) { const t0 = performance.now(); putNest(j, nestOutlines(j.parts, j.spec), performance.now() - t0); }
      this.jobs = [];
      this.onProgress(null);
      this.onDone();
      return;
    }
    this.post();
  }

  cancel() {
    for (const j of this.jobs.slice(this.at)) skipNest(j.key);
    this.stop();
    this.onProgress(null);
  }

  /** Stops the worker and forgets the jobs (they are asked for again on the next arrange). */
  stop() {
    this.w?.terminate();
    this.w = null;
    this.jobs = [];
  }

  private worker(): Worker {
    if (this.w) return this.w;
    const w = new Worker(new URL("./nest.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<NestResponse>) => this.message(e.data);
    w.onerror = () => this.cancel();
    return (this.w = w);
  }

  private post() {
    const j = this.jobs[this.at];
    const msg: NestRequest = { id: ++this.id, parts: j.parts, spec: j.spec };
    this.worker().postMessage(msg);
  }

  private message(m: NestResponse) {
    if (m.id !== this.id || !this.jobs.length) return;
    const n = this.jobs.length;
    if ("progress" in m) { this.onProgress((this.at + m.progress) / n); return; }
    const job = this.jobs[this.at];
    if ("res" in m) putNest(job, m.res, m.ms);
    else skipNest(job.key);
    if (++this.at < n) { this.onProgress(this.at / n); this.post(); return; }
    this.jobs = [];
    this.onProgress(null);
    this.onDone();
  }
}

/**
 * Outline nesting in a worker for an editor: wrap the arrange in `arrange`, call `flush` after it
 * (an effect), and add `tick` to the arrange's dependencies so it runs again with the results.
 * `progress` is null when nothing is nesting.
 */
export function useNestWorker() {
  const [progress, setProgress] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [runner] = useState(() => new NestRunner(setProgress, () => setTick((t) => t + 1)));
  const asked = useRef<NestJob[]>([]);
  useEffect(() => () => runner.stop(), [runner]);
  const arrange = useCallback(<T,>(run: () => T): T => {
    const jobs: NestJob[] = [];
    const out = withNestDeferral((j) => { if (!jobs.some((q) => q.key === j.key)) jobs.push(j); }, run);
    asked.current = jobs;
    return out;
  }, []);
  const flush = useCallback(() => runner.start(asked.current), [runner]);
  const cancel = useCallback(() => runner.cancel(), [runner]);
  return { progress, tick, arrange, flush, cancel };
}

/** "Nesting parts" with a progress bar and Cancel, over the canvas. */
export function NestChip({ progress, onCancel }: { progress: number | null; onCancel: () => void }) {
  if (progress == null) return null;
  return (
    <div className="stage-chip nest-chip">
      <span role="status">Nesting parts by shape…</span>
      <progress max={1} value={progress} aria-label="Nesting progress" />
      <button type="button" onClick={onCancel} title="Stop nesting and keep the parts laid out by their boxes">Cancel</button>
    </div>
  );
}
