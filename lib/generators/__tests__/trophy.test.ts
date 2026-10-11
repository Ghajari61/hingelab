import { describe, expect, it } from "vitest";
import { bboxOf } from "../geom";
import { arrangeGenerator } from "../output";
import { TROPHY } from "../trophy";
import type { TrophyOutput } from "../trophy/build";
import { EMBLEMS, mergeTrophy } from "../trophy/params";
import { CTX } from "./ctx";

const build = (raw: unknown) => TROPHY.build(mergeTrophy(raw), CTX) as TrophyOutput;
const issues = (raw: unknown) => { const p = mergeTrophy(raw); return TROPHY.check(p, TROPHY.build(p, CTX)); };

describe("trophy", () => {
  it("every preset builds with no errors or warnings", () => {
    for (const pr of TROPHY.presets) {
      const p = TROPHY.merge(pr.params);
      const out = TROPHY.build(p, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(TROPHY.check(p, out).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
    }
  });

  it("every emblem with a plate makes one figure piece that reaches the plate", () => {
    for (const kind of EMBLEMS.filter((k) => k !== "custom")) {
      const out = build({ emblem: { kind }, plate: { on: true } });
      const fig = out.parts.find((p) => p.id === "figure")!;
      expect(bboxOf([fig.outer]).y1, kind).toBeCloseTo(out.info!.FH + out.info!.tab, 2);
      expect(out.info!.FH, kind).toBeGreaterThan(mergeTrophy({ emblem: { kind } }).emblem.height);
    }
  });

  it("the slot is the figure's own thickness plus the clearance, in every slotted tier", () => {
    const out = build({ T: 3, build: { kind: "mixed" }, mat: { mat2: "acrylic-clear", T2: 5 }, base: { tiers: 3, fit: 0.15 } });
    const tiers = [1, 2, 3].map((k) => out.parts.find((p) => p.id === `tier${k}`)!);
    expect(tiers[0].holes).toHaveLength(0);
    for (const t of tiers.slice(1)) {
      expect(t.holes.length).toBeGreaterThan(0);
      for (const h of t.holes) { const b = bboxOf([h]); expect(b.y1 - b.y0).toBeCloseTo(5.15, 6); }
    }
    expect(out.parts.find((p) => p.id === "figure")!.material).toBe("second");
    expect(out.info!.tab).toBeCloseTo(6, 6);
  });

  it("tiers step in and stack", () => {
    const out = build({ base: { tiers: 3, width: 120, depth: 70, step: 8 } });
    const w = [1, 2, 3].map((k) => { const b = bboxOf([out.parts.find((p) => p.id === `tier${k}`)!.outer]); return b.x1 - b.x0; });
    expect(w[0] - w[1]).toBeCloseTo(16, 1);
    expect(w[1] - w[2]).toBeCloseTo(16, 1);
    expect(out.parts.find((p) => p.id === "tier3")!.place!.z).toBeCloseTo(2 * mergeTrophy({}).T, 6);
  });

  it("a layered trophy puts the emblem front and plate on the second material", () => {
    const p = mergeTrophy({ build: { kind: "layered" } });
    const out = TROPHY.build(p, CTX);
    expect(out.parts.filter((x) => x.material === "second").map((x) => x.id).sort()).toEqual(["emblem", "plate"]);
    expect(TROPHY.pro!(p, out)).toMatch(/Pro/);
    expect(arrangeGenerator(TROPHY, p, CTX).sheets!.at(-1)!.label).toMatch(/acrylic/i);
  });

  it("flags a base too narrow for the tabs and a bad custom path", () => {
    expect(issues({ base: { width: 40, tiers: 3, step: 8 } }).some((i) => i.code === "BASE_NARROW")).toBe(true);
    const bad = issues({ emblem: { kind: "custom", path: "not a path" } });
    expect(bad.some((i) => i.code === "BAD_PATH" && i.level === "error")).toBe(true);
    const ok = build({ emblem: { kind: "custom", path: "M 0 0 L 100 0 L 50 90 Z" } });
    expect(ok.info!.badPath).toBe(false);
  });
});
