import { describe, expect, it } from "vitest";
import { bboxOf } from "../geom";
import { arrangeGenerator } from "../output";
import { SIGN } from "../sign";
import type { SignOutput } from "../sign/build";
import { mergeSign } from "../sign/params";
import { CTX } from "./ctx";

const build = (raw: unknown) => SIGN.build(mergeSign(raw), CTX) as SignOutput;
const issues = (raw: unknown) => { const p = mergeSign(raw); return SIGN.check(p, SIGN.build(p, CTX)); };

describe("sign", () => {
  it("every preset builds with no errors or warnings", () => {
    for (const pr of SIGN.presets) {
      const p = SIGN.merge(pr.params);
      const out = SIGN.build(p, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(SIGN.check(p, out).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
    }
  });

  it("an inlay cuts the letters out, fills them from the second material and puts the counters back", () => {
    const out = build({ style: { kind: "inlay" }, text: { text: "HOME", fontId: "archivo-black", size: 40 }, motif: { kind: "none" }, mount: { kind: "none" } });
    const board = out.parts.find((p) => p.id === "board")!;
    const inlays = out.parts.filter((p) => p.id.startsWith("inlay"));
    const counters = out.parts.filter((p) => p.id.startsWith("counter"));
    expect(inlays.length).toBeGreaterThanOrEqual(4);
    expect(inlays.every((p) => p.material === "second")).toBe(true);
    expect(board.holes.length).toBe(inlays.length);
    expect(counters.length).toBe(inlays.reduce((n, p) => n + p.holes.length, 0));
    expect(counters.length).toBeGreaterThan(0);
    expect(out.parts.some((p) => p.id === "backer")).toBe(true);
    expect(SIGN.pro!(mergeSign({ style: { kind: "inlay" } }), out)).toMatch(/Pro/);
  });

  it("mirrors the engraving about the board's centre for back engraving", () => {
    const raw = { text: { text: "AB" }, motif: { kind: "none" }, border: { kind: "none" }, mount: { kind: "none" } };
    const a = build(raw), b = build({ ...raw, style: { mirror: true } });
    const W = a.info!.W;
    const ea = bboxOf(a.parts[0].engrave!), eb = bboxOf(b.parts[0].engrave!);
    expect(eb.x0).toBeCloseTo(W - ea.x1, 6);
    expect(eb.x1).toBeCloseTo(W - ea.x0, 6);
  });

  it("a desk stand adds two tabs under the board and matching slots in the base", () => {
    const T = 3;
    const out = build({ T, board: { shape: "rect", auto: false, width: 200, height: 80 }, mount: { kind: "stand", depth: 60 } });
    const board = out.parts[0], base = out.parts.find((p) => p.id === "base")!;
    expect(bboxOf([board.outer]).y1).toBeCloseTo(80 + T, 6);
    expect(base.holes).toHaveLength(2);
    for (const h of base.holes) {
      const b = bboxOf([h]);
      expect(b.y1 - b.y0).toBeCloseTo(T, 6);
      expect(b.y0).toBeCloseTo(30 - T / 2, 6);
    }
    expect(board.place!.y).toBeCloseTo(-(80 + T), 6);
  });

  it("a cut-out word is one piece and says it cannot take screw holes", () => {
    const out = build({ style: { kind: "word" }, text: { text: "Love" }, motif: { kind: "none" }, mount: { kind: "keyhole" } });
    expect(out.parts).toHaveLength(1);
    expect(issues({ style: { kind: "word" }, text: { text: "Love" }, mount: { kind: "keyhole" } }).some((i) => i.code === "WORD_MOUNT")).toBe(true);
  });

  it("hanging holes follow the top edge of shaped boards", () => {
    for (const shape of ["cloud", "scalloped", "heart", "arch", "circle"]) {
      const found = issues({ board: { shape }, mount: { kind: "hanging" } });
      expect(found.some((i) => i.code === "MOUNT_OUTSIDE"), shape).toBe(false);
    }
  });

  it("knocks the text out of a motif behind it", () => {
    const raw = { text: { text: "Garden" }, motif: { kind: "leaf", side: "behind", size: 150 }, border: { kind: "none" }, mount: { kind: "none" } };
    const out = build(raw);
    const plain = build({ ...raw, text: { text: "" } });
    expect(out.parts[0].engrave!.length).toBeGreaterThan(plain.parts[0].engrave!.length);
  });

  it("layered letters are one bridged piece, or every letter on its own", () => {
    const raw = { style: { kind: "layered" }, text: { text: "Hi you" }, motif: { kind: "none" } };
    expect(build(raw).parts.filter((p) => p.material === "second")).toHaveLength(1);
    expect(build({ ...raw, style: { kind: "layered", join: false } }).parts.filter((p) => p.material === "second").length).toBeGreaterThan(1);
  });

  it("layered letters go on their own material's sheet", () => {
    const a = arrangeGenerator(SIGN, mergeSign({ style: { kind: "layered" }, mat: { mat2: "acrylic-gold" } }), CTX);
    expect(a.sheets!.at(-1)!.label).toMatch(/acrylic/i);
  });

  it("flags text that runs off a fixed-size board", () => {
    const i = issues({ board: { auto: false, width: 80, height: 60 }, text: { size: 60 } }).find((x) => x.code === "TEXT_WIDE")!;
    expect(i).toBeDefined();
    expect(i.fixes[0].apply(mergeSign({})).board.auto).toBe(true);
  });
});
