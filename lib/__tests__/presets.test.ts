import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { computeModel, mergeParams } from "@/lib/hinge";
import { HINGE_PRESETS } from "@/lib/hinge/presets";
import { BUNDLED_FONTS, computeLetterModel, loadFont, mergeLetterParams } from "@/lib/letters";
import { LETTER_PRESETS } from "@/lib/letters/presets";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";

const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("presets", () => {
  it("has at least 12 uniquely named presets per product", () => {
    for (const list of [HINGE_PRESETS, LETTER_PRESETS, PARAMETRIC_PRESETS]) {
      expect(list.length).toBeGreaterThanOrEqual(12);
      expect(new Set(ids(list)).size).toBe(list.length);
    }
  });

  it.each(HINGE_PRESETS.map((p) => [p.id, p] as const))("Hinge Box preset %s builds", (_id, preset) => {
    const r = computeModel(mergeParams(preset.params));
    expect("error" in r ? r.error : null).toBeNull();
  });

  it.each(LETTER_PRESETS.map((p) => [p.id, p] as const))("Letters preset %s builds", (_id, preset) => {
    const p = mergeLetterParams(preset.params);
    const meta = BUNDLED_FONTS.find((f) => f.id === p.fontId)!;
    const b = readFileSync(join(__dirname, "../../public/fonts", meta.file));
    const font = loadFont(hb, meta.id, meta.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const r = computeLetterModel(p, font, hb);
    expect("error" in r ? r.error : null).toBeNull();
  });
});
