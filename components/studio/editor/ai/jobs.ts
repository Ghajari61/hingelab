"use client";

import { createStore } from "zustand/vanilla";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** What a job was asked to do: enough to run it again (with a changed prompt). */
export interface JobInput {
  tool: string;
  label: string;
  prompt?: string;
  style?: string;
  /** Tool settings (plain data). */
  options?: Record<string, unknown>;
  /** The image the job started from. */
  sourceId?: string;
}

export interface Job {
  id: string;
  docId: string;
  input: JobInput;
  /** Runs on the AI provider and spends credits. */
  cloud: boolean;
  status: JobStatus;
  stage?: string;
  /** 0–1, or undefined while the length is unknown. */
  progress?: number;
  created: number;
  finished?: number;
  error?: string;
  credits?: number;
  /** Objects the job added to the document. */
  resultIds: string[];
}

export interface JobContext {
  signal: AbortSignal;
  stage: (text: string, progress?: number) => void;
}

/** What a job hands back: the new objects and the credits it spent. */
export interface JobOutput { ids: string[]; credits?: number; note?: string }

type Runner = (ctx: JobContext) => Promise<JobOutput>;

interface JobsState {
  jobs: Job[];
}

/** A set of four variations runs at once. */
const MAX_RUNNING = 4;
const MAX_HISTORY = 40;
const historyKey = (docId: string) => `hingelab-ai-history:${docId}`;

export const jobsStore = createStore<JobsState>(() => ({ jobs: [] }));

const runners = new Map<string, Runner>();
const controllers = new Map<string, AbortController>();
const loaded = new Set<string>();

const patch = (id: string, p: Partial<Job>) =>
  jobsStore.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)) }));

/** History keeps settings but not pictures (Redraw and Expand carry theirs); those jobs re-open their dialog instead. */
const slim = (j: Job): Job => {
  const o = j.input.options;
  if (!o) return j;
  return { ...j, input: { ...j.input, options: Object.fromEntries(Object.entries(o).filter(([, v]) => !(typeof v === "string" && v.length > 2000))) } };
};

function save(docId: string) {
  const done = jobsStore.getState().jobs.filter((j) => j.docId === docId && j.status !== "queued" && j.status !== "running").slice(0, MAX_HISTORY).map(slim);
  try { localStorage.setItem(historyKey(docId), JSON.stringify(done)); } catch { /* storage full or off */ }
}

/** Loads this project's job history once per tab. */
export function loadHistory(docId: string) {
  if (loaded.has(docId)) return;
  loaded.add(docId);
  try {
    const raw = JSON.parse(localStorage.getItem(historyKey(docId)) ?? "[]") as Job[];
    const old = Array.isArray(raw) ? raw.filter((j) => j && typeof j.id === "string" && j.input && typeof j.input.tool === "string") : [];
    jobsStore.setState((s) => ({ jobs: [...s.jobs, ...old.filter((o) => !s.jobs.some((j) => j.id === o.id))] }));
  } catch { /* unreadable history */ }
}

export function clearHistory(docId: string) {
  jobsStore.setState((s) => ({ jobs: s.jobs.filter((j) => j.docId !== docId || j.status === "queued" || j.status === "running") }));
  save(docId);
}

function pump() {
  const { jobs } = jobsStore.getState();
  let running = jobs.filter((j) => j.status === "running").length;
  for (const j of [...jobs].reverse()) {
    if (running >= MAX_RUNNING) break;
    if (j.status !== "queued") continue;
    running++;
    void start(j);
  }
}

async function start(job: Job) {
  const run = runners.get(job.id);
  if (!run) return;
  const ctl = new AbortController();
  controllers.set(job.id, ctl);
  patch(job.id, { status: "running", stage: "Starting…" });
  try {
    const out = await run({ signal: ctl.signal, stage: (stage, progress) => { if (!ctl.signal.aborted) patch(job.id, { stage, progress }); } });
    if (ctl.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    patch(job.id, { status: "done", stage: out.note, progress: 1, finished: Date.now(), resultIds: out.ids, credits: out.credits });
  } catch (e) {
    const cancelled = ctl.signal.aborted || (e instanceof DOMException && e.name === "AbortError");
    patch(job.id, { status: cancelled ? "cancelled" : "failed", stage: undefined, finished: Date.now(), error: cancelled ? undefined : e instanceof Error ? e.message : String(e) });
  } finally {
    runners.delete(job.id);
    controllers.delete(job.id);
    save(job.docId);
    pump();
  }
}

/** Queues a job; at most four run at once. Returns its id. */
export function enqueue(docId: string, input: JobInput, cloud: boolean, run: Runner): string {
  const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  runners.set(id, run);
  jobsStore.setState((s) => ({ jobs: [{ id, docId, input, cloud, status: "queued", created: Date.now(), resultIds: [] }, ...s.jobs] }));
  pump();
  return id;
}

export function cancel(id: string) {
  const ctl = controllers.get(id);
  if (ctl) { ctl.abort(); return; }
  const j = jobsStore.getState().jobs.find((x) => x.id === id);
  if (j?.status === "queued") {
    runners.delete(id);
    patch(id, { status: "cancelled", finished: Date.now() });
    save(j.docId);
  }
}

export function forget(id: string) {
  const j = jobsStore.getState().jobs.find((x) => x.id === id);
  if (!j || j.status === "running" || j.status === "queued") return;
  jobsStore.setState((s) => ({ jobs: s.jobs.filter((x) => x.id !== id) }));
  save(j.docId);
}

/** Whether the full AI Studio workspace covers the canvas. */
export const workspaceStore = createStore<{ open: boolean }>(() => ({ open: false }));
export const openWorkspace = (open = true) => workspaceStore.setState({ open });

// Credits used today on this device (the server keeps the real count).
const creditsKey = () => `hingelab-ai-credits:${new Date().toISOString().slice(0, 10)}`;
export const creditsStore = createStore<{ used: number }>(() => ({ used: 0 }));

export function loadCredits() {
  try { creditsStore.setState({ used: Number(localStorage.getItem(creditsKey()) ?? 0) || 0 }); } catch { /* storage off */ }
}

export function spent(n: number) {
  const used = creditsStore.getState().used + n;
  creditsStore.setState({ used });
  try { localStorage.setItem(creditsKey(), String(used)); } catch { /* storage off */ }
}
