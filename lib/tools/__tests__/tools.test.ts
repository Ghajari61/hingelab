import { describe, expect, it } from "vitest";
import { lengthMM, resizeForThickness } from "../resize";
import { nestSvg } from "../nestSvg";

const SQUARES = (n: number) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="400mm" height="400mm" viewBox="0 0 400 400">
<g inkscape:groupmode="layer" inkscape:label="Outline" fill="none" stroke="#FF0000">${Array.from({ length: n }, (_, i) => `<path d="M${(i % 4) * 100} ${Math.floor(i / 4) * 100} h60 v40 h-60 Z"/>`).join("")}</g>
<g inkscape:groupmode="layer" inkscape:label="Engrave" fill="none" stroke="#000000">${Array.from({ length: n }, (_, i) => `<path d="M${(i % 4) * 100 + 10} ${Math.floor(i / 4) * 100 + 10} h20"/>`).join("")}</g></svg>`;

describe("free tools", () => {
  it("reads lengths in any unit as millimetres", () => {
    expect(lengthMM("100mm")).toBe(100);
    expect(lengthMM("2in")).toBeCloseTo(50.8);
    expect(lengthMM("96")).toBeCloseTo(25.4);
    expect(lengthMM("auto")).toBeNull();
  });

  it("scales a file for a new thickness and leaves the paths alone", () => {
    const r = resizeForThickness(SQUARES(2), 3, 4);
    expect(r.factor).toBeCloseTo(4 / 3);
    expect(r.after.w).toBeCloseTo(400 * 4 / 3, 3);
    expect(r.svg).toMatch(/width="533.333mm"/);
    expect(r.svg).toContain('d="M0 0 h60 v40 h-60 Z"');
    expect(() => resizeForThickness("<p>no</p>", 3, 4)).toThrow(/not an SVG/);
    // a viewBox alone is millimetres
    expect(resizeForThickness('<svg viewBox="0 0 100 50"></svg>', 3, 6).after.w).toBeCloseTo(200);
  });

  it("nests every part onto sheets, keeping each part's engraving with it", () => {
    const r = nestSvg(SQUARES(12), { sheetW: 200, sheetH: 150, margin: 5, gap: 4, rotate: true });
    expect(r.parts).toBe(12);
    expect(r.tooBig).toBe(0);
    expect(r.sheets).toBeGreaterThanOrEqual(2);
    expect((r.svg.match(/Z/g) ?? []).length).toBe(12);
    expect(r.svg).toContain('stroke="#000000"');
    expect(r.svg).not.toMatch(/NaN|Infinity/);
    expect(() => nestSvg('<svg viewBox="0 0 10 10"></svg>', { sheetW: 100, sheetH: 100, margin: 5, gap: 4, rotate: false })).toThrow(/No closed cut lines/);
  });
});
