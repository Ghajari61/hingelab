import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "@/lib/letters/fonts";
import { ALL_GENERATORS } from "../all";
import { GENERATOR_IDS, GENERATOR_INFO } from "../ids";
import { arrangeGenerator, genSVG } from "../output";
import { loadGenerator } from "../registry";
import { getPath } from "../path";
import { CTX } from "./ctx";

describe("generator contract", () => {
  it("every id has info, a loader and a definition", async () => {
    expect(ALL_GENERATORS.map((g) => g.id).sort()).toEqual([...GENERATOR_IDS].sort());
    for (const id of GENERATOR_IDS) {
      expect(GENERATOR_INFO[id].name).toBeTruthy();
      expect((await loadGenerator[id]()).id).toBe(id);
    }
  });

  for (const def of ALL_GENERATORS) {
    describe(def.id, () => {
      const d = def.defaults();

      it("merge fills in defaults and is stable", () => {
        expect(def.merge(undefined)).toEqual(d);
        expect(def.merge(JSON.parse(JSON.stringify(d)))).toEqual(d);
        expect(def.merge({ bogus: 1, T: "x" })).toEqual(d);
      });

      it("every field's key resolves, with the right type and a help sentence", () => {
        const ids = new Set<string>();
        for (const s of def.sections) {
          expect(ids.has(s.id)).toBe(false);
          ids.add(s.id);
          expect(s.help).toMatch(/\.$/);
          for (const f of s.fields) {
            const v = getPath(d, f.key);
            expect(v, f.key).not.toBeUndefined();
            expect(f.help, f.key).toMatch(/^[A-Z].*\.$/);
            if (f.kind === "number") {
              expect(typeof v, f.key).toBe("number");
              expect(f.min < f.max && f.step > 0, f.key).toBe(true);
            } else if (f.kind === "toggle") expect(typeof v, f.key).toBe("boolean");
            else if (f.kind === "font") expect(BUNDLED_FONTS.some((b) => b.id === v), f.key).toBe(true);
            else if (f.kind === "choice") expect(f.options.map((o) => o.v), f.key).toContain(v);
            else expect(typeof v, f.key).toBe("string");
          }
        }
      });

      it("every rail choice has a picture for every option", () => {
        for (const s of def.sections) for (const f of s.fields) {
          if (f.kind !== "choice" || !f.rail) continue;
          for (const o of f.options) {
            const art = def.art?.(f.key, o.v) ?? [];
            expect(art.length, `${f.key}=${o.v}`).toBeGreaterThan(0);
            for (const a of art) expect(a.d, `${f.key}=${o.v}`).toMatch(/^M[-\d.]+[ ,][-\d.]+ L/);
          }
        }
      });

      it("has at least six presets with unique ids that build and export", () => {
        if(def.id === "photoproduct")expect(def.presets).toHaveLength(0);else expect(def.presets.length).toBeGreaterThanOrEqual(6);
        expect(new Set(def.presets.map((p) => p.id)).size).toBe(def.presets.length);
        for (const pr of def.presets) {
          const p = def.merge(pr.params);
          const arranged = arrangeGenerator(def, p, CTX);
          expect(arranged.lay, pr.id).toBeTruthy();
          const svg = genSVG(def, p, arranged.lay!);
          expect(svg, pr.id).not.toMatch(/NaN|Infinity|undefined/);
          expect(def.fileName(p), pr.id).toMatch(/^[a-z0-9-]+$/);
        }
      });

      it("has a help article", () => {
        expect(def.help.intro.length).toBeGreaterThan(0);
        expect(def.help.tips.length).toBeGreaterThan(0);
        expect(def.summary(d).length).toBeGreaterThan(0);
      });
    });
  }
});
