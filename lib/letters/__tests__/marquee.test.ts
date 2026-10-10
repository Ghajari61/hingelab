import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { LETTER_DEFAULTS, computeLetterModel, exportLetterSVG, layoutLetters, loadFont, marqueeSpacingOf, stackLayersOf } from "@/lib/letters";
import type { Contour, LetterModel, LetterParams, LoadedFont, PlatePart, Point } from "@/lib/letters";

function fixture(file: string, id: string, name: string): LoadedFont {
  const b = readFileSync(join(__dirname, "fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const vazir = fixture("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black");
const isPersian = (t: string) => /[\u0600-\u06ff]/u.test(t);

const MARQUEE = { enabled: true, holeDia: 12, spacing: 30, margin: 5 };
const params = (text: string, extra: Partial<LetterParams> = {}): LetterParams => ({
  ...LETTER_DEFAULTS, text, mode: "box", fontId: isPersian(text) ? "vazirmatn" : "fredoka", ...extra,
});

function model(p: LetterParams): LetterModel {
  const r = computeLetterModel(p, isPersian(p.text) ? vazir : fredoka, hb);
  if ("error" in r) throw new Error(r.error);
  return r;
}

const plates = (m: LetterModel, kind: "base" | "lid" | "lid lip") =>
  m.parts.filter((pt): pt is PlatePart => pt.kind === "plate" && new RegExp(`· ${kind}( \\d+)?$`, "u").test(pt.name));

const centroid = (c: Contour): Point => [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length];
const radius = (c: Contour) => { const o = centroid(c); return c.reduce((s, q) => s + Math.hypot(q[0] - o[0], q[1] - o[1]), 0) / c.length; };

function distToContour(q: Point, c: Contour) {
  let best = Infinity;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return best;
}

/** The light holes of each plate: the holes the same plate does not have without marquee. */
function lightHoles(on: PlatePart[], off: PlatePart[]) {
  return on.map((pl, i) => ({ plate: pl, lights: pl.holes.slice(off[i].holes.length), own: off[i].holes }));
}

describe("marquee light holes", () => {
  for (const text of ["Sam", "O8", "سام"]) {
    it(`"${text}": holes in the lid and lid lip, clear of the walls and each other`, () => {
      const pOn = params(text, { marquee: MARQUEE });
      const on = model(pOn), off = model(params(text));
      const lids = lightHoles(plates(on, "lid"), plates(off, "lid"));
      const lips = lightHoles(plates(on, "lid lip"), plates(off, "lid lip"));
      const bases = lightHoles(plates(on, "base"), plates(off, "base"));
      const total = lids.reduce((n, l) => n + l.lights.length, 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBe(on.box!.letters.reduce((n, s) => n + s.lights, 0));
      expect(bases.every(b => b.lights.length === 0)).toBe(true);
      expect(lips.reduce((n, l) => n + l.lights.length, 0)).toBe(total);

      const r = MARQUEE.holeDia / 2;
      // the lid edge is the outer wall face plus K/2; the wall's inner face is T further in
      const clear = pOn.T + MARQUEE.margin + r + pOn.K / 2 - 0.05;
      const spacing = marqueeSpacingOf(pOn);
      for (const { plate, lights, own } of lids) {
        const centres = lights.map(centroid);
        for (const h of lights) expect(radius(h)).toBeCloseTo(r - pOn.K / 2, 1);
        for (const c of centres) {
          expect(distToContour(c, plate.outer)).toBeGreaterThanOrEqual(clear);
          for (const o of own) expect(distToContour(c, o)).toBeGreaterThanOrEqual(clear);
        }
        for (let i = 0; i < centres.length; i++) for (let j = i + 1; j < centres.length; j++) {
          expect(Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1])).toBeGreaterThanOrEqual(spacing - 1e-6);
        }
      }
    });
  }

  it("an open box gets the holes in its base", () => {
    const on = model(params("Sam", { lid: "open", marquee: MARQUEE })), off = model(params("Sam", { lid: "open" }));
    const bases = lightHoles(plates(on, "base"), plates(off, "base"));
    expect(bases.reduce((n, b) => n + b.lights.length, 0)).toBeGreaterThan(0);
    expect(plates(on, "lid")).toHaveLength(0);
  });

  it("flat-panel walls get light holes too", () => {
    const m = model(params("O", { wallStyle: "faceted", marquee: MARQUEE }));
    expect(m.box!.letters[0].lights).toBeGreaterThan(0);
  });

  it("turned off, the marquee settings change nothing", () => {
    const p = params("Sam");
    const a = model(p), b = model({ ...p, marquee: { ...MARQUEE, enabled: false, holeDia: 20 } });
    expect(exportLetterSVG(layoutLetters(b, p), p)).toBe(exportLetterSVG(layoutLetters(a, p), p));
  });

  it("letters too narrow for the holes get a warning, not a silent blank", () => {
    const m = model(params("Sam", { marquee: { ...MARQUEE, holeDia: 30, margin: 8 } }));
    expect(m.box!.letters.every(s => s.lights === 0)).toBe(true);
    expect(m.issues.filter(i => i.lvl === "warn" && /too narrow for 30 mm light holes/.test(i.msg))).toHaveLength(3);
  });
});

describe("small pieces stacked to full height", () => {
  it("each dot is cut round(depth / T) times when Stack is on", () => {
    // Vazirmatn Black dots are about 460 mm² at 150 mm
    const flat = model(params("نقش", { islandArea: 2000 }));
    const stacked = model(params("نقش", { islandArea: 2000, stackIslands: true }));
    const dots = (m: LetterModel) => m.parts.filter(pt => pt.kind === "solid" && pt.name.includes("· dot"));
    const n = dots(flat).length;
    expect(n).toBeGreaterThan(0);
    const layers = stackLayersOf({ ...LETTER_DEFAULTS, stackIslands: true });
    expect(layers).toBe(Math.round(LETTER_DEFAULTS.depth / LETTER_DEFAULTS.T));
    expect(dots(stacked)).toHaveLength(n * layers);
    expect(dots(stacked).some(pt => pt.name.endsWith(`1/${layers}`))).toBe(true);
    expect(stacked.issues.some(i => i.msg.includes(`cut ${layers} times each`))).toBe(true);
  });

  it("Stack does nothing when small pieces are left out", () => {
    const m = model(params("نقش", { islandArea: 2000, stackIslands: true, smallIslands: "drop" }));
    expect(m.parts.some(pt => pt.name.includes("· dot"))).toBe(false);
  });
});
