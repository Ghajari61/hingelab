import { describe, expect, it } from "vitest";
import { rect } from "../geom";
import { arrangeGenerator, genSVG } from "../output";
import type { AnyGenerator, GenBase, GenPart } from "../types";
import { CTX } from "./ctx";

const base: GenBase = {
  name: "Mixed", material: "birch3", T: 3, K: 0.15, bedW: 300, bedH: 200, gap: 5, fit: { mode: "off", sheets: 1 },
  layers: { outline: { vis: true, exp: true }, slots: { vis: true, exp: true }, hinge: { vis: true, exp: true }, labels: { vis: true, exp: true } },
};

function fake(parts: GenPart[], materials?: { main: string; second: string; secondK?: number }): AnyGenerator {
  return {
    id: "boxes", name: "Fake", version: 1, defaults: () => base, merge: () => base, sections: [], presets: [],
    build: () => ({ parts, stats: [], materials }), check: () => [], fileName: () => "fake", summary: () => "Fake",
    help: { intro: [], tips: [] },
  } as unknown as AnyGenerator;
}

describe("mixed materials", () => {
  it("packs each material on its own sheets, main first, tagged", () => {
    const parts: GenPart[] = [
      { id: "a", name: "Board", outer: rect(0, 0, 100, 60), holes: [] },
      { id: "b", name: "Letters", outer: rect(0, 0, 40, 20), holes: [], material: "second" },
      { id: "c", name: "Stand", outer: rect(0, 0, 50, 20), holes: [] },
    ];
    const a = arrangeGenerator(fake(parts, { main: "Birch 3 mm", second: "Gold mirror acrylic", secondK: 0.08 }), base, CTX);
    expect(a.sheets).toHaveLength(2);
    expect(a.sheets![0].label).toMatch(/Birch 3 mm/);
    expect(a.sheets![1].label).toMatch(/Gold mirror acrylic/);
    const onSecond = a.lay!.items.filter((it) => it.oy >= a.sheets![1].y - 1e-6).map((it) => it.pt.name);
    expect(onSecond).toEqual(["Letters"]);
    // The second material's kerf is used for its parts.
    const letters = a.lay!.items.find((it) => it.pt.name === "Letters")!.pt;
    expect(letters.bbox.x1 - letters.bbox.x0).toBeCloseTo(40.08, 2);
    expect(genSVG(fake(parts), base, a.lay!)).toMatch(/Gold mirror acrylic: Letters/);
  });

  it("single-material designs are packed as before (no tags)", () => {
    const parts: GenPart[] = [{ id: "a", name: "Board", outer: rect(0, 0, 100, 60), holes: [] }];
    const a = arrangeGenerator(fake(parts), base, CTX);
    expect(a.sheets).toHaveLength(1);
    expect(a.sheets![0].label).toBe("Sheet 1 of 1");
    expect(a.lay!.items[0].pt.tag).toBeUndefined();
  });
});
