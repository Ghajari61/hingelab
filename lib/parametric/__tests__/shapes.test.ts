import { describe, expect, it } from "vitest";
import { FORMULA_DEFAULTS, LEAF_CLOCK, PARAMETRIC_DEFAULTS, mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { boundaryPolygon } from "../methods/curveNormal";
import { compileFormula } from "../source/formula";
import {
  SHAPES, SHAPE_SYMBOLS, SHAPE_TARGETS, applyShape, contextOf, fieldExpression, pickShape, recognise, shapeExpression, shapeIconPath, syncShapes,
  type ShapeContext, type ShapeSpec, type ShapeTargetId,
} from "../shapes";
import { manifold } from "./helpers";

const TARGETS = Object.keys(SHAPE_TARGETS) as ShapeTargetId[];
const ctxFor = (t: ShapeTargetId): ShapeContext => (t in FORMULA_DEFAULTS ? contextOf(FORMULA_DEFAULTS[t as keyof typeof FORMULA_DEFAULTS]) : {});

/** Sample points over each field's own variables. */
function samples(t: ShapeTargetId, ctx: ShapeContext): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    if (t === "finLength" || t === "twist") out.push({ t: Math.min(f, 0.999) });
    else if (t === "finHeight") out.push({ t: 0.3, s: 80 * f, L: 80 });
    else if (t === "outline") out.push({ phi: 2 * Math.PI * f });
    else if (t === "revolution") out.push({ h: (ctx.height ?? 100) * f });
    else if (t === "radial-profile") for (const th of [0, 1, 3, 6]) out.push({ theta: th, s: 100 * f });
    else for (const y of [-75, 0, 75]) out.push({ x: -100 + 200 * f, y });
  }
  return out;
}

const variants = (t: ShapeTargetId): ShapeSpec[] => SHAPES.flatMap(({ id }) => {
  const s = pickShape(t, id, null);
  const dirs = SHAPE_TARGETS[t].dirs?.map((d) => d.v) ?? [undefined];
  return dirs.flatMap((dir) => [
    { ...s, dir },
    { ...s, dir, waves: 3, phase: 0.3, ease: 2 },
    { ...s, dir, amp: -Math.abs(s.amp), waves: 5, phase: 0.75, ease: 0.4 },
  ]);
});

describe("shape buttons write formulas", () => {
  it("every shape on every field compiles and gives a number everywhere (outlines stay positive)", () => {
    let n = 0;
    for (const t of TARGETS) {
      const ctx = ctxFor(t);
      for (const s of variants(t)) {
        const expr = shapeExpression(t, s, ctx);
        const f = compileFormula(expr, SHAPE_SYMBOLS[t]);
        for (const v of samples(t, ctx)) {
          const y = f(v);
          expect(Number.isFinite(y), `${t} ${s.shape}: ${expr} at ${JSON.stringify(v)}`).toBe(true);
          if (t === "outline") expect(y, `${s.shape}: ${expr}`).toBeGreaterThan(0);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it("values: base + amplitude × shape", () => {
    const at = (t: ShapeTargetId, s: ShapeSpec, v: Record<string, number>, ctx: ShapeContext = {}) => compileFormula(shapeExpression(t, s, ctx), SHAPE_SYMBOLS[t])(v);
    const base = { base: 60, amp: 40, waves: 1, phase: 0, ease: 1 };
    expect(shapeExpression("finLength", { ...base, shape: "constant" })).toBe("60");
    expect(at("finLength", { ...base, shape: "sine" }, { t: 0.25 })).toBeCloseTo(100, 9);
    expect(at("finLength", { ...base, shape: "sine", phase: 0.25 }, { t: 0 })).toBeCloseTo(100, 9);
    expect(at("finLength", { ...base, shape: "ramp" }, { t: 0.5 })).toBeCloseTo(80, 9);
    expect(at("finLength", { ...base, shape: "arch" }, { t: 0.5 })).toBeCloseTo(100, 9);
    expect(at("finLength", { ...base, shape: "bulge" }, { t: 0.5 })).toBeCloseTo(100, 9);
    expect(at("finLength", { ...base, shape: "ellipse" }, { t: 0.5 })).toBeCloseTo(100, 9);
    expect(at("finLength", { ...base, shape: "steps", waves: 4 }, { t: 0.1 })).toBeCloseTo(60, 9);
    expect(at("finLength", { ...base, shape: "steps", waves: 4 }, { t: 0.99 })).toBeCloseTo(100, 9);
    expect(at("finHeight", { ...base, shape: "arch", base: 5, amp: 15 }, { s: 40, L: 80, t: 0 })).toBeCloseTo(20, 9);
    expect(at("revolution", { ...base, shape: "ramp" }, { h: 120 }, { height: 240 })).toBeCloseTo(80, 9);
    // Outline: ellipse is R across and R·(1 − 0.9a) up; star points reach R.
    const ell = { shape: "ellipse" as const, base: 150, amp: 0.5, waves: 1, phase: 0, ease: 1 };
    expect(at("outline", ell, { phi: 0 })).toBeCloseTo(150, 9);
    expect(at("outline", ell, { phi: Math.PI / 2 })).toBeCloseTo(150 * 0.55, 9);
    expect(at("outline", { ...ell, shape: "star", waves: 5 }, { phi: 0 })).toBeCloseTo(150, 9);
    expect(at("outline", { ...ell, shape: "star", waves: 5 }, { phi: Math.PI / 5 })).toBeCloseTo(75, 9);
  });

  it("recognises the default formulas and hand-typed ones", () => {
    const cn = PARAMETRIC_DEFAULTS.curveNormal;
    expect(recognise("finLength", cn.finLength, undefined)?.shape).toBe("constant");
    expect(recognise("finHeight", cn.finHeight, undefined)).toMatchObject({ shape: "arch", base: 5, amp: 15 });
    expect(recognise("twist", cn.twist, undefined)).toMatchObject({ shape: "constant", base: 0 });
    expect(recognise("twist", LEAF_CLOCK.twist, undefined)).toMatchObject({ shape: "sine", amp: 12 });
    expect(recognise("finHeight", LEAF_CLOCK.finHeight, undefined)).toBeNull();
    const s: ShapeSpec = { shape: "star", base: 120, amp: 0.3, waves: 7, phase: 0.1, ease: 1.5 };
    expect(recognise("outline", shapeExpression("outline", s), s)).toBe(s);
    expect(recognise("outline", shapeExpression("outline", s) + " + 1", s)).toBeNull();
  });

  it("applyShape writes the formula and keeps the spec; a formula source follows its domain", () => {
    const p = mergeParametricParams({ method: "curveNormal" });
    applyShape(p, "outline", pickShape("outline", "heart", null));
    expect(p.curveNormal.outerBoundary.kind).toBe("formula");
    expect(recognise("outline", fieldExpression(p, "outline")!, p.shapes?.outline)?.shape).toBe("heart");

    const q = mergeParametricParams({ source: structuredClone(FORMULA_DEFAULTS.heightfield) });
    applyShape(q, "heightfield", pickShape("heightfield", "sine", null));
    const before = structuredClone(q);
    const next = structuredClone(q);
    if (next.source.kind === "formula") next.source.domain.x = [-150, 150];
    syncShapes(before, next);
    expect(fieldExpression(next, "heightfield")).not.toBe(fieldExpression(before, "heightfield"));
    expect(recognise("heightfield", fieldExpression(next, "heightfield")!, next.shapes?.heightfield, next.source.kind === "formula" ? contextOf(next.source) : {})?.shape).toBe("sine");

    // A typed formula is never rewritten.
    const typed = mergeParametricParams({ source: structuredClone(FORMULA_DEFAULTS.heightfield) });
    const typedNext = structuredClone(typed);
    if (typedNext.source.kind === "formula") typedNext.source.domain.x = [-150, 150];
    syncShapes(typed, typedNext);
    expect(fieldExpression(typedNext, "heightfield")).toBe(FORMULA_DEFAULTS.heightfield.expression);
  });

  it("icons are drawn for every shape, as a line and as an outline", () => {
    for (const { id } of SHAPES) for (const polar of [false, true]) {
      const d = shapeIconPath(id, polar);
      expect(d.startsWith("M")).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
  });

  it("a leaf clock drawn only with shape buttons builds, and every outline shape clips the fins", async () => {
    const wasm = await manifold();
    for (const shape of ["leaf", "ellipse", "heart", "star", "sine"] as const) {
      const p = mergeParametricParams({ method: "curveNormal" });
      p.curveNormal.count = 40;
      applyShape(p, "finLength", { ...pickShape("finLength", "constant", null), base: 220 });
      applyShape(p, "finHeight", pickShape("finHeight", "leaf", null));
      applyShape(p, "twist", pickShape("twist", "sine", null));
      applyShape(p, "outline", pickShape("outline", shape, null));
      const outline = boundaryPolygon(p.curveNormal.outerBoundary);
      expect(outline).not.toBeNull();
      const r = computeParametric(p, await loadSource(p), wasm);
      const fins = r.parts.filter((q) => q.kind === "fin");
      expect(fins.length, shape).toBeGreaterThan(10);
      expect(r.parts.some((q) => q.kind === "backboard"), shape).toBe(true);
    }
  });
});
