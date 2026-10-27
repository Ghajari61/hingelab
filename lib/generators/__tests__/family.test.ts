import { describe, expect, it } from "vitest";
import { unionShapes } from "@/lib/letters/polygon";
import { bboxOf, distToContour, pointInContour } from "../geom";
import { arrangeGenerator, genSVG } from "../output";
import { FAMILY } from "../family";
import { crossword, tileWord } from "../family/crossword";
import { mergeFamily } from "../family/params";
import type { FamilyOutput } from "../family/build";
import { letterScores, overlapScores } from "../weldScore";
import type { GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => FAMILY.build(mergeFamily(raw), CTX) as FamilyOutput;
const onePiece = (pt: GenPart) => unionShapes([pt.outer, ...pt.holes]).length === 1;

/** Every horizontal and vertical run of two or more letters in the grid. */
function runs(cells: Map<string, string>, x0: number, y0: number, w: number, h: number): string[] {
  const at = (x: number, y: number) => cells.get(`${x},${y}`) ?? "";
  const out: string[] = [];
  for (let y = y0; y < y0 + h; y++) { let r = ""; for (let x = x0; x <= x0 + w; x++) { const c = at(x, y); if (c) r += c; else { if (r.length > 1) out.push(r); r = ""; } } }
  for (let x = x0; x < x0 + w; x++) { let r = ""; for (let y = y0; y <= y0 + h; y++) { const c = at(x, y); if (c) r += c; else { if (r.length > 1) out.push(r); r = ""; } } }
  return out;
}

describe("Family Names: crossword", () => {
  it("crosses every name and makes no accidental words", () => {
    const words = ["OLIVIA", "NOAH", "AVA", "LIAM", "MUM", "DAD"];
    const g = crossword(words);
    expect(g.skipped).toEqual([]);
    expect(runs(g.cells, g.x0, g.y0, g.w, g.h).sort()).toEqual([...words].sort());
  });

  it("reports names that cannot cross", () => {
    const g = crossword(["BOB", "XYZ"]);
    expect(g.skipped).toEqual(["XYZ"]);
    const out = build({ layout: { kind: "crossword" }, names: { list: "Bob\nXyz" } });
    const iss = FAMILY.check(mergeFamily({ layout: { kind: "crossword" }, names: { list: "Bob\nXyz" } }), out);
    expect(iss.map((i) => i.code)).toContain("FAMILY_UNCROSSED");
  });

  it("tile words keep letters only, in capitals", () => {
    expect(tileWord("Mary-Jane O'Neil")).toBe("MARYJANEONEIL");
  });

  it("is one piece with the letters engraved inside the tiles", () => {
    const out = build({ layout: { kind: "crossword" } });
    expect(out.parts).toHaveLength(1);
    const pt = out.parts[0];
    expect(onePiece(pt)).toBe(true);
    for (const c of pt.engrave!) for (const q of c) expect(pointInContour(q, pt.outer)).toBe(true);
  });
});

describe("Family Names: welded layouts", () => {
  it("a name tree is one piece, narrow at the top and wide at the bottom, with overlaps scored", () => {
    const out = build({ layout: { kind: "tree" }, names: { list: "Ava\nAiden\nMason\nAllison\nIsabella\nMadison\nBenjamin" } });
    const pt = out.parts[0];
    expect(onePiece(pt)).toBe(true);
    const b = bboxOf([pt.outer]);
    const widthAt = (y: number) => { const xs = pt.outer.filter((q) => Math.abs(q[1] - y) < (b.y1 - b.y0) * 0.04).map((q) => q[0]); return xs.length ? Math.max(...xs) - Math.min(...xs) : 0; };
    expect(widthAt(b.y0 + (b.y1 - b.y0) * 0.3)).toBeLessThan(widthAt(b.y0 + (b.y1 - b.y0) * 0.8));
    // a loop at the top keeps its wall
    const hole = pt.holes.find((h) => bboxOf([h]).y0 < b.y0 + 15)!;
    const hb = bboxOf([hole]);
    expect(distToContour([(hb.x0 + hb.x1) / 2, (hb.y0 + hb.y1) / 2], pt.outer) - (hb.x1 - hb.x0) / 2).toBeGreaterThanOrEqual(2.5 - 0.1);
  });

  it("a backer puts the names in the second material on a bigger silhouette", () => {
    const out = build({ layout: { kind: "tree" }, backer: { on: true, offset: 3 } });
    expect(out.parts.map((q) => q.id)).toEqual(["backer", "piece"]);
    const back = bboxOf([out.parts[0].outer]), front = bboxOf([out.parts[1].outer]);
    expect(back.x1 - back.x0).toBeGreaterThan(front.x1 - front.x0 + 5);
    expect(out.parts[1].material).toBe("second");
  });

  it("a snowflake has an arm per name and one piece", () => {
    const out = build({ layout: { kind: "snowflake" }, names: { list: "David\nSarah\nBryan\nOlivia\nEmma\nDaniel" } });
    expect(onePiece(out.parts[0])).toBe(true);
    expect(out.info!.letter).toBeGreaterThan(5);
  });

  it("welded names score every letter's outline", () => {
    const t = CTX.text!("AVA", "archivo-black", 10)!;
    expect(letterScores(t.glyphs!).length).toBeGreaterThanOrEqual(4);
  });

  it("overlap scores lie inside the welded letters", () => {
    const t = CTX.text!("Olivia", "pacifico", 20, -1)!;
    expect(t.glyphs!.length).toBe(6);
    const sc = overlapScores(t.glyphs!);
    expect(sc.length).toBeGreaterThan(0);
    const u = unionShapes(t.contours);
    for (const c of sc) for (const q of c) expect(u.some((s) => pointInContour(q, s.outer))).toBe(true);
  });
});

describe("Family Names: plates and flags", () => {
  it("a ring keeps the names round the edge inside the plate", () => {
    const out = build({ layout: { kind: "ring" } });
    const pt = out.parts[0];
    for (const c of pt.engrave!) for (const q of c) expect(Math.hypot(q[0], q[1])).toBeLessThan(45);
  });

  it("a split monogram is one piece with the name on the band", () => {
    const out = build({ layout: { kind: "monogram" }, names: { list: "Noah" } });
    expect(onePiece(out.parts[0])).toBe(true);
    expect(out.parts[0].engrave!.length).toBeGreaterThan(0);
  });

  it("bunting makes a flag per letter, a blank between words, with two cord holes each", () => {
    const out = build({ layout: { kind: "bunting" }, names: { list: "Hi\nYou" }, bunting: { spacer: true } });
    expect(out.parts).toHaveLength(6);
    for (const pt of out.parts) expect(pt.holes.filter((h) => { const b = bboxOf([h]); return Math.abs(b.x1 - b.x0 - 4) < 0.05; }).length).toBe(2);
  });

  it("every preset builds, exports and opens without a warning", () => {
    for (const pr of FAMILY.presets) {
      const q = mergeFamily(pr.params);
      const out = FAMILY.build(q, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(FAMILY.check(q, out).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
      const a = arrangeGenerator(FAMILY, q, CTX);
      expect(genSVG(FAMILY, a.params, a.lay!, "", a.sheets), pr.id).toContain("<svg");
    }
  }, 120000);
});
