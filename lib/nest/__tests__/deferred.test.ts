import { describe, expect, it } from "vitest";
import type { Contour } from "@/lib/letters/types";
import { outlinePacker } from "@/lib/fit/outlinePack";
import { nestOrDefer, putNest, skipNest, withNestDeferral, type NestJob } from "../deferred";
import { nestOutlines, type OutlinePart } from "../outline";

const ring = (r: number, n: number, dx = 0): Contour => Array.from({ length: n }, (_, i) => [dx + r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
const many = (count: number, r: number): OutlinePart[] =>
  Array.from({ length: count }, (_, i) => ({ id: String(i).padStart(4, "0"), outline: [ring(r + (i % 5), 400), ring(r / 2, 200)], angles: [0, 90, 180, 270] }));
const spec = { w: 600, h: 400, margin: 5, gap: 2 };

describe("deferred outline nesting", () => {
  it("hands a slow nest to the queue, then serves the stored result", () => {
    const parts = many(60, 12);
    const jobs: NestJob[] = [];
    expect(withNestDeferral((j) => jobs.push(j), () => nestOrDefer(parts, spec))).toBeNull();
    expect(jobs).toHaveLength(1);
    const res = nestOutlines(jobs[0].parts, jobs[0].spec);
    putNest(jobs[0], res, 50);
    const again: NestJob[] = [];
    expect(withNestDeferral((j) => again.push(j), () => nestOrDefer(parts, spec))).toEqual(res);
    expect(again).toEqual([]);
    // Outside an editor the stored result is used as well, and equals nesting in place.
    expect(nestOrDefer(parts, spec)).toEqual(nestOutlines(parts, spec));
  });

  it("computes in place without a queue, and a cancelled nest stays with the fallback", () => {
    const parts = many(50, 9);
    const direct = nestOutlines(parts, spec);
    const jobs: NestJob[] = [];
    withNestDeferral((j) => jobs.push(j), () => nestOrDefer(parts, spec));
    if (jobs.length) {
      skipNest(jobs[0].key);
      const later: NestJob[] = [];
      expect(withNestDeferral((j) => later.push(j), () => nestOrDefer(parts, spec))).toBeNull();
      expect(later).toEqual([]);
    }
    expect(nestOrDefer(parts, spec)).toEqual(direct);
  });

  it("a changed outline is a new nest", () => {
    const a = many(3, 10), b = many(3, 10);
    b[1] = { ...b[1], outline: [ring(10.5, 400), ring(5, 200)] };
    expect(nestOrDefer(a, spec)).toEqual(nestOutlines(a, spec));
    expect(nestOrDefer(b, spec)).toEqual(nestOutlines(b, spec));
  });

  it("reports progress as parts are prepared and placed", () => {
    const seen: number[] = [];
    nestOutlines(many(4, 10), spec, (d, n) => seen.push(d / n));
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((k) => k / 8));
  });

  it("the packer falls back to its stand-in while the nest is pending", () => {
    const parts = many(70, 11).map((p) => ({ outline: p.outline }));
    const stand = { sheets: [{ w: 1, h: 1, oversize: false, items: [] }], tooBig: [] };
    const pack = outlinePacker<{ outline: Contour[] }>(() => [0, 90, 180, 270], () => stand);
    const jobs: NestJob[] = [];
    const got = withNestDeferral((j) => jobs.push(j), () => pack(parts, { w: 600, h: 400, margin: 5, gap: 3 }));
    if (jobs.length) expect(got).toBe(stand);
    else expect(got.sheets[0].items.length).toBeGreaterThan(0);
  });
});
