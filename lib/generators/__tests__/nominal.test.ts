import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, nestTurns, nominalLayout } from "@/lib/generators/output";
import { polyArea } from "@/lib/fab/model";
import { CTX } from "./ctx";

const area = (paths: [number, number][][]) => paths.reduce((s, p) => s + Math.abs(polyArea(p)), 0);

describe("nominal view", () => {
  const def = ALL_GENERATORS.find((g) => g.id === "sign")!;

  it("shows the parts before kerf, in the same places; the kerf is applied once in the toolpath", () => {
    const p = def.merge({ K: 0.3 });
    const a = arrangeGenerator(def, p, CTX);
    const nom = nominalLayout(a.lay!);
    const items = a.lay!.items.filter((it) => it.i >= 0);
    expect(nom.items.length).toBe(a.lay!.items.length);
    for (const [j, it] of items.entries()) {
      const n = nom.items.filter((x) => x.i >= 0)[j];
      expect([n.ox, n.oy, n.w, n.h]).toEqual([it.ox, it.oy, it.w, it.h]);
      expect(n.pt.bbox).toEqual(it.pt.bbox);
      const cut = area(it.pt.outline as never), design = area(n.pt.outline as never);
      expect(design).toBeLessThan(cut);
      // Growing by K/2 once: about the perimeter times K/2, not twice that.
      const per = (n.pt.outline as [number, number][][]).reduce((s, q) => s + q.reduce((t, pt, i) => t + Math.hypot(pt[0] - q[(i + 1) % q.length][0], pt[1] - q[(i + 1) % q.length][1]), 0), 0);
      expect(cut - design).toBeGreaterThan(per * 0.15 * 0.8);
      expect(cut - design).toBeLessThan(per * 0.15 * 1.25);
    }
  });

  it("with no kerf the nominal and cut parts match", () => {
    const a = arrangeGenerator(def, def.merge({ K: 0 }), CTX);
    const nom = nominalLayout(a.lay!);
    for (const [j, it] of a.lay!.items.entries()) if (it.i >= 0) expect(area(nom.items[j].pt.outline as never)).toBeCloseTo(area(it.pt.outline as never), 3);
  });

  it("nesting turns follow the material's grain", () => {
    expect(nestTurns({ nest: "outline", calibration: false, labels: false, copies: 1 })).toEqual([0, 90, 180, 270]);
    expect(nestTurns({ nest: "outline", calibration: false, labels: false, copies: 1, rotate: "half" })).toEqual([0, 180]);
    expect(nestTurns({ nest: "outline", calibration: false, labels: false, copies: 1, rotate: "none" })).toEqual([0]);
  });
});
