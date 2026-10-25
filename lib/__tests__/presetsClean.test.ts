/**
 * Every ready-made design opens the way a user expects: it builds, exports and shows no warning
 * about itself. (The pop-up LED reminder is a deliberate safety note on lamp designs.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { HINGE_PRESETS, hingePresetParams } from "@/lib/hinge/presets";
import { hingeIssues } from "@/lib/issues/hinge";
import { lettersIssues } from "@/lib/issues/letters";
import { BUNDLED_FONTS, loadFont, mergeLetterParams, type LoadedFont } from "@/lib/letters";
import { LETTER_PRESETS } from "@/lib/letters/presets";

const DELIBERATE = new Set(["popup-led"]);
const fontCache = new Map<string, LoadedFont | null>();
const font = (id: string): LoadedFont | null => {
  if (!fontCache.has(id)) {
    const m = BUNDLED_FONTS.find((f) => f.id === id);
    if (!m) fontCache.set(id, null);
    else {
      const b = readFileSync(join(process.cwd(), "public/fonts", m.file));
      fontCache.set(id, loadFont(hb, m.id, m.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
  }
  return fontCache.get(id)!;
};

describe("ready-made designs open clean", () => {
  for (const def of ALL_GENERATORS) {
    it(`${def.id}: every preset builds with finite geometry and no warning`, () => {
      for (const pr of def.presets) {
        const p = def.merge(pr.params);
        const out = def.build(p, CTX) as { error?: string; parts: { outer: [number, number][] }[] };
        expect(out.error, pr.id).toBeUndefined();
        expect(out.parts.length, pr.id).toBeGreaterThan(0);
        expect(out.parts.every((q) => q.outer.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))), pr.id).toBe(true);
        const bad = def.check(p, out as never).filter((i) => i.level !== "info" && !DELIBERATE.has(i.code));
        expect(bad.map((i) => `${i.code}: ${i.message}`), `${def.id}/${pr.id}`).toEqual([]);
      }
    }, 120_000);
  }

  it("Hinge Box: every preset opens without a warning", () => {
    for (const pr of HINGE_PRESETS) {
      const bad = hingeIssues(hingePresetParams(pr.params)).filter((i) => i.level !== "info");
      expect(bad.map((i) => `${i.code}: ${i.message}`), pr.id).toEqual([]);
    }
  });

  it("Letters: every preset opens without a warning", () => {
    for (const pr of LETTER_PRESETS) {
      const bad = lettersIssues(mergeLetterParams(pr.params), font, hb).filter((i) => i.level !== "info");
      expect(bad.map((i) => `${i.code}: ${i.message}`), pr.id).toEqual([]);
    }
  }, 120_000);
});
