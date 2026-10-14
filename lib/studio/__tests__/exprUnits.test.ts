import { describe, expect, it } from "vitest";
import { evalNumberExpr } from "../expr";

const mm = { current: 100, unit: "mm" as const };
const inch = { current: 2, unit: "in" as const };

describe("typed lengths with units and fractions", () => {
  it("reads the brief's examples in a millimetre field", () => {
    expect(evalNumberExpr("3mm", mm)).toBeCloseTo(3, 9);
    expect(evalNumberExpr("1/8in", mm)).toBeCloseTo(3.175, 9);
    expect(evalNumberExpr("25.4*2", mm)).toBeCloseTo(50.8, 9);
    expect(evalNumberExpr("2 cm", mm)).toBeCloseTo(20, 9);
  });

  it("reads them in an inch field too", () => {
    expect(evalNumberExpr("3mm", inch)).toBeCloseTo(3 / 25.4, 9);
    expect(evalNumberExpr("1/8in", inch)).toBeCloseTo(0.125, 9);
    expect(evalNumberExpr("1/8", inch)).toBeCloseTo(0.125, 9);
    expect(evalNumberExpr("3/4\"", inch)).toBeCloseTo(0.75, 9);
  });

  it("a unit after a product or fraction covers all of it; inside a sum each number keeps its own", () => {
    expect(evalNumberExpr("2*3in", mm)).toBeCloseTo(152.4, 9);
    expect(evalNumberExpr("3/4in", mm)).toBeCloseTo(19.05, 9);
    expect(evalNumberExpr("(3)/(4)in", mm)).toBeCloseTo(19.05, 9);
    expect(evalNumberExpr("1in + 5mm", mm)).toBeCloseTo(30.4, 9);
    expect(evalNumberExpr("+=1/8in", mm)).toBeCloseTo(103.175, 9);
  });

  it("refuses what it cannot read", () => {
    for (const bad of ["1/0in", "in", "1//8in", "1/8 in in", "3 mm 2"]) expect(evalNumberExpr(bad, mm)).toBeNull();
  });
});
