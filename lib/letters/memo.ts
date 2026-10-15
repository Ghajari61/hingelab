/**
 * A small cache for expensive pure shape operations. Editing the depth, lid, joints or labels of a
 * letter box rebuilds the model with the same letter outlines; the cache returns the earlier
 * result for exactly the same input (every coordinate bit and argument), so the output is identical.
 */
import type { Contour, Shape } from "./types";

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** A 64-bit FNV-style hash of numbers by their exact bits, as a string key. */
export function numbersKey(...lists: (number | ArrayLike<number>)[]): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const mix = (v: number) => {
    f64[0] = v;
    h1 = Math.imul(h1 ^ u32[0], 0x01000193) ^ u32[1];
    h2 = Math.imul(h2 ^ u32[1], 0x5bd1e995) ^ u32[0];
  };
  for (const l of lists) {
    if (typeof l === "number") mix(l);
    else { mix(l.length); for (let i = 0; i < l.length; i++) mix(l[i]); }
  }
  return (h1 >>> 0).toString(36) + "." + (h2 >>> 0).toString(36);
}

/** Every number that defines `shapes` and `args`, in order. */
export function shapesInput(shapes: Shape[], ...args: number[]): Float64Array {
  let n = args.length;
  for (const s of shapes) { n += 2; for (const c of [s.outer, ...s.holes]) n += 1 + 2 * c.length; }
  const out = new Float64Array(n);
  let i = 0;
  for (const s of shapes) {
    out[i++] = s.group ?? 0;
    out[i++] = s.holes.length;
    for (const c of [s.outer, ...s.holes]) { out[i++] = c.length; for (const [x, y] of c) { out[i++] = x; out[i++] = y; } }
  }
  for (const a of args) out[i++] = a;
  return out;
}

const sameInput = (a: Float64Array, b: Float64Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
};

/**
 * `compute(shapes)` for these shapes and arguments, from the cache when the same input was seen
 * (compared number by number, not only by hash). Shapes are copied in and out, so callers may
 * change the shape objects they get.
 */
export function memoShapes<R extends { shapes: Shape[] }>(cache: Lru<{ input: Float64Array; value: R }>, shapes: Shape[], args: number[], compute: () => R): R {
  const input = shapesInput(shapes, ...args);
  const key = numbersKey(input);
  const hit = cache.get(key);
  if (hit && sameInput(hit.input, input)) return { ...hit.value, shapes: copyShapes(hit.value.shapes) };
  const value = compute();
  cache.set(key, { input, value: { ...value, shapes: copyShapes(value.shapes) } });
  return value;
}

const copyContour = (c: Contour): Contour => c.slice();
export const copyShapes = (shapes: Shape[]): Shape[] => shapes.map((s) => ({ ...s, outer: copyContour(s.outer), holes: s.holes.map(copyContour), bbox: { ...s.bbox } }));

/** A least-recently-used map of at most `size` entries. */
export class Lru<V> {
  private m = new Map<string, V>();
  constructor(private size: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) { this.m.delete(k); this.m.set(k, v); }
    return v;
  }
  set(k: string, v: V) {
    this.m.delete(k);
    this.m.set(k, v);
    if (this.m.size > this.size) this.m.delete(this.m.keys().next().value!);
  }
}
