import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { sanitizeGeneratorParams } from "@/lib/generators/sanitize";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { keepSetup } from "@/lib/prefs/editor";

describe("product collection release", () => {
  for (const def of ALL_GENERATORS) it(`${def.id}: new designs retain their settings and export millimetre SVGs`, () => {
    const presets = def.id === "keychain" ? def.presets : def.presets.filter(p => p.id.startsWith("studio-"));
    expect(presets).toHaveLength(def.id === "photoproduct" ? 0 : def.id === "keychain" ? 24 : 3);
    expect(new Set(def.presets.map(p=>p.id)).size).toBe(def.presets.length);
    for(const preset of presets) {
      const p = def.merge(preset.params);
      expect(p, preset.id).toMatchObject(preset.params);
      expect(sanitizeGeneratorParams(def,p),preset.id).toEqual(p);
      const a = arrangeGenerator(def,p,CTX);
      expect(a.result,preset.id).not.toHaveProperty("error");
      expect(a.lay,preset.id).not.toBeNull();
      expect(a.sheets?.every(s=>!s.warn),preset.id).toBe(true);
      const svg = genSVG(def,p,a.lay!);
      expect(svg,preset.id).toMatch(/width="[\d.]+mm"/);
      expect(svg,preset.id).not.toMatch(/NaN|Infinity/);
    }
  },60000);
  it("preserving material also preserves directional calibration and grain, without copying a batch", () => {
    const before = {material:"birch3",T:3,K:.15,Ky:.2,gamma:1.2,minFeature:2,bedW:600,bedH:400,sheet:{kerfXY:true,kerfY:.22,rotate:"half",minFeature:2,copies:5}};
    const next = {material:"mdf3",T:3,K:.18,Ky:.18,gamma:1,minFeature:1,bedW:400,bedH:300,sheet:{kerfXY:false,kerfY:.18,rotate:"any",minFeature:0,copies:1}};
    const result=keepSetup(before,next);
    expect(result.Ky).toBe(.2);expect(result.gamma).toBe(1.2);expect(result.minFeature).toBe(2);
    expect(result.sheet).toMatchObject({kerfXY:true,kerfY:.22,rotate:"half",minFeature:2,copies:1});
    expect(next.sheet.rotate).toBe("any");
  });
});
