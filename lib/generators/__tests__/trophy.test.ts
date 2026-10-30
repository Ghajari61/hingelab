import { describe, expect, it } from "vitest";
import { bboxOf } from "../geom";
import { arrangeGenerator } from "../output";
import { TROPHY } from "../trophy";
import type { TrophyOutput } from "../trophy/build";
import { EMBLEMS, mergeTrophy } from "../trophy/params";
import { CTX } from "./ctx";
import { pointInContour } from "../geom";
import { ledChannels } from "../sign/led";

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

describe("trophy displays", () => {
  const T = 3;
  const fix = (raw: unknown, code: string) => {
    const p = mergeTrophy(raw);
    const i = TROPHY.check(p, TROPHY.build(p, CTX)).find((x) => x.code === code);
    expect(i, code).toBeDefined();
    const q = i!.fixes[0].apply(p);
    expect(TROPHY.check(q, TROPHY.build(q, CTX)).some((x) => x.code === code), code).toBe(false);
  };

  it("a rosette emblem fills its box", () => {
    const out = build({ emblem: { kind: "rosette", width: 100, height: 120 }, plate: { on: false }, stem: { height: 0 } });
    const b = bboxOf([out.parts.find((p) => p.id === "figure")!.outer]);
    expect(b.x1 - b.x0).toBeCloseTo(100, 0);
  });

  it("a wall plaque has no base or tabs, and the figure sits inside the backer between its holes", () => {
    const out = build({ display: { kind: "plaque", shape: "rounded", margin: 20 } });
    expect(out.parts.some((p) => p.id.startsWith("tier"))).toBe(false);
    const fig = out.parts.find((p) => p.id === "figure")!, backer = out.parts.find((p) => p.id === "backer")!;
    expect(bboxOf([fig.outer]).y1).toBeCloseTo(out.info!.FH, 4);
    expect(backer.holes).toHaveLength(2);
    expect(fig.place!.z).toBeCloseTo(T, 6);
    const dx = fig.place!.x, dy = fig.place!.y - backer.place!.y;
    expect(fig.outer.every(([x, y]) => pointInContour([x + dx, y + dy], backer.outer))).toBe(true);
    for (const shape of ["arch", "shield", "octagon"]) expect(issues({ display: { kind: "plaque", shape } }).filter((i) => i.level !== "info").map((i) => i.code), shape).toEqual([]);
  });

  it("flags plaque holes in a thin margin and the fix clears them", () => {
    fix({ display: { kind: "plaque", margin: 5 }, emblem: { kind: "shield" } }, "PLAQUE_HOLES");
  });

  it("a medal has a ribbon slot one millimetre wider than the ribbon, above the emblem, and no base", () => {
    const out = build({ display: { kind: "medal", ribbon: 25 }, emblem: { kind: "laurel", width: 75, height: 75 }, plate: { on: false }, stem: { height: 0 } });
    expect(out.parts).toHaveLength(1);
    const fig = out.parts[0];
    const slot = fig.holes.map((h) => bboxOf([h])).find((b) => Math.abs(b.x1 - b.x0 - 26) < 0.01)!;
    expect(slot).toBeDefined();
    expect(slot.y1 - slot.y0).toBeCloseTo(4, 6);
    expect(slot.y1).toBeLessThan(5);
    expect(out.info!.tab).toBe(0);
    fix({ display: { kind: "medal", ribbon: 50 }, emblem: { kind: "star", width: 50, height: 50 }, plate: { on: false } }, "RIBBON_WIDE");
  });

  it("an LED base puts a solid plate and channel layers under slotted tiers, and the tabs reach the LEDs", () => {
    const p = mergeTrophy({ T, build: { kind: "mixed" }, mat: { mat2: "acrylic-clear", T2: 3 }, base: { tiers: 2, led: true, fit: 0.1 } });
    const out = TROPHY.build(p, CTX) as TrophyOutput;
    const ch = ledChannels(T);
    expect(out.parts.filter((x) => x.id.startsWith("led-channel"))).toHaveLength(ch);
    expect(out.parts.find((x) => x.id === "led-bottom")!.holes).toHaveLength(0);
    for (const k of [1, 2]) {
      const tier = out.parts.find((x) => x.id === `tier${k}`)!;
      expect(tier.holes.length).toBeGreaterThan(0);
      expect(tier.place!.z).toBeCloseTo((ch + k) * T, 6);
      for (const h of tier.holes) { const b = bboxOf([h]); expect(b.y1 - b.y0).toBeCloseTo(3.1, 6); }
    }
    expect(out.info!.tab).toBeCloseTo(2 * T, 6);
    const fig = out.parts.find((x) => x.id === "figure")!;
    // the tab ends on top of the channel layers
    expect(-(fig.place!.y) - bboxOf([fig.outer]).y1).toBeCloseTo((ch + 1) * T, 6);
    expect(TROPHY.check(p, out).some((i) => i.code === "LED_FIGURE")).toBe(false);
    fix({ base: { led: true } }, "LED_FIGURE");
    fix({ base: { led: true, depth: 25, tiers: 1 } }, "LED_BASE_SHALLOW");
  });
});
