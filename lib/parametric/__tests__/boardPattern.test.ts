import { describe, expect, it } from "vitest";
import { pointInContour } from "@/lib/letters/polygon";
import { parametricRequestError } from "@/lib/billing/validate";
import { cleanBoardPattern } from "../backboard";
import { mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import type { ParametricParams, SliceResult } from "../types";
import { manifold } from "./helpers";

const base = (): ParametricParams => {
  const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 4 } });
  p.material.K = 0;
  p.quality.smoothing = 0;
  p.parallel.spacing = 10;
  p.parallel.backboardMargin = 40;
  return p;
};
const board = (r: SliceResult) => r.parts.find((q) => q.kind === "backboard")!;

describe("Parametric: a pattern on the backboard's margin", () => {
  it("cuts holes round the model, clear of the slots and the footprint; None leaves the board as it was", async () => {
    const wasm = await manifold();
    const plain = base(), withPat = base();
    withPat.parallel.boardPattern = { kind: "circles", cell: 10, bar: 2 };
    const a = computeParametric(plain, await loadSource(plain), wasm), b = computeParametric(withPat, await loadSource(withPat), wasm);
    const A = board(a), B = board(b);
    const extra = B.shape.holes.slice(A.shape.holes.length);
    expect(extra.length).toBeGreaterThan(10);
    expect(B.innerCuts).toEqual(A.innerCuts);
    for (const h of extra) for (const s of A.innerCuts) expect(h.some((q) => pointInContour(q, s))).toBe(false);
    // The sphere's footprint (radius 50 by default) stays solid.
    const R = Math.max(...A.innerCuts.flat().map(([x, y]) => Math.hypot(x, y)));
    for (const h of extra) for (const [x, y] of h) expect(Math.hypot(x, y)).toBeGreaterThan(R - 1);
    expect(computeParametric(plain, await loadSource(plain), wasm).parts.find((q) => q.kind === "backboard")!.shape).toEqual(A.shape);
  }, 60000);

  it("warns when nothing fits in a thin margin", async () => {
    const wasm = await manifold();
    const p = base();
    p.parallel.backboardMargin = 2;
    p.parallel.boardPattern = { kind: "lattice", cell: 30, bar: 3 };
    const r = computeParametric(p, await loadSource(p), wasm);
    expect(r.warnings.some((w) => w.code === "BOARD_PATTERN_EMPTY")).toBe(true);
  }, 60000);

  it("the server checks it", () => {
    const p = base();
    p.parallel.boardPattern = { kind: "stars", cell: 12, bar: 2 };
    expect(parametricRequestError(p)).toBeNull();
    p.parallel.boardPattern = { kind: "motif", cell: 12, bar: 2 } as never;
    expect(parametricRequestError(p)).not.toBeNull();
    p.parallel.boardPattern = { kind: "stars", cell: 1, bar: 2 };
    expect(parametricRequestError(p)).not.toBeNull();
    expect(cleanBoardPattern({ kind: "honeycomb" })).toEqual({ kind: "honeycomb", cell: 16, bar: 3 });
  });
});
