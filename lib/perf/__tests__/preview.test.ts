import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULTS, layerContent, mergeParams } from "@/lib/hinge";
import { HINGE_PRESETS } from "@/lib/hinge/presets";
import { arrangeHinge } from "@/lib/fit/hinge";
import { arrangeLetters } from "@/lib/fit/letters";
import { BUNDLED_FONTS, LETTER_DEFAULTS, letterLayerContent, loadFont, mergeLetterParams } from "@/lib/letters";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, genContent } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";

/**
 * The preview path a parameter change runs on the main thread (build, arrange on the sheets, the
 * layers the canvas draws), timed for each product's default design and its presets. Typical
 * designs must update in about 100 ms (feature brief, Phase 10).
 */
const TYPICAL_MS = 100;

function median(run: () => void, n = 5): number {
  run();
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    run();
    t.push(performance.now() - t0);
  }
  return t.sort((a, b) => a - b)[n >> 1];
}

const font = (() => {
  const info = BUNDLED_FONTS.find((f) => f.id === LETTER_DEFAULTS.fontId)!;
  const b = readFileSync(join(__dirname, "../../../public/fonts", info.file));
  return loadFont(hb, info.id, info.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
})();

const rows: { product: string; design: string; ms: number }[] = [];

afterAll(() => {
  if (process.env.PERF_REPORT) writeFileSync(process.env.PERF_REPORT, JSON.stringify(rows.map((r) => ({ ...r, ms: Math.round(r.ms * 10) / 10 })), null, 1));
});

/** Timing needs the machine to itself: `npm run perf:preview` runs it alone. */
describe.skipIf(!process.env.PERF)("preview update time", () => {
  it("Hinge Box", () => {
    const run = (p: typeof DEFAULTS) => () => {
      const a = arrangeHinge(p);
      if (!("error" in a.result) && a.lay) layerContent(a.result, a.lay, a.params);
    };
    rows.push({ product: "hinge", design: "default", ms: median(run(mergeParams({}))) });
    for (const pr of HINGE_PRESETS) rows.push({ product: "hinge", design: pr.id, ms: median(run(mergeParams(pr.params)), 3) });
    expect(rows.find((r) => r.product === "hinge")!.ms).toBeLessThan(TYPICAL_MS);
  });

  it("Letters", () => {
    const build = (p: ReturnType<typeof mergeLetterParams>) => {
      const a = arrangeLetters(p, font, hb);
      if (a.lay) letterLayerContent(a.lay, a.params);
    };
    /** Each run changes `key` to the other of two values, as dragging a field does. */
    const editing = (p: ReturnType<typeof mergeLetterParams>, over: (k: number) => Partial<typeof p>) => {
      let k = 0;
      return () => build(mergeLetterParams({ ...p, ...over(k++ % 2) }));
    };
    for (const mode of ["box", "solid", "stencil"] as const) {
      const p = mergeLetterParams({ ...LETTER_DEFAULTS, mode });
      rows.push({ product: "letters", design: `${mode}: depth edit`, ms: median(editing(p, (k) => ({ depth: p.depth + k }))) });
      rows.push({ product: "letters", design: `${mode}: text edit`, ms: median(editing(p, (k) => ({ text: k ? p.text + "a" : p.text })), 3) });
    }
    expect(rows.filter((r) => r.product === "letters" && r.design.endsWith("depth edit")).filter((r) => r.ms >= TYPICAL_MS)).toEqual([]);
  });

  it("generators", () => {
    for (const def of ALL_GENERATORS) {
      const run = (p: unknown) => () => {
        const a = arrangeGenerator(def, p as never, CTX);
        if (a.lay) genContent(a.lay);
      };
      rows.push({ product: def.id, design: "default", ms: median(run(def.merge({}))) });
      for (const pr of def.presets) rows.push({ product: def.id, design: pr.id, ms: median(run(def.merge(pr.params)), 3) });
    }
    const slow = rows.filter((r) => r.design === "default" && r.ms >= TYPICAL_MS);
    expect(slow).toEqual([]);
  }, 600000);
});
