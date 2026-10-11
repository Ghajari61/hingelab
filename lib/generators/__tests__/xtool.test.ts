import { describe, expect, it } from "vitest";
import { MATERIALS } from "@/lib/hinge";
import { CUT_SPEEDS } from "@/lib/parametric/cutTime";
import { bboxOf, pointInContour } from "../geom";
import { CLOCK } from "../clock";
import { faceOutline, numeral } from "../clock/build";
import { mergeClock } from "../clock/params";
import { PUZZLE } from "../puzzle";
import type { PuzzleOutput } from "../puzzle/build";
import { PLATE_PUZZLES, mergePuzzle } from "../puzzle/params";
import { QR } from "../qr";
import { mergeQr } from "../qr/params";
import { SIGN } from "../sign";
import { mergeSign } from "../sign/params";
import { CTX } from "./ctx";

const finite = (cs: [number, number][][]) => cs.every((c) => c.length >= 3 && c.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));

describe("material library", () => {
  it("every preset has a usable thickness, kerf and cut speed", () => {
    for (const [id, m] of Object.entries(MATERIALS)) {
      if (id === "custom") continue;
      expect(m.T, id).toBeGreaterThan(0);
      expect(m.K, id).toBeGreaterThanOrEqual(0);
      expect(m.K!, id).toBeLessThanOrEqual(1);
      expect(CUT_SPEEDS[id], id).toBeTruthy();
    }
  });
});

describe("clock extras", () => {
  it("numerals: modern Roman four and Eastern Arabic digits", () => {
    expect(numeral("roman-iv", 4)).toBe("IV");
    expect(numeral("roman-iv", 9)).toBe("IX");
    expect(numeral("roman", 4)).toBe("IIII");
    expect(numeral("eastern", 0)).toBe("١٢");
    expect(numeral("eastern", 7)).toBe("٧");
  });

  it("flower, heart and cloud faces build around the movement", () => {
    for (const shape of ["flower", "heart", "cloud"] as const) {
      const p = mergeClock({ face: { shape, size: 320, rays: 8, depth: 40 } });
      const o = faceOutline(p)!;
      expect(o.length, shape).toBeGreaterThan(20);
      expect(pointInContour([0, 0], o), shape).toBe(true);
      const out = CLOCK.build(p, CTX);
      expect(out.error, shape).toBeUndefined();
      expect(finite(out.parts.flatMap((pt) => [pt.outer, ...pt.holes])), shape).toBe(true);
    }
  });
});

describe("puzzle outlines", () => {
  it("every plate outline builds into whole pieces", () => {
    for (const kind of PLATE_PUZZLES) {
      const p = mergePuzzle({ shape: { kind, width: 240, height: 180, corner: 6 }, pieces: { auto: true, count: 12 } });
      const out = PUZZLE.build(p, CTX) as PuzzleOutput;
      expect(out.error, kind).toBeUndefined();
      expect(out.info!.pieces, kind).toBeGreaterThanOrEqual(6);
      const b = bboxOf([out.parts[0].outer]);
      expect(b.x1 - b.x0, kind).toBeLessThanOrEqual(241);
    }
  });
});

describe("QR frames and labels", () => {
  const base = { label: { text: "SCAN ME", fontId: "archivo-black", size: 7 }, plate: { padding: 8, frame: true, frameWidth: 1.5 } };

  it("a bar label is one engraved bar with the letters left bare", () => {
    const plain = QR.build(mergeQr(base), CTX).parts[0].engrave!.length;
    const bar = QR.build(mergeQr({ ...base, label: { ...base.label, style: "bar" } }), CTX).parts[0];
    expect(bar.engrave!.length).toBeGreaterThan(0);
    expect(bar.engrave!.length).not.toBe(plain);
    const cut = QR.build(mergeQr({ ...base, output: { kind: "cutout" }, label: { ...base.label, style: "bar" } }), CTX);
    expect(cut.error).toBeUndefined();
  });

  it("a corner frame keeps only the four corners of the line", () => {
    const line = QR.build(mergeQr(base), CTX).parts[0].engrave!;
    const corners = QR.build(mergeQr({ ...base, plate: { ...base.plate, frameStyle: "corners" } }), CTX).parts[0].engrave!;
    expect(line.length - corners.length).toBe(2 - 4);
  });
});

describe("sign builds", () => {
  it("a stencil leaves no loose middles", () => {
    const out = SIGN.build(mergeSign({ style: { kind: "stencil" }, text: { text: "BOARD 80", fontId: "archivo-black", size: 40 }, motif: { kind: "none" }, mount: { kind: "none" } }), CTX);
    expect(out.error).toBeUndefined();
    const holes = out.parts[0].holes;
    expect(holes.length).toBeGreaterThan(8);
    for (const a of holes) for (const b of holes) if (a !== b) expect(pointInContour(b[0], a)).toBe(false);
  });

  it("a neon-look sign is one solid piece with engraved outlines", () => {
    for (const mount of ["none", "stand"] as const) {
      const out = SIGN.build(mergeSign({ style: { kind: "neon", border: 6 }, text: { text: "Bar", fontId: "pacifico", size: 60 }, mount: { kind: mount } }), CTX);
      expect(out.error).toBeUndefined();
      const board = out.parts.find((pt) => pt.id === "board")!;
      expect(board.holes.length, mount).toBe(0);
      expect(board.engrave!.length, mount).toBeGreaterThan(2);
      const b = bboxOf([board.outer]);
      for (const c of board.engrave!) for (const [x, y] of c) {
        expect(x).toBeGreaterThan(b.x0);
        expect(y).toBeGreaterThan(b.y0);
      }
    }
  });
});
