import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "@/lib/letters/fonts";
import { GENERATOR_IDS } from "../ids";
import { arrangeGenerator } from "../output";
import { getPath } from "../path";
import { randomiseParams, shuffleFields, shuffleFonts } from "../randomise";
import { loadGenerator } from "../registry";
import type { AnyGenerator, GenBase } from "../types";
import { CTX } from "./ctx";

type P = GenBase & Record<string, unknown>;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

describe("Randomise design in every generator", () => {
  for (const id of GENERATOR_IDS) {
    it(`${id}: offers style settings, keeps the text, and every new design builds`, async () => {
      const def = (await loadGenerator[id]()) as AnyGenerator;
      const fields = shuffleFields(def);
      expect(fields.length, id).toBeGreaterThan(0);
      const texts = def.sections.flatMap((s) => s.fields).filter((f) => f.kind === "text");
      const base = def.defaults() as P;
      for (let i = 0; i < 25; i++) {
        const q = randomiseParams(def, base, new Set(), seeded(i + 1));
        for (const f of texts) expect(getPath(q, f.key), `${id} ${f.key}`).toEqual(getPath(def.merge(base), f.key));
        for (const f of fields) {
          const v = getPath(q, f.key);
          if (f.kind === "number") {
            expect(v as number).toBeGreaterThanOrEqual(f.min);
            expect(v as number).toBeLessThanOrEqual(f.max);
          }
          if (f.kind === "font" && (!f.show || f.show(q))) expect(shuffleFonts(f.sample?.(q) ?? ""), `${id} ${f.key}`).toContain(v);
        }
        const a = arrangeGenerator(def, q, CTX);
        expect("error" in a.result ? a.result.error : null, `${id} seed ${i + 1}`).toBeNull();
      }
    }, 60000);
  }

  it("picks fonts that cover the text's script and cut cleanly", () => {
    const latin = shuffleFonts("Welcome");
    const persian = shuffleFonts("خوش آمدید");
    expect(latin.length).toBeGreaterThan(5);
    expect(persian.length).toBeGreaterThan(1);
    for (const id of persian) expect(BUNDLED_FONTS.find((f) => f.id === id)?.scripts).toContain("arabic");
    for (const id of [...latin, ...persian]) expect(BUNDLED_FONTS.find((f) => f.id === id)?.thin).toBeFalsy();
  });
});
