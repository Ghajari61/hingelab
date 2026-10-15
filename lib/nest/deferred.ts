/**
 * Outline nesting that an editor can move off the main thread. Inside `withNestDeferral`, a nest
 * that is not cached and looks slow is handed to the queue (a worker) and `nestOrDefer` returns
 * null, so the caller lays the parts out by their boxes until `putNest` stores the result. Outside
 * it (exports, checks, the server) nesting runs in place, as before.
 */
import { Lru, numbersKey } from "@/lib/letters/memo";
import { nestOutlines, type OutlineNest, type OutlinePart, type OutlineSheetSpec } from "./outline";

export interface NestJob { key: string; parts: OutlinePart[]; spec: OutlineSheetSpec }

/** A nest predicted to take less than this runs in place, ms. */
const SYNC_MS = 30;

let queue: ((job: NestJob) => void) | null = null;
const done = new Lru<{ input: Float64Array; ids: string; value: OutlineNest }>(64);
const skipped = new Set<string>();
/** Learned cost, ms per work unit (starts high, so the first large nest goes to the worker). */
let msPerUnit = 0.01;

function inputOf(parts: OutlinePart[], s: OutlineSheetSpec): Float64Array {
  let n = 6;
  for (const p of parts) { n += 2 + p.angles.length; for (const c of p.outline) n += 1 + 2 * c.length; }
  const out = new Float64Array(n);
  let i = 0;
  for (const v of [s.w, s.h, s.margin, s.gap, s.cell ?? NaN, parts.length]) out[i++] = v;
  for (const p of parts) {
    out[i++] = p.angles.length;
    for (const a of p.angles) out[i++] = a;
    out[i++] = p.outline.length;
    for (const c of p.outline) { out[i++] = c.length; for (const [x, y] of c) { out[i++] = x; out[i++] = y; } }
  }
  return out;
}

const same = (a: Float64Array, b: Float64Array) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** Rough work of a nest: outline points times the angles tried, plus the sheet grid. */
function units(parts: OutlinePart[], s: OutlineSheetSpec): number {
  let u = (s.w * s.h) / 100;
  for (const p of parts) u += Math.max(1, p.angles.length) * (100 + p.outline.reduce((a, c) => a + c.length, 0));
  return u;
}

/** Runs `run` with slow nests handed to `q` instead of computed. */
export function withNestDeferral<T>(q: (job: NestJob) => void, run: () => T): T {
  const before = queue;
  queue = q;
  try {
    return run();
  } finally {
    queue = before;
  }
}

/** The nest, from the cache or computed now; null when it was handed to the queue (or cancelled). */
export function nestOrDefer(parts: OutlinePart[], spec: OutlineSheetSpec): OutlineNest | null {
  const input = inputOf(parts, spec), ids = parts.map((p) => p.id).join("|");
  const key = numbersKey(input) + ":" + ids.length;
  const hit = done.get(key);
  if (hit && hit.ids === ids && same(hit.input, input)) return hit.value;
  if (queue) {
    if (skipped.has(key)) return null;
    if (units(parts, spec) * msPerUnit > SYNC_MS) { queue({ key, parts, spec }); return null; }
  }
  const t0 = performance.now();
  const value = nestOutlines(parts, spec);
  learn(parts, spec, performance.now() - t0);
  done.set(key, { input, ids, value });
  return value;
}

function learn(parts: OutlinePart[], spec: OutlineSheetSpec, ms: number) {
  const k = ms / units(parts, spec);
  if (Number.isFinite(k) && k > 0) msPerUnit = msPerUnit * 0.5 + k * 0.5;
}

/** Stores a nest the worker finished (`ms`: how long it took, to predict the next ones). */
export function putNest(job: NestJob, value: OutlineNest, ms: number) {
  learn(job.parts, job.spec, ms);
  done.set(job.key, { input: inputOf(job.parts, job.spec), ids: job.parts.map((p) => p.id).join("|"), value });
}

/** The user stopped this nest: the parts keep their box layout until the design changes. */
export function skipNest(key: string) {
  skipped.add(key);
  if (skipped.size > 256) skipped.delete(skipped.values().next().value!);
}
