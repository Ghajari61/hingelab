import { describe, expect, it } from "vitest";
import { previewSvg } from "../previewSvg";

describe("upgrade dialog preview", () => {
  const svg = `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="230mm" viewBox="0 0 400 230"><g id="outline" fill="none" stroke="#f00" stroke-width="0.1"><path d="M0,0 L10,0 L10,10 Z"/></g></svg>`;
  it("draws lines at a readable screen width and sizes the picture by its box, keeping the drawing", () => {
    const out = previewSvg(svg);
    expect(out).toContain('viewBox="0 0 400 230"');
    expect(out).not.toMatch(/<svg[^>]*\swidth="/);
    expect(out).toContain("vector-effect:non-scaling-stroke");
    expect(out).toContain('<path d="M0,0 L10,0 L10,10 Z"/>');
    expect(out.indexOf("<style>")).toBeGreaterThan(out.indexOf("<svg"));
  });
  it("leaves text that is not an SVG alone", () => expect(previewSvg("nope")).toBe("nope"));
});
