import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { computeModel } from "@/lib/hinge";
import { DEFAULTS } from "@/lib/hinge/defaults";
import { PATTERN_KEYS, hingePresetParams, randomHingePattern } from "@/lib/hinge/presets";
import { BUNDLED_FONTS, computeLetterModel, loadFont, mergeLetterParams } from "@/lib/letters";
import { randomLetterStyle } from "@/lib/letters/randomStyle";
import { shuffleFonts } from "@/lib/generators/randomise";

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("Randomise pattern (Hinge Box)", () => {
  it("changes only the lattice, always to something new that builds", () => {
    const start = hingePresetParams({ name: "Tea box", W: 180, D: 110, H: 85, R: 30, material: "mdf3", T: 3, K: 0.18 });
    for (let seed = 1; seed <= 40; seed++) {
      const next = randomHingePattern(start, undefined, seeded(seed));
      for (const k of Object.keys(start) as (keyof typeof start)[]) {
        if (!(PATTERN_KEYS as readonly string[]).includes(k)) expect(next[k]).toEqual(start[k]);
      }
      expect(PATTERN_KEYS.some((k) => next[k] !== start[k])).toBe(true);
      const r = computeModel(next);
      expect("error" in r ? `seed ${seed} (${next.pattern}): ${r.error}` : null).toBeNull();
    }
  });

  it("keeps to the patterns the plan allows", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(randomHingePattern(DEFAULTS, (p) => p === "straight" || p === "wave", seeded(seed)).pattern).toMatch(/^(straight|wave)$/);
    }
  });
});

describe("Randomise style (Letters)", () => {
  const fonts = new Map<string, ReturnType<typeof loadFont>>();
  const font = (id: string) => {
    if (!fonts.has(id)) {
      const meta = BUNDLED_FONTS.find((f) => f.id === id)!;
      const b = readFileSync(join(__dirname, "../../public/fonts", meta.file));
      fonts.set(id, loadFont(hb, meta.id, meta.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
    return fonts.get(id)!;
  };

  it.each([["Sam"], ["سام"]])("keeps the words %s, picks a font that covers them, and builds", (text) => {
    const start = mergeLetterParams({ text, fontId: text === "Sam" ? "fredoka" : "vazirmatn" });
    for (let seed = 1; seed <= 8; seed++) {
      const change = randomLetterStyle(start, {}, seeded(seed));
      expect(change.text).toBeUndefined();
      expect(shuffleFonts(text)).toContain(change.fontId);
      expect(change.fontId).not.toBe(start.fontId);
      const p = { ...start, ...change };
      const r = computeLetterModel(p, font(p.fontId), hb);
      expect("error" in r ? `seed ${seed} (${p.fontId}, ${p.mode}): ${r.error}` : null).toBeNull();
    }
  });

  it("stays on letter boxes for the free plan", () => {
    for (let seed = 1; seed <= 10; seed++) expect(randomLetterStyle(mergeLetterParams({}), { pro: false }, seeded(seed)).mode).toBe("box");
  });
});
