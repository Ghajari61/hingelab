import { describe, expect, it } from "vitest";
import { GALLERY, HERO_HEIGHT, HERO_SHAPES, HERO_WIDTH, heroParams, sheetFor } from "../samples";

describe("landing page boxes", () => {
  it("every gallery box builds without errors", () => {
    for (const s of GALLERY) {
      const sheet = sheetFor(s.params);
      expect(sheet, s.title).not.toBeNull();
      expect(sheet!.content.outline.length, s.title).toBeGreaterThanOrEqual(2);
      // Edge-reaching cuts are merged into the wall outline as notches (all of them for Serpentine).
      const wallCommands = sheet!.content.outline[0].split(/[MLAZCQ]/i).length;
      expect(sheet!.content.hinge.length + wallCommands, s.title).toBeGreaterThan(100);
    }
  });

  it("the hero generator builds at every shape and slider position", () => {
    for (const { v } of HERO_SHAPES) {
      for (let W = HERO_WIDTH.min; W <= HERO_WIDTH.max; W += 5) {
        for (let H = HERO_HEIGHT.min; H <= HERO_HEIGHT.max; H += 5) {
          const p = heroParams(v, W, H);
          const m = sheetFor(p);
          expect(m, `${v} ${W}x${H}`).not.toBeNull();
        }
      }
    }
  });
});
