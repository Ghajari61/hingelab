import { describe, expect, it } from "vitest";
import { DEFAULTS, clone } from "@/lib/hinge";
import { arrangeGenerator } from "@/lib/generators/output";
import { QR } from "@/lib/generators/qr";
import { CLOCK } from "@/lib/generators/clock";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { SHEET_EDGE, usedArea, usedText } from "../arrange";
import { arrangeHinge } from "../hinge";

const mm = (v: number) => `${Math.round(v * 10) / 10} mm`;

/** The parts' far edges on each sheet, measured from the sheet corner, plus the edge margin. */
function expectedPerSheet(a: { lay: { items: { pt: { bbox: { x1: number; y0: number; y1: number } }; ox: number; oy: number }[] } | null; sheets: { y: number; h: number }[] | null }) {
  return a.sheets!.map((s) => {
    const on = a.lay!.items.filter(({ pt, oy }) => oy + pt.bbox.y0 >= s.y && oy + pt.bbox.y0 <= s.y + s.h);
    return {
      w: Math.max(...on.map(({ pt, ox }) => ox + pt.bbox.x1)) + SHEET_EDGE,
      h: Math.max(...on.map(({ pt, oy }) => oy + pt.bbox.y1 - s.y)) + SHEET_EDGE,
    };
  });
}

describe("status bar Used size", () => {
  it("is the row layout's size for the Hinge Box with Fit off (unchanged)", () => {
    const a = arrangeHinge(clone(DEFAULTS));
    const u = usedArea(a.lay!, a.sheets);
    expect(u).toEqual({ w: a.lay!.width, h: a.lay!.height, sheets: 1 });
    expect(usedText(u, mm)).toBe("567.7 mm × 195.3 mm");
  });

  it("is the parts' bounding box for a generator on one sheet, not the bed", () => {
    const p = QR.merge({});
    const a = arrangeGenerator(QR, p, CTX);
    expect(a.sheets!.length).toBe(1);
    const u = usedArea(a.lay!, a.sheets);
    const [e] = expectedPerSheet(a);
    expect(u.sheets).toBe(1);
    expect(u.w).toBeCloseTo(e.w, 6);
    expect(u.h).toBeCloseTo(e.h, 6);
    expect(u.w).toBeLessThan(p.bedW);
    expect(u.h).toBeLessThan(p.bedH);
    expect(usedText(u, mm)).not.toContain(`${p.bedW} mm × ${p.bedH} mm`);
  });

  it("names the sheet count and the largest per-sheet size with several sheets, never a summed height", () => {
    const p = { ...QR.merge({}), bedW: 200, bedH: 150, sheet: { nest: "box" as const, calibration: false, labels: false, copies: 20 } };
    const a = arrangeGenerator(QR, p, CTX);
    expect(a.sheets!.length).toBeGreaterThan(1);
    const u = usedArea(a.lay!, a.sheets);
    const per = expectedPerSheet(a);
    expect(u.sheets).toBe(a.sheets!.length);
    expect(u.w).toBeCloseTo(Math.max(...per.map((s) => s.w)), 6);
    expect(u.h).toBeCloseTo(Math.max(...per.map((s) => s.h)), 6);
    expect(u.w).toBeLessThanOrEqual(p.bedW);
    expect(u.h).toBeLessThanOrEqual(p.bedH);
    expect(usedText(u, mm)).toMatch(new RegExp(`^${a.sheets!.length} sheets, up to [\\d.]+ mm × [\\d.]+ mm each$`));
  });

  it("works for every sheet of a default clock (which needs two)", () => {
    const p = CLOCK.merge({});
    const a = arrangeGenerator(CLOCK, p, CTX);
    const u = usedArea(a.lay!, a.sheets);
    expect(u.sheets).toBe(a.sheets!.length);
    expect(u.h).toBeLessThanOrEqual(p.bedH);
    expect(u.h).toBeLessThan(a.lay!.height);
  });
});
