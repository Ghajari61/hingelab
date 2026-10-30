import { describe, expect, it } from "vitest";
import { bboxOf, distToContour, pointInContour, signedArea } from "../geom";
import { CHARM } from "../charm";
import { type CharmOutput } from "../charm/build";
import { MAGNET_WALL } from "../charm/check";
import { mergeCharm, type CharmParams } from "../charm/params";
import type { Contour, GenPart } from "../types";
import { CTX } from "./ctx";

const p = (raw: unknown) => mergeCharm(raw);
const build = (raw: unknown) => CHARM.build(p(raw), CTX) as CharmOutput;
const codes = (q: CharmParams) => CHARM.check(q, CHARM.build(q, CTX)).map((i) => i.code);
const round = (h: Contour) => { const b = bboxOf([h]); return Math.abs((b.x1 - b.x0) - (b.y1 - b.y0)) < 0.05; };
const kindField = () => CHARM.sections[0].fields[0] as unknown as { apply: (q: CharmParams, v: string) => CharmParams };

describe("Name Charms: bookmarks", () => {
  it("picking Bookmarks starts tall, with a tassel hole and the name along the length", () => {
    const q = kindField().apply(p({}), "bookmark");
    expect(q.shape.height).toBeGreaterThan(q.shape.width * 3);
    expect(q.hang.kind).toBe("hole");
    expect(q.names.along).toBe(true);
    // other kinds keep the name across
    expect(kindField().apply(q, "keychain").names.along).toBe(false);
  });

  it("the name turned along the length is taller than wide, fits the margin and keeps clear of the hole", () => {
    const out = build({ kind: { kind: "bookmark" }, names: { list: "Christopher", along: true, size: 16 }, shape: { kind: "rounded", width: 40, height: 150, margin: 4 }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 } });
    const pt = out.parts[0];
    const eb = bboxOf(pt.engrave!);
    expect(eb.y1 - eb.y0).toBeGreaterThan((eb.x1 - eb.x0) * 2);
    const hole = pt.holes.find(round)!, hb = bboxOf([hole]);
    for (const c of pt.engrave!) for (const q of c) {
      expect(distToContour(q, pt.outer)).toBeGreaterThan(4 - 0.3);
      expect(q[1]).toBeGreaterThan(hb.y1);
    }
    // across, the same name would have had to shrink much more
    const across = build({ kind: { kind: "bookmark" }, names: { list: "Christopher", along: false, size: 16 }, shape: { kind: "rounded", width: 40, height: 150, margin: 4 } });
    expect(out.info!.letter).toBeGreaterThan(across.info!.letter * 2);
  });

  it("thick bookmarks get a note", () => {
    expect(codes(p({ kind: { kind: "bookmark" }, material: "birch6", T: 6 }))).toContain("CHARM_THICK_BOOKMARK");
    expect(codes(p({ kind: { kind: "bookmark" } }))).not.toContain("CHARM_THICK_BOOKMARK");
  });
});

describe("Name Charms: fridge magnets", () => {
  it("a magnet is a face and a back layer of the same outline with a pocket for each magnet", () => {
    const out = build({ kind: { kind: "magnet" }, names: { list: "Ava" }, shape: { kind: "rounded", width: 80, height: 40 }, hang: { kind: "hole" }, magnet: { diameter: 10, thickness: 2, count: 2, clearance: 0.2 } });
    expect(out.parts.map((q) => q.id)).toEqual(["charm-1", "charm-1-back"]);
    const [face, back] = out.parts;
    // a magnet never hangs: no hole in the face
    expect(face.holes).toHaveLength(0);
    expect(back.outer).toEqual(face.outer);
    expect(back.place!.z).toBe(-3);
    const pockets = back.holes.filter(round);
    expect(pockets).toHaveLength(2);
    for (const h of pockets) {
      const b = bboxOf([h]);
      expect(b.x1 - b.x0).toBeCloseTo(10.2, 1);
      expect(distToContour([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], back.outer) - 5.1).toBeGreaterThanOrEqual(MAGNET_WALL);
    }
    expect(out.stats.find((s) => s.label === "Magnets")!.value).toMatch(/2 × Ø 10 × 2 mm/);
  });

  it("a magnet thicker than the stock is flagged and the fix makes it flush", () => {
    const q = p({ kind: { kind: "magnet" }, magnet: { thickness: 5 } });
    const iss = CHARM.check(q, CHARM.build(q, CTX)).find((i) => i.code === "CHARM_MAGNET_PROUD")!;
    expect(iss.level).toBe("warn");
    const fixed = iss.fixes[0].apply(q);
    expect(fixed.magnet.thickness).toBe(3);
    expect(codes(fixed)).not.toContain("CHARM_MAGNET_PROUD");
  });

  it("a pocket too close to the edge is flagged, and growing the piece clears it", () => {
    const q = p({ kind: { kind: "magnet" }, names: { list: "" }, shape: { kind: "circle", width: 14, height: 14 }, magnet: { diameter: 12, count: 1 } });
    const iss = CHARM.check(q, CHARM.build(q, CTX)).find((i) => i.code === "CHARM_MAGNET_WALL")!;
    expect(iss).toBeTruthy();
    let r = q;
    for (let k = 0; k < 4 && codes(r).includes("CHARM_MAGNET_WALL"); k++) r = iss.fixes[0].apply(r);
    expect(codes(r)).not.toContain("CHARM_MAGNET_WALL");
  });

  it("the hanging section hides for magnets and the magnet section shows", () => {
    const q = p({ kind: { kind: "magnet" } });
    expect(CHARM.sections.find((s) => s.id === "hang")!.show!(q)).toBe(false);
    expect(CHARM.sections.find((s) => s.id === "magnet")!.show!(q)).toBe(true);
    expect(CHARM.sections.find((s) => s.id === "magnet")!.show!(p({}))).toBe(false);
  });
});

describe("Name Charms: inlay", () => {
  it("cuts the letters through the face and the same letters in the second material, over a backing", () => {
    const out = build({ kind: { kind: "keychain" }, names: { list: "AVA", fontId: "archivo-black", size: 11 }, style: { kind: "inlay" }, shape: { kind: "pill", width: 66, height: 26 }, hang: { kind: "hole", side: "left", hole: 5, wall: 3 }, mat: { mat2: "walnut-3", T2: 3 } });
    const face = out.parts.find((q) => q.id === "charm-1")!, back = out.parts.find((q) => q.id === "charm-1-back")!;
    const inlays = out.parts.filter((q) => /-inlay/.test(q.id));
    expect(inlays.length).toBeGreaterThanOrEqual(3);
    for (const q of inlays) { expect(q.material).toBe("second"); expect(q.t).toBe(3); }
    // every inlay piece fills one letter hole of the face exactly
    const letterHoles = face.holes.filter((h) => !round(h));
    expect(letterHoles).toHaveLength(inlays.length);
    const area = (cs: Contour[]) => cs.reduce((s, c) => s + Math.abs(signedArea(c)), 0);
    expect(area(inlays.map((q) => q.outer))).toBeCloseTo(area(letterHoles), 3);
    for (const q of inlays) { const b = bboxOf([q.outer]); expect(pointInContour([(b.x0 + b.x1) / 2, b.y0 + 0.4], face.outer)).toBe(true); }
    // the backing keeps the ring hole but no letter holes
    expect(back.outer).toEqual(face.outer);
    expect(back.holes.filter(round)).toHaveLength(1);
    expect(back.holes).toHaveLength(1);
    expect(CHARM.pro!(p({ style: { kind: "inlay" } }), out)).toMatch(/Inlay/);
    expect(out.stats.find((s) => s.label === "Inlay")!.value).toMatch(/flush/);
  });

  it("letters of another thickness are noted and the fix makes them flush", () => {
    const q = p({ names: { list: "Ava" }, style: { kind: "inlay" }, mat: { mat2: "acrylic-gold", T2: 2 } });
    const iss = CHARM.check(q, CHARM.build(q, CTX)).find((i) => i.code === "CHARM_INLAY_DEPTH")!;
    expect(iss.level).toBe("info");
    expect(codes(iss.fixes[0].apply(q))).not.toContain("CHARM_INLAY_DEPTH");
  });
});

describe("Name Charms: two-tier earrings", () => {
  it("each earring of a pair gets its own dangle, and its weight counts toward the earring's", () => {
    const base = { kind: { kind: "earrings" }, names: { list: "" }, shape: { kind: "arch", width: 22, height: 24 }, hang: { kind: "hole", side: "top", hole: 1.8, wall: 1.8 } };
    const plain = build(base);
    const out = build({ ...base, dangle: { on: true, shape: "teardrop", size: 18, text: "", hole: 1.8 } });
    const dangles = out.parts.filter((q: GenPart) => /dangle/.test(q.id));
    expect(dangles.map((q) => q.id)).toEqual(["charm-1-l-dangle", "charm-1-r-dangle"]);
    // the earrings have a second, lower hole for the jump ring
    const ear = out.parts.find((q) => q.id === "charm-1-l")!;
    expect(ear.holes.filter(round)).toHaveLength(2);
    expect(out.info!.grams).toBeGreaterThan(plain.info!.grams * 1.2);
    // the dangles do not overlap the earrings on the sheet
    const boxes = out.parts.map((q) => { const b = bboxOf([q.outer]); return { x0: b.x0 + q.place!.x, x1: b.x1 + q.place!.x, y0: b.y0 + q.place!.y, y1: b.y1 + q.place!.y }; });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${out.parts[i].id} ${out.parts[j].id}`).toBe(true);
    }
  });

  it("the dangle section shows for earrings", () => {
    expect(CHARM.sections.find((s) => s.id === "dangle")!.show!(p({ kind: { kind: "earrings" } }))).toBe(true);
  });
});

describe("Name Charms: new presets", () => {
  it.each(["name-bookmarks", "teacher-bookmarks", "family-magnets", "new-home-magnet", "inlay-keychains", "statement-earrings", "pet-id-tags"])("%s builds clean", (id) => {
    const pr = CHARM.presets.find((x) => x.id === id)!;
    expect(pr).toBeTruthy();
    const q = p(pr.params), out = CHARM.build(q, CTX);
    expect(out.error).toBeUndefined();
    expect(CHARM.check(q, out).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
  });
});
