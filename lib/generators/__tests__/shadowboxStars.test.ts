import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { bboxOf, distToContour, pointInContour } from "../geom";
import { SHADOWBOX } from "../shadowbox";
import type { ShadowBoxOutput } from "../shadowbox/build";
import { mergeShadowBox, RIDGES, type ShadowBoxParams } from "../shadowbox/params";
import type { Contour } from "../types";
import { CTX } from "./ctx";

const build = (p: ShadowBoxParams) => SHADOWBOX.build(p, CTX) as ShadowBoxOutput;
const issuesOf = (p: ShadowBoxParams) => SHADOWBOX.check(p, build(p));
const codes = (p: ShadowBoxParams) => issuesOf(p).map((i) => i.code);
const part = (out: ShadowBoxOutput, id: string) => out.parts.find((q) => q.id === id)!;
const centre = (c: Contour): [number, number] => { const b = bboxOf([c]); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };

/** A night scene: 240 × 180 mm, 6 layers, a plain back board. */
const NIGHT = { frame: { shape: "rect", width: 240, height: 180, border: 12, corner: 0 }, stack: { count: 6, back: true }, design: { pattern: "landscape", ridge: "mountains", count: 3, amp: 24, min: 34, max: 84, twist: 0 } };
const P = (design: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => mergeShadowBox({ ...NIGHT, ...more, design: { ...NIGHT.design, ...design } });

describe("Stars in the back board", () => {
  it("cuts the asked number of stars in the sky, clear of the window's edge and of each other", () => {
    const p = P({ stars: 25, star: "star", starSize: 5 });
    const out = build(p);
    const back = part(out, "layer1");
    expect(back.holes).toHaveLength(25);
    expect(out.info!.stars).toBe(25);
    expect(out.stats.find((s) => s.label === "Stars")?.value).toBe("25");
    const win = { x0: 12, y0: 12, x1: 228, y1: 168 };
    const cs = back.holes.map(centre);
    for (const [i, h] of back.holes.entries()) {
      const b = bboxOf([h]);
      expect(b.x0).toBeGreaterThan(win.x0 + 1.5);
      expect(b.x1).toBeLessThan(win.x1 - 1.5);
      expect(b.y0).toBeGreaterThan(win.y0 + 1.5);
      // a scene's stars sit in its sky, the upper part of the window
      expect(cs[i][1]).toBeLessThan(win.y0 + (win.y1 - win.y0) * 0.55);
      for (let j = 0; j < i; j++) {
        // the paper between two stars is at least the narrowest bridge
        expect(back.holes[j].every((q) => distToContour(q, h) >= p.design.web - 1e-6 || pointInContour(q, h))).toBe(true);
      }
    }
    // the same seed gives the same sky; another seed another one
    expect(build(p).parts.find((q) => q.id === "layer1")!.holes).toEqual(back.holes);
    expect(build(P({ stars: 25, seed: 8 })).parts.find((q) => q.id === "layer1")!.holes).not.toEqual(back.holes);
  });

  it("draws stars, dots, sparkles or a mix, and keeps clear of the light hole", () => {
    /** Each hole's narrowest over widest reach from its middle: 1 for a dot, under 0.5 for stars and sparkles. */
    const ratios = (star: string) => part(build(P({ stars: 9, star, starSize: 8 })), "layer1").holes.map((h) => {
      const [x, y] = centre(h), d = h.map(([u, v]) => Math.hypot(u - x, v - y));
      return Math.min(...d) / Math.max(...d);
    });
    for (const r of ratios("dot")) expect(r).toBeGreaterThan(0.85);
    for (const r of ratios("star")) expect(r).toBeLessThan(0.55);
    for (const r of ratios("sparkle")) expect(r).toBeLessThan(0.45);
    const mixed = ratios("mixed");
    expect(mixed.some((r) => r > 0.85) && mixed.some((r) => r < 0.55)).toBe(true);
    expect(part(build(P({ stars: 9, star: "star" })), "layer1").holes.every((h) => h.length === 10)).toBe(true);
    const out = build(P({ stars: 30, moon: true, hole: "circle", holeSize: 20 }));
    const holes = part(out, "layer1").holes;
    expect(holes).toHaveLength(31);
    const moon = holes.reduce((a, h) => (bboxOf([h]).x1 - bboxOf([h]).x0 > bboxOf([a]).x1 - bboxOf([a]).x0 ? h : a));
    const mb = bboxOf([moon]), r = (mb.x1 - mb.x0) / 2, [mx, my] = centre(moon);
    for (const h of holes) if (h !== moon) { const [x, y] = centre(h); expect(Math.hypot(x - mx, y - my)).toBeGreaterThan(r + 2); }
  });

  it("needs the plain back board (a pattern layer's sky is already cut away), and leaves the stack as before at 0", () => {
    const withBack = build(P());
    expect(build(P({ stars: 0 })).parts).toEqual(withBack.parts);
    const noBack = P({ stars: 12 }, { stack: { count: 6, back: false } });
    expect(build(noBack).parts).toEqual(build(P({}, { stack: { count: 6, back: false } })).parts);
    expect(codes(noBack)).toContain("STARS_NO_BACK");
    const fixed = autoFixAll(noBack, issuesOf).params;
    expect(fixed.stack.back).toBe(true);
    expect(part(build(fixed), "layer1").holes).toHaveLength(12);
  });

  it("lets a light box shine through the stars, and says when fewer fit than asked", () => {
    const lit = P({ stars: 20 }, { cutter: { kind: "laser" }, T: 3, K: 0.15, light: { on: true } });
    expect(codes(lit)).not.toContain("LIGHT_BLOCKED");
    expect(codes(P({}, { cutter: { kind: "laser" }, T: 3, K: 0.15, light: { on: true } }))).toContain("LIGHT_BLOCKED");
    const crowded = P({ stars: 120, starSize: 15 });
    const issue = issuesOf(crowded).find((i) => i.code === "STARS_FEWER")!;
    expect(issue.level).toBe("info");
    const fixed = autoFixAll(crowded, issuesOf).params;
    expect(fixed.design.stars).toBeLessThan(120);
    expect(codes(fixed)).not.toContain("STARS_FEWER");
  });
});

describe("Village and castle scenes", () => {
  it("build every layer from the bottom, the top or both, and have rail pictures", () => {
    expect(RIDGES).toEqual(expect.arrayContaining(["village", "castle"]));
    for (const ridge of ["village", "castle"]) {
      for (const from of ["bottom", "top", "both"]) {
        const out = build(P({ ridge, from, seed: 3 }));
        expect(out.error, `${ridge} ${from}`).toBeUndefined();
        const layers = out.parts.filter((q) => /^layer\d+$/.test(q.id));
        expect(layers).toHaveLength(6);
        // every pattern layer is cut, and the cut-outs grow toward the front
        const open = layers.slice(1).map((l) => l.holes.reduce((a, h) => a + Math.abs(bboxOf([h]).x1 - bboxOf([h]).x0) * Math.abs(bboxOf([h]).y1 - bboxOf([h]).y0), 0));
        expect(open.every((a) => a > 0), `${ridge} ${from}`).toBe(true);
        expect(open[open.length - 1]).toBeGreaterThan(open[0]);
      }
      expect(SHADOWBOX.art!("design.ridge", ridge).length).toBeGreaterThan(0);
    }
  });
});

describe("Ribbon hole", () => {
  it("drills one hole at the top of every part, lined up through the stack", () => {
    const p = mergeShadowBox({ frame: { shape: "circle", width: 90, height: 90, border: 9 }, stack: { count: 5, spacer: "frames" }, box: { hang: "ribbon", ribbon: 4 }, design: { pattern: "tunnel", opening: "star", min: 25, max: 110, twist: 0 } });
    const out = build(p);
    expect(out.info!.missingMounts).toBeUndefined();
    const plain = build({ ...p, box: { ...p.box, hang: "none" } });
    /** Holes about 4 mm across centred near the top middle of the border, (45, 4.5). */
    const ribbonHoles = (hs: Contour[]) => hs.filter((h) => { const [x, y] = centre(h), b = bboxOf([h]); return Math.abs(x - 45) < 0.5 && Math.abs(y - 4.5) < 0.5 && Math.abs(b.x1 - b.x0 - 4) < 0.3; });
    expect(out.parts.length).toBe(plain.parts.length);
    for (const q of out.parts) {
      expect(ribbonHoles(q.holes), q.id).toHaveLength(1);
      expect(ribbonHoles(plain.parts.find((x) => x.id === q.id)!.holes), q.id).toHaveLength(0);
      expect(q.holes.length, q.id).toBe(plain.parts.find((x) => x.id === q.id)!.holes.length + 1);
    }
    expect(out.assembly!.some((a) => /ribbon/.test(a))).toBe(true);
  });

  it("warns when the border is too narrow for the hole, and widens it", () => {
    const p = mergeShadowBox({ frame: { shape: "circle", width: 90, height: 90, border: 6 }, stack: { count: 4 }, box: { hang: "ribbon", ribbon: 6 } });
    expect(codes(p)).toContain("BAND_TIGHT");
    const fixed = autoFixAll(p, issuesOf).params;
    expect(fixed.frame.border).toBeGreaterThan(6);
    expect(codes(fixed)).not.toContain("BAND_TIGHT");
  });
});

describe("New shadow box presets", () => {
  it("build without errors or warnings", () => {
    for (const id of ["christmas-village", "castle-dreams", "starry-pines", "twinkle-nursery", "village-lightbox", "snowflake-ornament", "star-ornament", "village-ornament"]) {
      const pr = SHADOWBOX.presets.find((x) => x.id === id);
      expect(pr, id).toBeDefined();
      const p = SHADOWBOX.merge(pr!.params), out = build(p);
      expect(out.error, id).toBeUndefined();
      expect(SHADOWBOX.check(p, out).filter((i) => i.level !== "info").map((i) => i.code), id).toEqual([]);
    }
  }, 120000);
});
