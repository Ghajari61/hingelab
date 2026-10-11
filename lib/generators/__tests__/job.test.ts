import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "../all";
import { arrangeGenerator, cleanJob, genSVG, type CutPart } from "../output";
import { getPath } from "../path";
import { sanitizeGeneratorParams } from "../sanitize";
import { JOB_EXTRAS, MAX_BATCH, MAX_BATCH_TEXT, type GenBase } from "../types";
import { CTX } from "./ctx";

const partsOf = (a: { result: unknown }) => (a.result as { parts: CutPart[] }).parts;

describe("job options", () => {
  it("clean to one name per non-empty line, capped", () => {
    expect(cleanJob(undefined)).toEqual({ mirror: false, names: [] });
    expect(cleanJob({ mirror: "yes", names: 3 })).toEqual({ mirror: false, names: [] });
    expect(cleanJob({ mirror: true, names: " Ana \r\n\n Ben\n  " })).toEqual({ mirror: true, names: ["Ana", "Ben"] });
    const many = Array.from({ length: 100 }, (_, i) => `N${i}`).join("\n");
    expect(cleanJob({ names: many }).names.length).toBe(MAX_BATCH);
  });

  it("every generator has the job defaults, and the server keeps them in range", () => {
    for (const def of ALL_GENERATORS) {
      const d = def.defaults();
      expect(d.job, def.id).toEqual(JOB_EXTRAS);
      const q = sanitizeGeneratorParams(def, def.merge({ job: { mirror: "x", names: "a".repeat(MAX_BATCH_TEXT + 50) } }));
      expect(getPath(q, "job.mirror"), def.id).toBe(false);
      expect(String(getPath(q, "job.names")).length, def.id).toBe(MAX_BATCH_TEXT);
    }
  });

  it("mirror flips every part left to right, keeping its size and contour direction", () => {
    for (const def of ALL_GENERATORS) {
      const p = def.defaults() as GenBase;
      const plain = partsOf(arrangeGenerator(def, p, CTX));
      const flipped = partsOf(arrangeGenerator(def, { ...p, job: { mirror: true, names: "" } }, CTX));
      expect(flipped.length, def.id).toBe(plain.length);
      plain.forEach((a, i) => {
        const b = flipped[i];
        expect(b.bbox.x0, `${def.id} ${a.name}`).toBeCloseTo(-a.bbox.x1, 6);
        expect(b.bbox.x1, `${def.id} ${a.name}`).toBeCloseTo(-a.bbox.x0, 6);
        expect(b.bbox.y0).toBeCloseTo(a.bbox.y0, 6);
        for (const k of ["outline", "inner", "engrave"] as const) {
          expect(b[k].length).toBe(a[k].length);
          a[k].forEach((c, j) => {
            const m = b[k][j];
            expect(m[m.length - 1][0]).toBeCloseTo(-c[0][0], 6);
            expect(m[m.length - 1][1]).toBeCloseTo(c[0][1], 6);
          });
        }
        a.images.forEach((im, j) => expect(b.images[j].flip).toBe(!im.flip));
      });
    }
  }, 60000);

  it("a batch cuts one set per name, each with its own text", () => {
    for (const def of ALL_GENERATORS) {
      const p = def.defaults() as GenBase;
      const key = def.batch?.(p as never);
      if (!key) continue;
      const one = partsOf(arrangeGenerator(def, p, CTX));
      const a = arrangeGenerator(def, { ...p, job: { mirror: false, names: "Ana\nBen\nCy" } }, CTX);
      const parts = partsOf(a);
      expect(parts.length, def.id).toBe(3 * one.length);
      expect(new Set(parts.map((pt) => pt.id)).size, def.id).toBe(parts.length);
      for (const n of ["Ana", "Ben", "Cy"]) expect(parts.some((pt) => pt.name.endsWith(`(${n})`)), `${def.id} ${n}`).toBe(true);
      expect(a.result && "out" in a.result && a.result.out.stats.some((s) => s.label === "Batch"), def.id).toBe(true);
      expect(genSVG(def, a.params, a.lay!), def.id).toContain("<svg");
    }
  }, 60000);

  it("a design without batch text ignores the names", () => {
    for (const def of ALL_GENERATORS) {
      const p = def.defaults() as GenBase;
      if (def.batch?.(p as never)) continue;
      const one = partsOf(arrangeGenerator(def, p, CTX));
      const a = partsOf(arrangeGenerator(def, { ...p, job: { mirror: false, names: "Ana\nBen" } }, CTX));
      expect(a.length, def.id).toBe(one.length);
    }
  });
});
