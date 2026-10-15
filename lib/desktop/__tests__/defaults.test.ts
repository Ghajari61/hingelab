import { describe, expect, it } from "vitest";
import { getPath } from "@/lib/generators/path";
import { coerce, desktopCatalog, generateDesign } from "../products";
import type { GenerateResponse } from "../types";

describe("desktop catalog defaults (the reset buttons)", () => {
  it("gives every field a default the field accepts", async () => {
    const c = await desktopCatalog();
    for (const p of c.products) {
      for (const s of p.sections) {
        for (const f of s.fields) {
          expect(f.default, `${p.id} ${f.key}`).not.toBeUndefined();
          expect("v" in coerce(f, f.default), `${p.id} ${f.key}`).toBe(true);
        }
      }
    }
  });

  it("matches the settings of a new design", async () => {
    for (const p of (await desktopCatalog()).products) {
      const r = await generateDesign({ product: p.id }, "pro");
      const params = (r.body as GenerateResponse).params;
      for (const s of p.sections) {
        for (const f of s.fields) {
          const v = getPath(params, f.key);
          if (f.kind === "choice") expect(String(v), `${p.id} ${f.key}`).toBe(f.default);
          else if (f.kind === "toggle") expect(v === true, `${p.id} ${f.key}`).toBe(f.default);
          else if (f.kind === "text") expect(String(v ?? ""), `${p.id} ${f.key}`).toBe(f.default);
          else if (v !== undefined) expect(v, `${p.id} ${f.key}`).toBe(f.default);
        }
      }
    }
  }, 60000);
});
