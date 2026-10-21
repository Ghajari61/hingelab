import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { halfKerf, slotLessKerf } from "../kerf";

describe("Letters kerf: one place, applied once", () => {
  it("no Letters module computes its own kerf offset", () => {
    const dir = join(__dirname, "..");
    const own = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "kerf.ts").filter((f) => {
      const code = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      return /\bK\s*\/\s*2\b|\.K\s*\)\s*\/\s*2|-\s*p\.K\)/.test(code);
    });
    expect(own).toEqual([]);
  });

  it("half the kerf each side; never negative", () => {
    expect(halfKerf({ K: 0.2 })).toBe(0.1);
    expect(halfKerf({ K: -1 })).toBe(0);
    expect(slotLessKerf(3, { K: 0.2 })).toBeCloseTo(2.8, 10);
  });
});
