import { describe, expect, it } from "vitest";
import { unionShapes } from "@/lib/letters/polygon";
import { bboxOf, distToContour, pointInContour, signedArea } from "../geom";
import { arrangeGenerator, genSVG } from "../output";
import { CHARM } from "../charm";
import { charmStrainLimit, type CharmOutput } from "../charm/build";
import { mergeCharm, type CharmParams } from "../charm/params";
import type { Contour, GenPart, Pt } from "../types";
import { CTX } from "./ctx";

const p = (raw: unknown) => mergeCharm(raw);
const build = (raw: unknown) => CHARM.build(p(raw), CTX) as CharmOutput;
const centre = (c: Contour): Pt => { const b = bboxOf([c]); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };
const radius = (c: Contour) => { const b = bboxOf([c]); return (b.x1 - b.x0) / 2; };
const onePiece = (pt: GenPart) => unionShapes([pt.outer, ...pt.holes]).length === 1;
const round = (pt: GenPart) => pt.holes.filter((h) => { const b = bboxOf([h]); return Math.abs((b.x1 - b.x0) - (b.y1 - b.y0)) < 0.05; });

describe("Name Charms", () => {
  it("cuts one charm per name, and copies of each", () => {
    expect(build({ names: { list: "A\nB\nC" } }).parts).toHaveLength(3);
    expect(build({ names: { list: "A\nB", copies: 3 } }).parts).toHaveLength(6);
    expect(build({ kind: { kind: "earrings" }, names: { list: "A\nB" } }).parts).toHaveLength(4);
  });

  it("every hole keeps its wall to the real outline, even on a star's point", () => {
    for (const shape of ["star", "heart", "teardrop", "circle", "diamond"]) {
      const out = build({ shape: { kind: shape, width: 60, height: 60 }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 } });
      for (const pt of out.parts) {
        const [h] = round(pt);
        const c = centre(h);
        expect(distToContour(c, pt.outer) - radius(h), shape).toBeGreaterThanOrEqual(3 - 0.05);
      }
    }
  });

  it("a loop hangs the charm from a ring on its edge with the same wall", () => {
    const out = build({ shape: { kind: "circle", width: 60, height: 60 }, hang: { kind: "loop", side: "top", hole: 4, wall: 2.5 } });
    const pt = out.parts[0];
    expect(onePiece(pt)).toBe(true);
    const [h] = round(pt);
    expect(distToContour(centre(h), pt.outer) - radius(h)).toBeGreaterThanOrEqual(2.5 - 0.1);
    expect(bboxOf([pt.outer]).y1 - bboxOf([pt.outer]).y0).toBeGreaterThan(60 + 2);
  });

  it("the name stays inside the margin and clear of the hole", () => {
    const out = build({ names: { list: "Christopher" }, shape: { kind: "heart", width: 60, height: 54, margin: 4 }, hang: { kind: "hole", hole: 4, wall: 3 } });
    const pt = out.parts[0], [h] = round(pt), hc = centre(h);
    for (const c of pt.engrave!) for (const q of c) {
      expect(pointInContour(q, pt.outer)).toBe(true);
      expect(distToContour(q, pt.outer)).toBeGreaterThan(4 - 0.3);
      expect(Math.hypot(q[0] - hc[0], q[1] - hc[1])).toBeGreaterThan(radius(h) + 3 - 0.1);
    }
    // a long name shrinks to fit
    expect(out.info!.letter).toBeLessThan(14);
  });

  it("cut-out names become holes; layered names a second-material piece on top", () => {
    const cut = build({ names: { list: "AVA", fontId: "archivo-black" }, style: { kind: "cutout" }, hang: { kind: "none" } });
    expect(cut.parts[0].holes.length).toBeGreaterThanOrEqual(3);
    expect(cut.parts[0].engrave ?? []).toHaveLength(0);
    const lay = build({ names: { list: "Ava" }, style: { kind: "layered" } });
    const front = lay.parts.find((q) => q.material === "second")!;
    expect(front.place!.z).toBe(3);
    expect(lay.materials?.second).toMatch(/mirror/i);
    expect(CHARM.pro!(p({ style: { kind: "layered" } }), lay)).toMatch(/Pro/);
  });

  it("a letters keychain is the welded name in one piece, with a ring loop", () => {
    const out = build({ kind: { kind: "keychain" }, names: { list: "Olivia" }, style: { kind: "letters", weld: 1 }, hang: { kind: "hole", side: "left", hole: 5, wall: 3 } });
    const pt = out.parts[0];
    expect(onePiece(pt)).toBe(true);
    const ring = round(pt).find((h) => Math.abs(radius(h) - 2.5) < 0.05)!;
    expect(ring).toBeTruthy();
    expect(centre(ring)[0]).toBeLessThan(bboxOf([pt.outer]).x0 + 10);
    const backed = build({ kind: { kind: "keychain" }, names: { list: "Olivia" }, style: { kind: "letters", backing: 3 } });
    expect(backed.parts).toHaveLength(2);
    expect(backed.parts[1].material).toBe("second");
  });

  it("drink markers clip on: the opening is narrower than the stem and the arm strain is checked", () => {
    const q = p({ kind: { kind: "drink" }, names: { list: "Ann" }, shape: { kind: "circle", width: 28, height: 28 }, clip: { stem: 8, opening: 7.2, ring: 2 } });
    const out = CHARM.build(q, CTX) as CharmOutput;
    const pt = out.parts[0];
    expect(onePiece(pt)).toBe(true);
    // the clip opens through the outline: no closed stem hole
    expect(round(pt).some((h) => Math.abs(radius(h) - 4) < 0.1)).toBe(false);
    const L = Math.PI * (4 + 1) * 0.75;
    expect(out.info!.clipStrain).toBeCloseTo((1.5 * 2 * 0.4) / (L * L), 6);
    expect(CHARM.check(q, out).map((i) => i.code)).not.toContain("CLIP_STRAIN");
    const stiff = p({ ...q, clip: { stem: 8, opening: 5, ring: 3.5 } });
    const bad = CHARM.check(stiff, CHARM.build(stiff, CTX));
    const issue = bad.find((i) => i.code === "CLIP_STRAIN")!;
    expect(issue).toBeTruthy();
    const fixed = issue.fixes[0].apply(stiff);
    expect(CHARM.check(fixed, CHARM.build(fixed, CTX)).map((i) => i.code)).not.toContain("CLIP_STRAIN");
    expect(charmStrainLimit(p({ material: "acr3" }))).toBeLessThan(charmStrainLimit(p({ material: "birch3" })));
  });

  it("place cards stand on a foot whose slot and the card's are the stock plus the clearance", () => {
    const out = build({ kind: { kind: "placecard" }, names: { list: "Grace" }, shape: { kind: "banner", width: 95, height: 40 }, stand: { depth: 30, clearance: 0.1 } });
    const card = out.parts.find((q) => q.id === "charm-1")!, foot = out.parts.find((q) => q.id === "charm-1-foot")!;
    expect(card.upright && foot.upright).toBe(true);
    const slotWidth = (pt: GenPart, y: number) => {
      const xs: number[] = [];
      const c = pt.outer;
      for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; if ((a[1] - y) * (b[1] - y) < 0) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])); }
      xs.sort((u, v) => u - v);
      let w = Infinity;
      for (let i = 1; i + 1 < xs.length; i += 2) w = Math.min(w, xs[i + 1] - xs[i]);
      return w;
    };
    const cb = bboxOf([card.outer]), fb = bboxOf([foot.outer]);
    expect(slotWidth(card, cb.y1 - 2)).toBeCloseTo(3.1, 2);
    expect(slotWidth(foot, fb.y0 + 2)).toBeCloseTo(3.1, 2);
    expect(out.parts).toHaveLength(2);
  });

  it("bag tags get a strap slot clear of the name", () => {
    const out = build({ kind: { kind: "bagtag" }, names: { list: "Oliver" }, shape: { kind: "rounded", width: 90, height: 55 }, strap: { length: 24, width: 5 } });
    const pt = out.parts[0];
    const slot = pt.holes.find((h) => { const b = bboxOf([h]); return Math.abs(b.x1 - b.x0 - 24) < 0.1 && Math.abs(b.y1 - b.y0 - 5) < 0.1; })!;
    expect(slot).toBeTruthy();
    const sb = bboxOf([slot]);
    for (const c of pt.engrave!) for (const q of c) expect(q[1] > sb.y1 || q[0] < sb.x0 || q[0] > sb.x1).toBe(true);
  });

  it("earrings come in pairs and report their weight", () => {
    const q = p({ kind: { kind: "earrings" }, names: { list: "" }, shape: { kind: "teardrop", width: 24, height: 38 }, hang: { hole: 1.8, wall: 1.8 } });
    const out = CHARM.build(q, CTX) as CharmOutput;
    expect(out.parts.map((x) => x.name)).toEqual(["Earring 1 left", "Earring 1 right"]);
    const area = Math.abs(signedArea(out.parts[0].outer));
    expect(out.info!.grams).toBeGreaterThan((area * 3 * 0.68) / 1000 * 0.95);
    const heavy = p({ ...q, shape: { kind: "circle", width: 60, height: 60 } });
    const iss = CHARM.check(heavy, CHARM.build(heavy, CTX)).find((i) => i.code === "CHARM_HEAVY")!;
    expect(iss).toBeTruthy();
    const light = iss.fixes[0].apply(heavy);
    expect(CHARM.check(light, CHARM.build(light, CTX)).map((i) => i.code)).not.toContain("CHARM_HEAVY");
  });

  it("warns when a small charm leaves too little wall, and its fix works", () => {
    const q = p({ shape: { kind: "star", width: 12, height: 12, corner: 0 }, hang: { kind: "hole", hole: 5, wall: 3 }, names: { list: "" } });
    const iss = CHARM.check(q, CHARM.build(q, CTX)).find((i) => i.code === "CHARM_HOLE_WALL")!;
    expect(iss).toBeTruthy();
    const loop = iss.fixes.find((f) => f.id === "loop")!.apply(q);
    expect(CHARM.check(loop, CHARM.build(loop, CTX)).map((i) => i.code)).not.toContain("CHARM_HOLE_WALL");
  });

  it("picking a kind starts from its sizes and hanging", () => {
    const field = CHARM.sections[0].fields[0] as { apply: (q: CharmParams, v: string) => CharmParams };
    const k = field.apply(p({}), "keychain");
    expect(k.hang.side).toBe("left");
    expect(k.hang.hole).toBe(5);
    expect(field.apply(p({}), "earrings").hang.hole).toBeLessThan(2.5);
  });

  it("a gift card holder stacks back, pocket, front and name, and the pocket fits the card", () => {
    const out = build({ kind: { kind: "cardholder" }, names: { list: "Henry" }, shape: { kind: "rounded", width: 106, height: 78 }, card: { width: 85.6, height: 54, clearance: 1, lip: 5 } });
    expect(out.parts.map((q) => q.id)).toEqual(["charm-1-back", "charm-1-spacer", "charm-1-front", "charm-1-name"]);
    expect(out.parts.map((q) => q.place!.z)).toEqual([0, 3, 6, 9]);
    const spacer = out.parts[1];
    // the pocket opens through the top: the spacer's outline dips to the pocket's floor
    const xs = spacer.outer.filter((q) => Math.abs(q[1] - (78 - (106 - 87.6) / 2)) < 0.05).map((q) => q[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(87.6, 1);
    expect(out.parts[3].material).toBe("second");
    expect(CHARM.pro!(p({ kind: { kind: "cardholder" } }), out)).toMatch(/Pro/);
  });

  it("a dangle hangs under the charm from a bottom hole, with its own words", () => {
    const out = build({ names: { list: "Ann" }, shape: { kind: "circle", width: 60, height: 60 }, dangle: { on: true, shape: "heart", size: 22, text: "2026", hole: 3 } });
    expect(out.parts).toHaveLength(2);
    const main = out.parts[0], d = out.parts[1];
    const low = main.holes.map((h) => bboxOf([h])).sort((a, b) => b.y1 - a.y1)[0];
    expect(low.y1).toBeGreaterThan(50);
    expect(d.holes).toHaveLength(1);
    expect(d.engrave!.length).toBeGreaterThan(0);
  });

  it("every preset builds, exports and opens without a warning", () => {
    for (const pr of CHARM.presets) {
      const q = p(pr.params);
      const out = CHARM.build(q, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(out.parts.length, pr.id).toBeGreaterThan(0);
      const bad = CHARM.check(q, out).filter((i) => i.level !== "info");
      expect(bad.map((i) => i.code), pr.id).toEqual([]);
      for (const pt of out.parts) expect(onePiece(pt) || pt.holes.length > 0, `${pr.id} ${pt.name}`).toBe(true);
      const a = arrangeGenerator(CHARM, q, CTX);
      expect(genSVG(CHARM, a.params, a.lay!, "", a.sheets)).toContain("<svg");
    }
  });
});
