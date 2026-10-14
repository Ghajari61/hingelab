import { describe, expect, it } from "vitest";
import { GENERATOR_IDS } from "../ids";
import { getPath } from "../path";
import { loadGenerator } from "../registry";
import type { TextSpec } from "../types";

describe("text fields between presets", () => {
  it("an empty field never shows a preset's words as its hint, and a preset without words leaves it empty", async () => {
    for (const id of GENERATOR_IDS) {
      const def = await loadGenerator[id]();
      const texts = def.sections.flatMap((s) => s.fields).filter((f) => f.kind === "text") as TextSpec<unknown>[];
      for (const f of texts) {
        const used = new Set(def.presets.map((pr) => String(getPath(def.merge(pr.params), f.key) ?? "")));
        // A placeholder that equals some preset's text looks like that text stayed behind.
        if (f.placeholder) expect.soft(used.has(f.placeholder), `${id} ${f.key} placeholder "${f.placeholder}"`).toBe(false);
        const blank = String(getPath(def.defaults(), f.key) ?? "");
        for (const pr of def.presets) {
          const raw = getPath(pr.params as never, f.key);
          if (raw === undefined) expect(String(getPath(def.merge(pr.params), f.key) ?? ""), `${id} ${pr.id} ${f.key}`).toBe(blank);
        }
      }
    }
  });
});
