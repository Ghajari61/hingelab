import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { DEFAULTS, clone, cutWidth, type Params } from "@/lib/hinge";
import { LETTER_DEFAULTS, loadFont, mergeLetterParams, type LetterParams, type LoadedFont } from "@/lib/letters";
import { computeParametric, loadSource } from "@/lib/parametric/engine";
import { mergeParametricParams } from "@/lib/parametric/defaults";
import { revolution } from "@/lib/parametric/source/library";
import { prepareMesh } from "@/lib/parametric/source/mesh";
import type { ParametricParams } from "@/lib/parametric/types";
import { manifold } from "@/lib/parametric/__tests__/helpers";
import { autoFixAll, applySafeFixes, type Issue } from "../index";
import { hingeIssues } from "../hinge";
import { fontFor, lettersIssues } from "../letters";
import { parametricIssues } from "../parametric";

const font = (file: string, id: string, name: string): LoadedFont => {
  const b = readFileSync(join(process.cwd(), "lib/letters/__tests__/fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const FONTS: Record<string, LoadedFont> = {
  fredoka: font("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold"),
  vazirmatn: font("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black"),
};
const fonts = (id: string) => FONTS[id] ?? null;

/** The issue is raised, has at least one fix, and every one of its fixes makes it go away. */
function expectFixes<P>(check: (p: P) => Issue<P>[], p: P, code: string) {
  const issue = check(p).find((i) => i.code === code);
  expect(issue, `${code} is raised`).toBeDefined();
  expect(issue!.fixes.length, `${code} has a fix`).toBeGreaterThan(0);
  for (const f of issue!.fixes) {
    const after = check(f.apply(p));
    expect(after.some((i) => i.code === code), `${code} after “${f.label}”`).toBe(false);
  }
  return issue!;
}

const hinge = (over: Partial<Params>): Params => ({ ...clone(DEFAULTS), ...over });

describe("Hinge Box checks and fixes", () => {
  it("a build error with a fix: spacing too tight, radius too small", () => {
    expect(expectFixes(hingeIssues, hinge({ pitch: cutWidth(DEFAULTS) + 0.2 }), "BUILD").level).toBe("error");
    expectFixes(hingeIssues, hinge({ shape: "rect", R: 2 }), "BUILD");
  });

  it("a hinge that would crack: Auto-fit (and Serpentine) solve it", () => {
    let found: Params | null = null;
    for (const R of [4, 5, 6, 7, 8, 10, 12]) {
      const p = hinge({ shape: "rect", R, pattern: "straight" });
      const i = hingeIssues(p).find((x) => x.code === "BEND");
      if (i && i.level === "error" && i.fixes.some((f) => f.id === "autofit")) { found = p; break; }
    }
    expect(found).not.toBeNull();
    expectFixes(hingeIssues, found!, "BEND");
  });

  it("weak torsion bars, a missing lid lip and no room for tabs", () => {
    expectFixes(hingeIssues, hinge({ pitch: cutWidth(DEFAULTS) + 0.5 }), "WEAK_BARS");
    expectFixes(hingeIssues, hinge({ shape: "rect", lid: "removable", R: DEFAULTS.T + 1, lidGap: 1 }), "NO_LIP");
    let tabless: Params | null = null;
    for (const tabW of [30, 40, 50, 60]) {
      const p = hinge({ shape: "rect", W: 60, D: 60, R: 20, tabW });
      if (hingeIssues(p).some((i) => i.code === "NO_TABS")) { tabless = p; break; }
    }
    expect(tabless).not.toBeNull();
    expectFixes(hingeIssues, tabless!, "NO_TABS");
  });

  it("too big for the bed: turn the sheet, two halves, or fit to one sheet", () => {
    const big = expectFixes(hingeIssues, hinge({ W: 420, D: 300, H: 120, bedW: 300, bedH: 200 }), "TOO_BIG");
    expect(big.fixes.map((f) => f.id)).toContain("fit1");
    const tall = hinge({ shape: "rect", W: 80, D: 60, H: 60, R: 15, bedW: 200, bedH: 600 });
    const turn = expectFixes(hingeIssues, tall, "TOO_BIG");
    expect(turn.fixes[0].id).toBe("turn");
  });

  it("Auto-fix all clears every safe issue in one go and never loops", () => {
    const messy = hinge({ W: 420, D: 300, pitch: cutWidth(DEFAULTS) + 0.5, bedW: 300, bedH: 200 });
    const res = autoFixAll(messy, hingeIssues);
    expect(res.applied.length).toBeGreaterThan(1);
    expect(res.remaining.filter((i) => i.level !== "info" && i.fixes.some((f) => f.safe))).toEqual([]);
    expect(res.remaining.some((i) => i.code === "TOO_BIG" || i.code === "WEAK_BARS")).toBe(false);
    // A design with nothing to fix stays as it is.
    const clean = autoFixAll(hinge({}), hingeIssues);
    expect(clean.params).toEqual(hinge({}));
  });
});

describe("Letters checks and fixes", () => {
  const letters = (over: Partial<LetterParams>) => mergeLetterParams({ ...structuredClone(LETTER_DEFAULTS), ...over });
  const check = (p: LetterParams) => lettersIssues(p, fonts, hb);

  it("missing glyphs: suggests a font that has them", () => {
    expect(fontFor("سلام", "fredoka")).toBe("vazirmatn");
    expect(fontFor("Sam", "noto-sans-arabic")).toBe("fredoka");
    const issue = expectFixes(check, letters({ text: "Sam سام", fontId: "fredoka" }), "MISSING_GLYPHS");
    expect(issue.fixes[0].label).toBe("Use Vazirmatn Black");
    // No character at all in the font: the build stops, and the same fix gets it going.
    expect(expectFixes(check, letters({ text: "سلام", fontId: "fredoka" }), "BUILD").fixes[0].label).toBe("Use Vazirmatn Black");
  });

  it("too big for the bed: fit to one sheet", () => {
    expectFixes(check, letters({ text: "HELLO", size: 260, bedW: 300, bedH: 200 }), "TOO_BIG");
  });

  it("a letter that bends too tight in a hinge box: Auto-fit solves it", () => {
    let found: LetterParams | null = null;
    for (const size of [150, 200, 120]) for (const minCornerRadius of [15, 20, 25, 10]) for (const pitch of [3, 2.6]) {
      if (found) break;
      const p = letters({ text: "S", mode: "box", wallStyle: "hinge", size, minCornerRadius, pitch, slit: 12, bridge: 3 });
      if (check(p).some((i) => i.code === "BEND" && i.fixes.length)) found = p;
    }
    expect(found).not.toBeNull();
    expectFixes(check, found!, "BEND");
  });

  it("checks wait for the font to load", () => {
    expect(lettersIssues(letters({ fontId: "pacifico" }), fonts, hb)).toEqual([]);
  });
});

describe("Parametric checks and fixes", () => {
  const base = (): ParametricParams => {
    const p = mergeParametricParams({ source: { kind: "library", id: "sphere", detail: 6 } });
    p.material.K = 0;
    p.quality.smoothing = 0;
    return p;
  };
  const run = async (p: ParametricParams, cyl = false) => {
    const wasm = await manifold();
    const src = cyl ? await prepareMesh(revolution(() => 80, 120, 8, 96), p.sourceSettings, { units: "mm", upAxis: "Y", anchor: "centre" }) : await loadSource(p);
    return computeParametric(p, src, wasm);
  };
  const checkAsync = async (p: ParametricParams, cyl = false) => parametricIssues(p, await run(p, cyl));

  async function expectFixesAsync(p: ParametricParams, code: string, cyl = false) {
    const issue = (await checkAsync(p, cyl)).find((i) => i.code === code);
    expect(issue, `${code} is raised`).toBeDefined();
    expect(issue!.fixes.length).toBeGreaterThan(0);
    for (const f of issue!.fixes) {
      const after = await checkAsync(f.apply(p), cyl);
      expect(after.some((i) => i.code === code), `${code} after “${f.label}”`).toBe(false);
    }
    return issue!;
  }

  it("fins crowd the hub: fewer fins or a bigger hub", async () => {
    const p = base();
    p.method = "radial"; p.radial.axis = "Y"; p.radial.count = 80; p.radial.innerRadius = 20; p.radial.hubPlates = 2;
    const i = await expectFixesAsync(p, "FINS_COLLIDE_AT_HUB", true);
    expect(i.fixes[0].label).toBe("31 fins");
  });

  it("fins touch along a curve: fewer fins", async () => {
    const p = base();
    p.method = "curveNormal";
    Object.assign(p.curveNormal, { guide: { kind: "ellipse", w: 120, h: 70 }, count: 200, finLength: "60", finHeight: "20", twist: "0", outerBoundary: { kind: "none" } });
    await expectFixesAsync(p, "FINS_COLLIDE");
  });

  it("a part larger than the sheet: scale the model to fit", async () => {
    const p = base();
    p.sourceSettings.targetSize = { axis: "width", value: 900 };
    p.material.sheetW = 400; p.material.sheetH = 300;
    const i = await expectFixesAsync(p, "PART_TOO_BIG");
    expect(i.fixes.some((f) => f.id === "scale" && f.safe)).toBe(true);
  });

  it("one pass of safe fixes for a slow re-check", async () => {
    const p = base();
    p.sourceSettings.targetSize = { axis: "width", value: 900 };
    p.material.sheetW = 400; p.material.sheetH = 300;
    const issues = await checkAsync(p);
    const res = applySafeFixes(p, issues);
    expect(res.applied.length).toBeGreaterThan(0);
    expect((await checkAsync(res.params)).some((i) => i.code === "PART_TOO_BIG")).toBe(false);
  });
});
