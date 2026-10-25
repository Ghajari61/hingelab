import { describe, expect, it } from "vitest";
import { applyCalibration, cleanCalibration, cleanMaterial, materialInfo, type UserMaterial } from "../library";
import { cleanMachine, hitsKeepOut } from "../machines";
import { genWithMaterial } from "../apply";
import { ALL_GENERATORS } from "@/lib/generators/all";

const base: UserMaterial = { id: "my-abc", name: "Birch 3", T: 3.1, kx: 0.16, ky: 0.18, minFeature: 1.5, like: "custom", laser: {} };

describe("material profiles", () => {
  it("old saves (no profile fields) load unchanged", () => {
    expect(cleanMaterial(base)).toEqual(base);
  });

  it("keeps valid profile fields and drops bad ones", () => {
    const m = cleanMaterial({ ...base, grain: "x", rotate: "half", spacing: 4, clearance: 0.1, bridge: 2, margin: 6 })!;
    expect(m).toMatchObject({ grain: "x", rotate: "half", spacing: 4, clearance: 0.1, bridge: 2, margin: 6 });
    const bad = cleanMaterial({ ...base, grain: "diagonal", rotate: "quarter", spacing: -1, clearance: 9, bridge: "2" })!;
    for (const k of ["grain", "rotate", "spacing", "clearance", "bridge"]) expect(bad).not.toHaveProperty(k);
  });

  it("a calibration needs a date; values outside their ranges are dropped", () => {
    expect(cleanCalibration({ kx: 0.2 })).toBeUndefined();
    expect(cleanCalibration({ date: "2026-10-20", kx: 9, clearance: 0.05, notes: "<b>ok</b>" })).toEqual({ date: "2026-10-20", clearance: 0.05, notes: " b ok /b " });
  });

  it("applying a calibration sets the measured values and marks the material tested", () => {
    expect(materialInfo(base.id, [base])!.tested).toBe(false);
    const m = applyCalibration(base, { date: "2026-10-20", kx: 0.2, clearance: 0.05 });
    expect(m).toMatchObject({ kx: 0.2, ky: 0.18, clearance: 0.05, calibration: { date: "2026-10-20" } });
    expect(materialInfo(m.id, [m])!.tested).toBe(true);
    expect(applyCalibration(base, { date: "yesterday" } as never)).toBe(base);
  });

  it("built-in materials are never reported as tested", () => {
    expect(materialInfo("birch18", [])!.tested).toBe(false);
  });

  it("a grain limits nesting to half turns unless the user says otherwise", () => {
    expect(materialInfo(base.id, [{ ...base, grain: "y" }])!.rotate).toBe("half");
    expect(materialInfo(base.id, [{ ...base, grain: "y", rotate: "none" }])!.rotate).toBe("none");
    expect(materialInfo(base.id, [base])!.rotate).toBeUndefined();
  });

  it("the design takes the material's turns and spacing; a built-in clears them", () => {
    const def = ALL_GENERATORS.find((g) => g.id === "sign")!;
    const p = def.merge({});
    const mine = genWithMaterial(p, base.id, materialInfo(base.id, [{ ...base, grain: "x", spacing: 7 }]));
    expect(mine.sheet?.rotate).toBe("half");
    expect(mine.gap).toBe(7);
    expect(genWithMaterial(mine, "birch18", materialInfo("birch18", [])).sheet?.rotate).toBeUndefined();
    expect(genWithMaterial(mine, "gone", null).sheet?.rotate).toBeUndefined();
  });
});

describe("machines", () => {
  it("cleans a machine and clips keep-outs to the bed", () => {
    const m = cleanMachine({ id: "mc-x1", name: "Shop laser", bedW: 600, bedH: 400, keepOut: [{ x: 550, y: 0, w: 100, h: 30, name: "clamp" }, { x: -5, y: 0, w: 1, h: 1 }], laser: "diode" })!;
    expect(m).toEqual({ id: "mc-x1", name: "Shop laser", bedW: 600, bedH: 400, keepOut: [{ x: 550, y: 0, w: 50, h: 30, name: "clamp" }], laser: "diode" });
    expect(cleanMachine({ name: "", bedW: 600, bedH: 400 })).toBeNull();
    expect(cleanMachine({ name: "Tiny", bedW: 5, bedH: 400 })).toBeNull();
  });

  it("finds a box that overlaps a keep-out", () => {
    const m = { keepOut: [{ x: 550, y: 0, w: 50, h: 30 }] };
    expect(hitsKeepOut(m, { x0: 500, y0: 10, x1: 560, y1: 20 })).not.toBeNull();
    expect(hitsKeepOut(m, { x0: 500, y0: 30, x1: 560, y1: 40 })).toBeNull();
  });
});
