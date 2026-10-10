import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { LETTER_DEFAULTS, computeLetterModel, exportLetterSVG, layoutLetters, loadFont } from "@/lib/letters";
import type { Contour, LetterModel, LetterParams, LoadedFont, SolidPart } from "@/lib/letters";

function fixture(file: string, id: string, name: string): LoadedFont {
  const b = readFileSync(join(__dirname, "fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const vazir = fixture("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black");

function stencil(text: string, font: LoadedFont, extra: Partial<LetterParams> = {}): { m: LetterModel; sheet: SolidPart } {
  const p: LetterParams = { ...LETTER_DEFAULTS, text, fontId: font.id, mode: "stencil", ...extra };
  const m = computeLetterModel(p, font, hb);
  if ("error" in m) throw new Error(m.error);
  expect(m.parts.length).toBe(1);
  const sheet = m.parts[0];
  if (sheet.kind !== "solid") throw new Error("stencil part must be a solid sheet");
  return { m, sheet };
}

/**
 * Rasterise the sheet's material (inside the outer, outside every hole, even-odd) at `ppm` px/mm
 * and flood-fill from the border. Returns material pixels that the fill cannot reach.
 */
function floating(sheet: SolidPart, ppm: number): { material: number; loose: number } {
  const { x0, y0, x1, y1 } = sheet.bbox;
  const W = Math.ceil((x1 - x0) * ppm) + 2, H = Math.ceil((y1 - y0) * ppm) + 2;
  const mat = new Uint8Array(W * H);
  const contours: Contour[] = [sheet.outer, ...sheet.holes];
  for (let r = 0; r < H; r++) {
    const y = y0 + (r - 0.5) / ppm;
    const xs: number[] = [];
    for (const c of contours) for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const [ax, ay] = c[j], [bx, by] = c[i];
      if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - x0) * ppm + 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) * ppm + 0.5));
      for (let col = c0; col <= c1; col++) mat[r * W + col] = 1;
    }
  }
  let material = 0;
  for (let i = 0; i < mat.length; i++) material += mat[i];
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const push = (i: number) => { if (mat[i] && !seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let col = 0; col < W; col++) { push(col); push((H - 1) * W + col); push(W + col); push((H - 2) * W + col); }
  for (let r = 0; r < H; r++) { push(r * W); push(r * W + W - 1); push(r * W + 1); push(r * W + W - 2); }
  while (stack.length) {
    const i = stack.pop()!;
    const r = (i / W) | 0, col = i % W;
    if (col > 0) push(i - 1);
    if (col < W - 1) push(i + 1);
    if (r > 0) push(i - W);
    if (r < H - 1) push(i + W);
  }
  let reached = 0;
  for (let i = 0; i < seen.length; i++) reached += seen[i];
  return { material, loose: material - reached };
}

describe("9. stencil: no floating islands", () => {
  const cases: [string, LoadedFont, Partial<LetterParams>][] = [
    ["ABOPQR8", fredoka, {}],
    ["ABOPQR8", fredoka, { bridgesPerIsland: 2 }],
    ["ABOPQR8", fredoka, { size: 60, K: 0.2 }],
    ["ABOPQR8", fredoka, { weld: "letters", letterSpacing: -8 }],
    ["هشت ۸ ۰ ف", vazir, {}],
  ];
  for (const [text, font, extra] of cases) {
    it(`${text} ${JSON.stringify(extra)}`, () => {
      const { m, sheet } = stencil(text, font, extra);
      const { material, loose } = floating(sheet, 4);
      expect(material).toBeGreaterThan(0);
      expect(loose).toBe(0);
      expect(m.issues.filter(i => i.lvl === "warn" && i.msg.includes("fall out"))).toEqual([]);
    });
  }

  it("every counter is kept (held by bridges, not cut away)", () => {
    const { m, sheet } = stencil("ABOPQR8", fredoka);
    // A, B, O, P, Q, R, 8×2 = 8 counters (Fredoka Bold's B has one open counter), one bridge each.
    expect(m.bridges.length).toBe(8);
    const two = stencil("ABOPQR8", fredoka, { bridgesPerIsland: 2 });
    expect(two.m.bridges.length).toBe(16);
    // Each bridge splits a letter's cut-out, so the sheet has more holes than letters.
    expect(sheet.holes.length).toBeGreaterThanOrEqual(7);
    expect(floating(sheet, 4).material).toBeGreaterThan(floating(stencil("ABOPQR8", fredoka, { sheetMargin: 20 }).sheet, 4).material * 0.99);
  });

  it("two bridges per counter sit at least 120° apart", () => {
    const { m } = stencil("O", fredoka, { bridgesPerIsland: 2 });
    expect(m.bridges.length).toBe(2);
    const [a, b] = m.bridges.map(br => Math.atan2(br.b[1] - br.a[1], br.b[0] - br.a[0]));
    let d = Math.abs(a - b) * 180 / Math.PI;
    if (d > 180) d = 360 - d;
    expect(d).toBeGreaterThanOrEqual(120 - 1e-6);
  });

  it("the sheet is the text plus the margin, and letters without counters need no bridges", () => {
    const { m, sheet } = stencil("HI", fredoka, { K: 0, sheetMargin: 25 });
    expect(m.bridges).toEqual([]);
    expect(sheet.bbox.x1 - sheet.bbox.x0).toBeCloseTo(m.bbox.x1 - m.bbox.x0 + 50, 3);
    expect(sheet.bbox.y1 - sheet.bbox.y0).toBeCloseTo(m.bbox.y1 - m.bbox.y0 + 50, 3);
    expect(sheet.holes.length).toBe(2);
  });

  it("exports one outline and the letters as inner cuts", () => {
    const p: LetterParams = { ...LETTER_DEFAULTS, text: "ABOPQR8", mode: "stencil" };
    const { m } = stencil("ABOPQR8", fredoka);
    const svg = exportLetterSVG(layoutLetters(m, p), p);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect((svg.split('<g id="outline"')[1].match(/<path /g) ?? []).length).toBe(1);
    expect((svg.split('<g id="slots"')[1].split("</g>")[0].match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(7);
  });
});
