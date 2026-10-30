import { describe, expect, it } from "vitest";
import { bboxOf } from "../geom";
import { arrangeGenerator } from "../output";
import { SIGN } from "../sign";
import type { SignOutput } from "../sign/build";
import { mergeSign } from "../sign/params";
import { CTX } from "./ctx";
import { LED_FIT, ledChannels } from "../sign/led";

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

describe("sign stands, LED base and back face", () => {
  const T = 3;
  const box = (pt: { outer: number[][] }) => bboxOf([pt.outer as never]);

  it("leaning feet hold the board, tilted back by the lean", () => {
    const out = build({ T, board: { shape: "circle" }, mount: { kind: "feet", depth: 60, lean: 15 } });
    const feet = out.parts.filter((p) => p.id.startsWith("foot"));
    expect(feet).toHaveLength(2);
    expect(feet.every((f) => f.place!.yaw === 90 && box(f).x1 - box(f).x0 === 60)).toBe(true);
    const board = out.parts.find((p) => p.id === "board")!;
    expect(board.place!.tilt).toBe(75);
    expect(out.info!.tip).toBeGreaterThan(0);
    expect(out.assembly!.join(" ")).toMatch(/feet/);
  });

  it("an LED base: one tab as long as the top plate, a slot that fits the panel, and pockets for the LEDs", () => {
    const p = mergeSign({ material: "acr3", T, style: { kind: "neon" }, text: { text: "Glow" }, motif: { kind: "none" }, mount: { kind: "led", depth: 60 }, mat: { mat2: "walnut-3", T2: 3 } });
    const out = SIGN.build(p, CTX) as SignOutput;
    const board = out.parts.find((x) => x.id === "board")!;
    expect(box(board).y1).toBeCloseTo(out.info!.H + 3, 4);
    const top = out.parts.find((x) => x.id === "led-top")!, bottom = out.parts.find((x) => x.id === "led-bottom")!;
    const channels = out.parts.filter((x) => x.id.startsWith("led-channel"));
    expect(channels).toHaveLength(ledChannels(3));
    expect([top, bottom, ...channels].every((x) => x.material === "second")).toBe(true);
    expect(bottom.holes).toHaveLength(0);
    expect(top.holes).toHaveLength(1);
    const slot = bboxOf([top.holes[0]]);
    expect(slot.y1 - slot.y0).toBeCloseTo(T + LED_FIT, 6);
    // the tab's width (measured at its tip) plus the fit
    const tip = board.outer.filter(([, y]) => Math.abs(y - box(board).y1) < 1e-6).map(([x]) => x);
    expect(slot.x1 - slot.x0).toBeCloseTo(Math.max(...tip) - Math.min(...tip) + LED_FIT, 2);
    // the channel's pocket opens out of the back through the notch, so it is part of the outline
    for (const c of channels) { expect(c.holes).toHaveLength(0); expect(box(c).y1).toBeCloseTo(60, 4); }
    // stacked: bottom, channels, top; the panel stands on the top plate
    expect(top.place!.z).toBeCloseTo((channels.length + 1) * 3, 6);
    expect(board.place!.y).toBeCloseTo(-(out.info!.H + (channels.length + 2) * 3), 6);
    const found = SIGN.check(p, out).map((i) => i.code);
    expect(found).not.toContain("LED_PANEL");
    expect(found).not.toContain("LED_BASE_MATERIAL");
  });

  it("flags a shallow LED base, a wooden panel and an acrylic base, with fixes", () => {
    // a thick panel needs a wide pocket, which leaves thin walls in a shallow base
    const raw = { T: 10, mount: { kind: "led", depth: 30 }, mat: { mat2: "acrylic-gold" } };
    const p = mergeSign(raw);
    const found = SIGN.check(p, SIGN.build(p, CTX));
    const shallow = found.find((i) => i.code === "LED_BASE_SHALLOW")!;
    expect(shallow).toBeDefined();
    const q = shallow.fixes[0].apply(p);
    expect(SIGN.check(q, SIGN.build(q, CTX)).some((i) => i.code === "LED_BASE_SHALLOW")).toBe(false);
    for (const code of ["LED_PANEL", "LED_BASE_MATERIAL"]) {
      const i = found.find((x) => x.code === code)!;
      const r = i.fixes[0].apply(p);
      expect(SIGN.check(r, SIGN.build(r, CTX)).some((x) => x.code === code), code).toBe(false);
    }
  });

  it("flags a tall sign on a shallow stand and the fix deepens it", () => {
    const p = mergeSign({ board: { auto: false, width: 100, height: 200 }, text: { size: 20 }, mount: { kind: "stand", depth: 30 } });
    const i = SIGN.check(p, SIGN.build(p, CTX)).find((x) => x.code === "SIGN_TIPS")!;
    expect(i).toBeDefined();
    const q = i.fixes[0].apply(p);
    expect(SIGN.check(q, SIGN.build(q, CTX)).some((x) => x.code === "SIGN_TIPS")).toBe(false);
  });

  it("a back face is a mirrored second board with the same marks, or its own words", () => {
    const raw = { T, text: { text: "OPEN" }, motif: { kind: "none" }, border: { kind: "none" }, mount: { kind: "hanging" } };
    const plain = build(raw);
    const same = build({ ...raw, back: { kind: "same" } });
    const back = same.parts.find((p) => p.id === "back")!;
    expect(back.engrave!.length).toBe(same.parts[0].engrave!.length);
    expect(back.holes.length).toBe(same.parts[0].holes.length);
    expect(box(back).x1 - box(back).x0).toBeCloseTo(plain.info!.W, 4);
    expect(back.place!.z).toBeCloseTo(same.parts[0].place!.z - T, 6);
    const other = build({ ...raw, back: { kind: "other", text: "CLOSED" } });
    expect(other.info!.W).toBeGreaterThan(plain.info!.W);
    expect(other.parts.find((p) => p.id === "back")!.engrave!.length).toBeGreaterThan(0);
    // not for other builds
    expect(build({ ...raw, style: { kind: "layered" }, back: { kind: "same" } }).parts.some((p) => p.id === "back")).toBe(false);
  });

  it("a two-sided sign on a desk stand has slots for both boards", () => {
    const out = build({ T, board: { shape: "rect", auto: false, width: 200, height: 80 }, mount: { kind: "stand", depth: 60 }, back: { kind: "same" } });
    const base = out.parts.find((p) => p.id === "base")!;
    for (const h of base.holes) { const b = bboxOf([h]); expect(b.y1 - b.y0).toBeCloseTo(2 * T, 6); }
    expect(bboxOf([out.parts.find((p) => p.id === "back")!.outer]).y1).toBeCloseTo(80 + T, 6);
  });
});
