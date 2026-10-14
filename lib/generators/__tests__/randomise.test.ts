import { describe, expect, it } from "vitest";
import { getPath } from "../path";
import { presetMatches, pushRecent, randomiseParams, readIds, shuffleFields, toggleIn } from "../randomise";
import { arrangeGenerator } from "../output";
import type { AnyGenerator, GenBase } from "../types";
import { loadGenerator } from "../registry";
import { SHADOWBOX } from "../shadowbox";
import { CTX } from "./ctx";

type P = GenBase & Record<string, unknown>;
const def = SHADOWBOX as unknown as AnyGenerator;

/** Seeded generator (mulberry32) so every run tries the same designs. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

describe("Randomise design", () => {
  it("Shadow Box offers it for its pattern, depth, frame shape and colours", () => {
    const keys = shuffleFields(def).map((f) => f.key);
    for (const k of ["design.pattern", "design.min", "design.max", "stack.count", "frame.shape", "look.palette"]) expect(keys).toContain(k);
    for (const k of ["frame.width", "frame.height", "frame.border", "text.text", "photo.zoom", "design.web"]) expect(keys).not.toContain(k);
  });

  it("new designs stay inside every field's range, keep the size and words, and build", () => {
    const base = def.merge({ text: { text: "Hello" }, frame: { width: 200, height: 250 } }) as P;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const q = randomiseParams(def, base, new Set(), seeded(i + 1));
      seen.add(String(getPath(q, "design.pattern")));
      for (const f of shuffleFields(def)) {
        if (f.kind !== "number") continue;
        const v = getPath(q, f.key) as number;
        expect(v).toBeGreaterThanOrEqual(f.min);
        expect(v).toBeLessThanOrEqual(f.max);
      }
      expect(getPath(q, "frame.width")).toBe(200);
      expect(getPath(q, "frame.height")).toBe(250);
      expect(getPath(q, "text.text")).toBe("Hello");
      const a = arrangeGenerator(def, q, CTX);
      expect("error" in a.result ? a.result.error : null).toBeNull();
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("locked settings never change, and the same seed gives the same design", () => {
    const base = def.merge({ design: { pattern: "mandala", min: 30, max: 100 }, look: { palette: "ocean" } }) as P;
    const locked = new Set(["design.pattern", "design.max", "look.palette"]);
    for (let i = 0; i < 20; i++) {
      const q = randomiseParams(def, base, locked, seeded(i + 7));
      expect(getPath(q, "design.pattern")).toBe("mandala");
      expect(getPath(q, "design.max")).toBe(100);
      expect(getPath(q, "look.palette")).toBe("ocean");
    }
    expect(randomiseParams(def, base, locked, seeded(3))).toEqual(randomiseParams(def, base, locked, seeded(3)));
  });

  it("does nothing for a generator without shuffle fields", async () => {
    const qr = await loadGenerator.qr();
    if (shuffleFields(qr).length) return;
    const p = qr.defaults() as P;
    expect(randomiseParams(qr, p, new Set(), seeded(1))).toEqual(qr.merge(p));
  });
});

describe("preset search, favourites and recent", () => {
  const pr = { id: "cloud-sky", name: "Sweet dreams", note: "Puffy clouds and a crescent moon" };
  it("matches every word of the query in the name, note or id, any case", () => {
    expect(presetMatches("", pr)).toBe(true);
    expect(presetMatches("sweet", pr)).toBe(true);
    expect(presetMatches("MOON clouds", pr)).toBe(true);
    expect(presetMatches("cloud sky", pr)).toBe(true);
    expect(presetMatches("moon forest", pr)).toBe(false);
  });

  it("recent keeps the latest first without repeats; favourites toggle", () => {
    expect(pushRecent(["a", "b", "c", "d"], "c")).toEqual(["c", "a", "b", "d"]);
    expect(pushRecent(["a", "b", "c", "d"], "e")).toEqual(["e", "a", "b", "c"]);
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });

  it("reads only lists of short strings back from storage", () => {
    expect(readIds('["a","b"]')).toEqual(["a", "b"]);
    expect(readIds('["a",1,null,{"x":1}]')).toEqual(["a"]);
    expect(readIds("{bad")).toEqual([]);
    expect(readIds(null)).toEqual([]);
    expect(readIds(JSON.stringify(["x".repeat(200)]))).toEqual([]);
  });
});
