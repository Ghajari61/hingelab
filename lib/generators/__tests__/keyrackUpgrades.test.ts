import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { bboxOf, pointInContour } from "../geom";
import { arrangeGenerator, sheetIssues } from "../output";
import { KEYRACK } from "../keyrack";
import { hookProfile, type KeyrackOutput } from "../keyrack/build";
import { mergeKeyrack, type KeyrackParams } from "../keyrack/params";
import { CTX } from "./ctx";

const build = (raw: unknown) => KEYRACK.build(mergeKeyrack(raw), CTX) as KeyrackOutput;
const issuesOf = (p: KeyrackParams) => KEYRACK.check(p, KEYRACK.build(p, CTX));
const codes = (raw: unknown) => issuesOf(mergeKeyrack(raw)).map((i) => i.code);
const size = (c: [number, number][]) => { const b = bboxOf([c]); return [b.x1 - b.x0, b.y1 - b.y0]; };

describe("key holder upgrades: presets", () => {
  for (const id of ["mail-pocket", "magnetic-bar", "coat-rack", "shaker-pegs"]) {
    it(`${id} builds without warnings and lays out`, () => {
      const pr = KEYRACK.presets.find((x) => x.id === id)!;
      expect(pr).toBeTruthy();
      const p = KEYRACK.merge(pr.params);
      const out = KEYRACK.build(p, CTX);
      expect(out.error).toBeUndefined();
      expect(KEYRACK.check(p, out).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
      const a = arrangeGenerator(KEYRACK, p, CTX);
      expect(a.lay).toBeTruthy();
      expect(sheetIssues(KEYRACK, p, a)).toEqual([]);
    });
  }
});

describe("key holder upgrades: hook profiles", () => {
  it("angled pegs and coat hooks keep a tab as thick as the material, through the board", () => {
    for (const profile of ["angled", "double"] as const) {
      const p = mergeKeyrack({ T: 4, hooks: { profile, reach: 40, size: 16 } });
      const h = hookProfile(p);
      const b = bboxOf([h.outer]);
      expect(b.x0, profile).toBeCloseTo(-4, 6);
      expect(b.x1, profile).toBeGreaterThan(30);
      // the tab's middle is in the part at the slot's height
      expect(pointInContour([-2, h.yc], h.outer), profile).toBe(true);
    }
  });

  it("the angled peg rises: its tip is above the tab", () => {
    const h = hookProfile(mergeKeyrack({ hooks: { profile: "angled", reach: 40, size: 16 } }));
    const tip = h.outer.reduce((a, q) => (q[0] > a[0] ? q : a));
    expect(tip[1]).toBeLessThan(h.yc);
  });

  it("the coat hook has an upper arm above the lower one", () => {
    const d = hookProfile(mergeKeyrack({ hooks: { profile: "double", reach: 50, size: 20 } }));
    const r = hookProfile(mergeKeyrack({ hooks: { profile: "round", reach: 50, size: 20 } }));
    expect(bboxOf([d.outer]).y0).toBeLessThan(bboxOf([r.outer]).y0 - 5);
  });
});

describe("key holder upgrades: magnets", () => {
  it("cuts a hole per magnet and a strip behind that covers them all", () => {
    const out = build({ hooks: { style: "magnet", count: 4, hole: 12, magnetT: 3 } });
    const board = out.parts[0];
    const mags = board.holes.filter((h) => { const [w, hh] = size(h); return Math.abs(w - 12) < 0.05 && Math.abs(hh - 12) < 0.05; });
    expect(mags).toHaveLength(4);
    const strip = out.parts.find((p) => p.id === "magnet-strip")!;
    expect(strip).toBeTruthy();
    const sx = strip.place!.x, sb = bboxOf([strip.outer]);
    for (const m of mags) {
      const b = bboxOf([m]);
      expect(b.x0).toBeGreaterThan(sx + sb.x0);
      expect(b.x1).toBeLessThan(sx + sb.x1);
      expect(b.y0).toBeGreaterThan(sb.y0);
      expect(b.y1).toBeLessThan(sb.y1);
    }
    expect(out.parts.some((p) => p.id.startsWith("hook"))).toBe(false);
  });

  it("the Hook type choice sets a magnet-sized hole", () => {
    const f = KEYRACK.sections.flatMap((s) => s.fields).find((x) => x.key === "hooks.style")!;
    if (f.kind !== "choice" || !f.apply) throw new Error("hooks.style must apply");
    expect(f.apply(mergeKeyrack({}), "magnet").hooks.hole).toBe(12);
  });

  it("warns when magnets stand proud of the board, and says when they sit back", () => {
    expect(codes({ T: 3, hooks: { style: "magnet", magnetT: 5 } })).toContain("MAGNET_PROUD");
    expect(codes({ T: 6, hooks: { style: "magnet", magnetT: 3 } })).toContain("MAGNET_SUNK");
    expect(codes({ T: 3, hooks: { style: "magnet", magnetT: 3 } })).not.toContain("MAGNET_PROUD");
  });
});

describe("key holder upgrades: mail pocket", () => {
  const P = { board: { width: 300, height: 260 }, text: { text: "" }, hooks: { y: 80 }, shelf: { on: true, kind: "pocket", depth: 50, at: 14, height: 70 } };

  it("cuts a bottom, two sides and a front, with slots as thick as the material", () => {
    const out = build({ ...P, T: 4 });
    const ids = out.parts.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["pocket-bottom", "pocket-side1", "pocket-side2", "pocket-front"]));
    expect(ids).not.toContain("shelf");
    const board = out.parts[0];
    const thin = (c: [number, number][], t: number) => { const [w, h] = size(c); return Math.abs(Math.min(w, h) - t) < 1e-6; };
    // two slots for the bottom, two for the sides
    expect(board.holes.filter((h) => thin(h, 4)).length).toBeGreaterThanOrEqual(4);
    // the bottom has slots for each side and the front's two tabs
    const bottom = out.parts.find((p) => p.id === "pocket-bottom")!;
    expect(bottom.holes).toHaveLength(4);
    for (const h of bottom.holes) expect(thin(h, 4)).toBe(true);
    // the front's tabs reach exactly through the bottom
    const front = out.parts.find((p) => p.id === "pocket-front")!;
    expect(bboxOf([front.outer]).y1 - (70 - 4)).toBeCloseTo(4, 6);
  });

  it("the pocket is Pro, as the shelf is", () => {
    const p = mergeKeyrack(P);
    expect(KEYRACK.pro!(p, KEYRACK.build(p, CTX))).toMatch(/mail pocket/);
  });

  it("flags a pocket over the hooks or the text, and the fixes clear it", () => {
    const over = mergeKeyrack({ ...P, hooks: { y: 30 } });
    expect(issuesOf(over).map((i) => i.code)).toContain("POCKET_OVER_HOOKS");
    expect(issuesOf(autoFixAll(over, issuesOf).params).map((i) => i.code)).not.toContain("POCKET_OVER_HOOKS");
    const text = mergeKeyrack({ ...P, text: { text: "Mail", y: 20 } });
    const i = issuesOf(text).find((x) => x.code === "POCKET_OVER_TEXT")!;
    expect(i).toBeTruthy();
    expect(issuesOf(i.fixes[0].apply(text)).map((x) => x.code)).not.toContain("POCKET_OVER_TEXT");
  });

  it("the default shelf is unchanged", () => {
    const out = build({ shelf: { on: true } });
    expect(out.parts.map((p) => p.id)).toEqual(expect.arrayContaining(["shelf", "bracket1", "bracket2"]));
  });
});
