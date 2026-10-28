/**
 * Text operations across the generators (lib/generators/textOps.ts): Engrave, Score and raised
 * (separately cut) lettering, with No Weld. Shared geometry, each integrated generator, 3D, the cut
 * file (cut regions and score lines), second-material sheets and older saves.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { clipLines, cleanMark, cleanNoWeld, joinLettering, markLetters, moveLettering, raisedLetters } from "../textOps";
import { arrangeGenerator, flatOf, genSVG } from "../output";
import { generatorScene } from "../scene3d";
import { flatScene } from "@/lib/three/flat";
import { assertFlatMatchesSVG } from "@/lib/three/__tests__/flatExportAssertions";
import { readScene } from "@/lib/export/scene";
import { pointInContour, rect } from "../geom";
import { TABLENUM } from "../tablenum";
import { KEYRACK } from "../keyrack";
import { TROPHY } from "../trophy";
import { PUZZLE } from "../puzzle";
import { CLOCK } from "../clock";
import { QR } from "../qr";
import { POPUP } from "../popup";
import { KEYCHAIN } from "../keychain";
import { textBlock } from "../weld";
import type { AnyGenerator, Contour, GenOutput, GenPart } from "../types";
import { CTX } from "./ctx";

const length = (cs: Contour[]) => cs.reduce((n, c) => n + c.slice(1).reduce((m, q, i) => m + Math.hypot(q[0] - c[i][0], q[1] - c[i][1]), 0), 0);
const scoreOf = (parts: GenPart[]) => parts.flatMap((p) => p.score ?? []);

/** The design laid out: SVG cut regions match Lay Flat, and the SVG's score layer is exactly the parts' score lines. */
function expectExportParity(def: AnyGenerator, raw: Record<string, unknown>, label: string) {
  const p = def.merge(raw), a = arrangeGenerator(def, p, CTX);
  if ("error" in a.result) throw Error(`${label}: ${a.result.error}`);
  const svg = genSVG(def, a.params, a.lay!);
  const flat = flatScene(flatOf(a.lay!), p.T);
  try { assertFlatMatchesSVG(flat.group, svg); } finally { flat.dispose(); }
  const svgScore = readScene(svg).layers.filter((l) => /Score/.test(l.label)).flatMap((l) => l.items.flatMap((it) => it.polys.map((q) => q.pts)));
  const partScore = a.lay!.items.flatMap((it) => it.pt.score);
  expect(length(svgScore), `${label}: scored length in the SVG`).toBeCloseTo(length(partScore), 0);
  return { out: a.result.out, a, svg };
}

/** 3D: each scored item is drawn as lines on its part. */
function expectScoredIn3D(out: GenOutput, T: number, item: string, label: string) {
  const scene = generatorScene(out, T);
  try {
    const names: string[] = [];
    scene.group.traverse((o) => { if (o instanceof THREE.LineSegments && o.name.endsWith(`${item} engraving lines`)) names.push(o.name); });
    expect(names.length, `${label}: ${item} lines in 3D`).toBeGreaterThan(0);
  } finally { scene.dispose(); }
}

describe("shared text operations", () => {
  // two overlapping squares and a separate dot, as three "glyphs"
  const a = rect(0, 0, 10, 10), b = rect(6, 0, 10, 10), dot = rect(30, 0, 3, 3);
  const t = { contours: [a, b, dot], glyphs: [[a], [b], [dot]] };
  it("engraving is the filled union either way", () => {
    expect(markLetters(t, "engrave", false)).toEqual(markLetters(t, "engrave", true));
    expect(markLetters(t, "engrave").engrave).toHaveLength(2);
  });
  it("welded scoring traces the joined outline; No Weld traces every glyph, overlaps included", () => {
    const welded = markLetters(t, "score", false).score!, own = markLetters(t, "score", true).score!;
    expect(welded).toHaveLength(2);
    expect(own).toHaveLength(3);
    expect(length(own)).toBeGreaterThan(length(welded));
    for (const c of [...welded, ...own]) expect(c[0]).toEqual(c[c.length - 1]);
  });
  it("raised letters: one welded piece, or one piece per glyph with No Weld", () => {
    expect(raisedLetters(t, { border: 0.5, noWeld: false })).toHaveLength(1);
    expect(raisedLetters(t, { border: 0.5, noWeld: true })).toHaveLength(3);
    expect(raisedLetters({ contours: [] }, { border: 0 })).toEqual([]);
  });
  it("without glyphs No Weld falls back to the welded shapes", () => {
    expect(raisedLetters({ contours: [a, b] }, { border: 0, noWeld: true })).toHaveLength(1);
  });
  it("lettering moves and joins with its glyphs", () => {
    const m = moveLettering(t, (c) => c.map(([x, y]) => [x + 5, y] as [number, number]));
    expect(m.glyphs![2][0][0]).toEqual([35, 0]);
    expect(joinLettering([t, { contours: [a] }]).glyphs).toBeUndefined();
    expect(joinLettering([t, t]).glyphs).toHaveLength(6);
  });
  it("score lines are kept to the wood: they stop at holes and the outline", () => {
    const line: Contour = [[-5, 5], [25, 5]];
    const runs = clipLines([line], rect(0, 0, 20, 10), [rect(8, 0, 4, 10)]);
    expect(runs).toHaveLength(2);
    for (const r of runs) for (const q of r) expect(q[0] >= 0 && q[0] <= 20 && !(q[0] > 8 && q[0] < 12)).toBe(true);
  });
  it("older saves keep their behaviour", () => {
    expect(cleanMark(undefined, ["engrave", "score"] as const, "engrave")).toBe("engrave");
    expect(cleanMark("raised", ["engrave", "score"] as const, "engrave")).toBe("engrave");
    expect(cleanMark("score", ["engrave", "score"] as const, "engrave")).toBe("score");
    for (const v of [undefined, "true", 1, null]) expect(cleanNoWeld(v)).toBe(false);
    expect(cleanNoWeld(true)).toBe(true);
  });
  it("styled text keeps its glyphs for No Weld", () => {
    const s = textBlock(CTX, "hello", "pacifico", 20, { noWeld: true, style: { slant: 10 } });
    expect(s.glyphs?.length).toBe(5);
  });
});

describe("raised letters with No Weld (two materials)", () => {
  for (const [def, raw, label] of [
    [TABLENUM, { text: { mark: "raised", label: "Table" }, batch: { mode: "list", list: "iji" } }, "table numbers"],
    [KEYRACK, { text: { mark: "raised", text: "iji" } }, "key rack"],
  ] as const) it(`${label}: every glyph and dot is its own second-material piece on its own sheets`, () => {
    const welded = (def as AnyGenerator).build((def as AnyGenerator).merge(raw), CTX);
    const own = (def as AnyGenerator).build((def as AnyGenerator).merge({ ...raw, text: { ...raw.text, noWeld: true } }), CTX);
    const second = (o: GenOutput) => o.parts.filter((q) => q.material === "second");
    expect(second(own).length, label).toBeGreaterThan(second(welded).length);
    // the dots of i and j are pieces of their own
    expect(second(own).length, label).toBeGreaterThanOrEqual(5);
    const { a } = expectExportParity(def as AnyGenerator, { ...raw, text: { ...raw.text, noWeld: true } }, label);
    // every sheet holds one material: the second-material letters never share a sheet with the board
    const sheetOf = (it: NonNullable<typeof a.lay>["items"][number]) => a.sheets!.findIndex((r) => it.ox + it.w / 2 >= r.x && it.ox + it.w / 2 <= r.x + r.w && it.oy + it.h / 2 >= r.y && it.oy + it.h / 2 <= r.y + r.h);
    const bySheet = new Map<number, Set<boolean>>();
    for (const it of a.lay!.items) { const k = sheetOf(it); bySheet.set(k, (bySheet.get(k) ?? new Set()).add(it.pt.src.material === "second")); }
    expect([...bySheet.values()].some((v) => v.has(true)), `${label}: second material laid out`).toBe(true);
    for (const v of bySheet.values()) expect(v.size, `${label}: one material per sheet`).toBe(1);
  });
  it("keychain: raised details stay separate glyph pieces with No Weld", () => {
    const raw = { style: "layered", text: { name: "Lolly", fontId: "pacifico" } };
    const welded = KEYCHAIN.build(KEYCHAIN.merge(raw), CTX), own = KEYCHAIN.build(KEYCHAIN.merge({ ...raw, text: { ...raw.text, noWeld: true } }), CTX);
    const n = (o: GenOutput) => o.parts.filter((q) => q.id.startsWith("detail-")).length;
    expect(welded.error).toBeUndefined();
    expect(n(own)).toBeGreaterThan(n(welded));
    expectExportParity(KEYCHAIN, { ...raw, text: { ...raw.text, noWeld: true } }, "keychain");
  });
});

describe("scored lettering", () => {
  // each case: the generator, the scored settings, the same lettering engraved, the scored item, a label
  const cases: [AnyGenerator, Record<string, unknown>, Record<string, unknown>, string, string][] = [
    [TABLENUM, { text: { mark: "score", noWeld: true, label: "hello", labelFont: "pacifico" } }, { text: { mark: "engrave", label: "hello", labelFont: "pacifico" } }, "Label", "table numbers"],
    [KEYRACK, { text: { mark: "score", noWeld: true, text: "hello", fontId: "pacifico" } }, { text: { mark: "engrave", text: "hello", fontId: "pacifico" } }, "Text", "key rack"],
    [TROPHY, { mark: { kind: "score", noWeld: true }, plate: { on: true, name: "hello", fontId: "pacifico" } }, { mark: { kind: "engrave" }, plate: { on: true, name: "hello", fontId: "pacifico" } }, "Name", "trophy"],
    [PUZZLE, { engrave: { kind: "text", text: "hello", fontId: "pacifico", mark: "score", noWeld: true } }, { engrave: { kind: "text", text: "hello", fontId: "pacifico" } }, "Text", "puzzle text"],
    [PUZZLE, { engrave: { kind: "numbers", mark: "score" } }, { engrave: { kind: "numbers" } }, "Numbers", "puzzle numbers"],
    [CLOCK, { inscription: { text: "hello", fontId: "pacifico", mark: "score", noWeld: true } }, { inscription: { text: "hello", fontId: "pacifico" } }, "Inscription", "clock inscription"],
    [CLOCK, { markers: { style: "numerals", mark: "score" } }, { markers: { style: "numerals" } }, "Numerals", "clock numerals"],
    [QR, { label: { text: "Scan me", mark: "score" } }, { label: { text: "Scan me" } }, "Label", "QR label"],
  ];
  for (const [def, raw, engraved, item, label] of cases) it(`${label}: scored, not engraved, in the SVG, Lay Flat and 3D`, () => {
    const p = def.merge(raw), out = def.build(p, CTX), base = def.build(def.merge(engraved), CTX);
    expect(out.error, label).toBeUndefined();
    expect(scoreOf(out.parts).length, label).toBeGreaterThan(scoreOf(base.parts).length);
    // the item's engraving is gone, every other mark is unchanged
    expect(out.parts.flatMap((q) => q.engrave ?? []).length, label).toBeLessThan(base.parts.flatMap((q) => q.engrave ?? []).length);
    expectExportParity(def, raw, label);
    expectScoredIn3D(out, p.T, item, label);
  });

  it("No Weld scores every glyph of a joined script on its own", () => {
    for (const [def, raw, path] of [
      [KEYRACK, { text: { mark: "score", text: "hello", fontId: "pacifico" } }, "text"],
      [TROPHY, { mark: { kind: "score" }, plate: { on: true, name: "hello", fontId: "pacifico" } }, "mark"],
      [PUZZLE, { engrave: { kind: "text", text: "hello", fontId: "pacifico", mark: "score" } }, "engrave"],
    ] as const) {
      const d = def as AnyGenerator, r = raw as Record<string, Record<string, unknown>>;
      const welded = scoreOf(d.build(d.merge(r), CTX).parts), own = scoreOf(d.build(d.merge({ ...r, [path]: { ...r[path], noWeld: true } }), CTX).parts);
      expect(length(own), d.id).toBeGreaterThan(length(welded));
    }
  });
});

describe("Pop-up scored engraving", () => {
  for (const kind of ["rings", "spiral"] as const) it(`${kind}: scored text and motifs stay on the wood, bend with the 3D form and match the SVG`, () => {
    const raw = { pattern: { kind }, engraving: { text: "Noor", rim: "for Sam", motif: "stars", fill: true, mark: "score" } };
    const p = POPUP.merge(raw), out = POPUP.build(p, CTX);
    expect(out.error).toBeUndefined();
    const blank = out.parts[0], score = blank.score ?? [];
    expect(score.length).toBeGreaterThan(0);
    // no scored point lies over a cut opening
    const holes = blank.holes;
    for (const c of score) for (const q of c.filter((_, i) => i % 5 === 0)) {
      expect(pointInContour(q, blank.outer)).toBe(true);
      expect(holes.filter((h) => pointInContour(q, h)).length % 2, `${kind}: score over a hole at ${q}`).toBe(0);
    }
    // each 3D piece carries its share of the lines
    expect(blank.views3d!.some((v) => v.score?.length)).toBe(true);
    expectExportParity(POPUP, raw, `popup ${kind}`);
    const scene = generatorScene(out, p.T);
    try {
      let lines = 0, lo = Infinity, hi = -Infinity;
      scene.group.traverse((o) => {
        if (!(o instanceof THREE.LineSegments) || !o.name.endsWith("Engraving engraving lines")) return;
        lines++;
        o.updateWorldMatrix(true, false);
        const pos = o.geometry.getAttribute("position");
        for (let i = 0; i < pos.count; i += 7) { const z = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).z; lo = Math.min(lo, z); hi = Math.max(hi, z); }
      });
      expect(lines).toBeGreaterThan(0);
      // the lines sit on the formed sheet, from the low rim to the raised centre, not on one flat plane
      expect(hi - lo, kind).toBeGreaterThan(p.profile.depth * 0.3);
    } finally { scene.dispose(); }
  });
});

describe("older saves", () => {
  it("open with their engraving and welding unchanged", () => {
    const tn = TABLENUM.merge({ text: { mark: "raised" } });
    expect(tn.text.noWeld).toBe(false);
    expect(KEYRACK.merge({ text: { noWeld: "yes" } }).text.noWeld).toBe(false);
    expect(TROPHY.merge({ mark: { kind: "score" } }).mark.noWeld).toBe(false);
    const pz = PUZZLE.merge({ engrave: { kind: "text", text: "Hi", mark: "glow" } });
    expect([pz.engrave.mark, pz.engrave.noWeld]).toEqual(["engrave", false]);
    const ck = CLOCK.merge({ markers: { style: "numerals" }, inscription: { text: "Hi" } });
    expect([ck.markers.mark, ck.inscription.mark, ck.inscription.noWeld]).toEqual(["engrave", "engrave", false]);
    expect(QR.merge({ label: { text: "Hi" } }).label.mark).toBe("engrave");
    expect(POPUP.merge({ engraving: { text: "Hi", mark: 3 } }).engraving.mark).toBe("engrave");
    expect(KEYCHAIN.merge({ style: "layered" }).text.noWeld).toBe(false);
  });
});
