import { describe, expect, it } from "vitest";
import { makeImg, type Img } from "../image";
import { gradeOf, readiness } from "../readiness";
import { runImaging } from "../ops";

/** A white picture with black rectangles painted on it. */
function picture(w: number, h: number, rects: [number, number, number, number, number?][], bg = 255): Img {
  const img = makeImg(w, h, [bg, bg, bg, 255]);
  for (const [x0, y0, rw, rh, v = 0] of rects) {
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
  }
  return img;
}

describe("laser readiness score", () => {
  it("rates a bold, connected black shape on white as ready to cut", () => {
    const r = readiness(picture(200, 200, [[50, 50, 100, 100]]), { method: "cut", widthMm: 100, thicknessMm: 3 });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.grade).toBe("ready");
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.promptFix).toBe("");
  });

  it("marks loose pieces, grey shading and a dirty background, and says how to fix them", () => {
    const loose = readiness(picture(200, 200, [[20, 20, 30, 30], [120, 20, 30, 30], [20, 120, 30, 30], [120, 120, 30, 30]]), { method: "cut", widthMm: 100 });
    expect(loose.checks.find((c) => c.id === "islands")?.ok).toBe(false);
    expect(loose.promptFix).toMatch(/connected/);
    const grey = readiness(picture(200, 200, [[20, 20, 160, 160, 128]]), { method: "cut", widthMm: 100 });
    expect(grey.checks.find((c) => c.id === "contrast")?.ok).toBe(false);
    const dirty = readiness(picture(200, 200, [[60, 60, 80, 80]], 120), { method: "cut", widthMm: 100 });
    expect(dirty.checks.find((c) => c.id === "background")?.ok).toBe(false);
    expect(dirty.score).toBeLessThan(loose.score + 30);
    expect(dirty.promptFix).toMatch(/white background/);
  });

  it("wants tones for engraving instead of pure black and white", () => {
    const r = readiness(picture(100, 100, [[10, 10, 40, 80, 90], [50, 10, 40, 80, 160]]), { method: "engrave", widthMm: 90 });
    expect(r.checks.find((c) => c.id === "contrast")?.ok).toBe(true);
    expect(r.checks.some((c) => c.id === "islands")).toBe(false);
  });

  it("grades the score and runs in the imaging worker", () => {
    expect([gradeOf(90), gradeOf(75), gradeOf(55), gradeOf(20)]).toEqual(["ready", "good", "fix", "redo"]);
    const out = runImaging({ op: "readiness", img: picture(80, 80, [[20, 20, 40, 40]]), options: { method: "cut", widthMm: 60 } });
    expect(out.kind).toBe("readiness");
  });
});
