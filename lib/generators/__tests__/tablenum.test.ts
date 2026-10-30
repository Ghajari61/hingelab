import { describe, expect, it } from "vitest";
import { bboxOf } from "../geom";
import { TABLENUM } from "../tablenum";
import { hingeSlits, type TablenumOutput } from "../tablenum/build";
import { MAX_TABLES, formatNumber, mergeTablenum, tableList } from "../tablenum/params";
import { CTX } from "./ctx";
import { itemOf } from "../items";
import { decodeContours } from "./qrDecode";

const build = (raw: unknown) => TABLENUM.build(mergeTablenum(raw), CTX) as TablenumOutput;
const issues = (raw: unknown) => { const p = mergeTablenum(raw); return TABLENUM.check(p, TABLENUM.build(p, CTX)); };

describe("table numbers", () => {
  it("every preset builds with no errors or warnings", () => {
    for (const pr of TABLENUM.presets) {
      const p = TABLENUM.merge(pr.params);
      const out = TABLENUM.build(p, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(TABLENUM.check(p, out).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
    }
  });

  it("numbers a range in order, padded, with names on a second line", () => {
    const p = mergeTablenum({ batch: { from: 8, to: 11, pad: 2, names: "Ali\nSara" } });
    expect(tableList(p)).toEqual([{ main: "08", sub: "Ali" }, { main: "09", sub: "Sara" }, { main: "10", sub: "" }, { main: "11", sub: "" }]);
    expect(tableList(mergeTablenum({ batch: { from: 3, to: 1 } })).map((t) => t.main)).toEqual(["3", "2", "1"]);
    expect(formatNumber(12, mergeTablenum({ batch: { pad: 3 } }))).toBe("012");
    expect(tableList(mergeTablenum({ batch: { mode: "list", list: "Rose\n\n Lily \n" } })).map((t) => t.main)).toEqual(["Rose", "Lily"]);
  });

  it("makes one plate and base per table, all the same size", () => {
    const out = build({ batch: { from: 1, to: 12 }, base: { layers: 1 } });
    const plates = out.parts.filter((p) => p.id.startsWith("plate-"));
    expect(plates).toHaveLength(12);
    expect(out.parts.filter((p) => p.id.startsWith("base1-"))).toHaveLength(12);
    const sizes = plates.map((p) => { const b = bboxOf([p.outer]); return `${(b.x1 - b.x0).toFixed(3)}x${(b.y1 - b.y0).toFixed(3)}`; });
    expect(new Set(sizes).size).toBe(1);
  });

  it("caps a huge batch and says so", () => {
    expect(build({ batch: { from: 1, to: 200 } }).info!.tables).toBe(MAX_TABLES);
    expect(issues({ batch: { from: 1, to: 200 } }).some((i) => i.code === "BATCH_CAPPED")).toBe(true);
  });

  it("the slots fit the tabs: as wide as the plates are thick, plus a little clearance", () => {
    for (const double of [false, true]) {
      const T = 4;
      const out = build({ T, batch: { from: 1, to: 1 }, build: { double }, base: { layers: 1 } });
      const base = out.parts.find((p) => p.id.startsWith("base1"))!;
      for (const h of base.holes) {
        const b = bboxOf([h]);
        expect(b.y1 - b.y0).toBeCloseTo((double ? 2 : 1) * T + 0.1, 6);
      }
      const plate = out.parts.find((p) => p.id.startsWith("plate"))!;
      const tabsBelow = bboxOf([plate.outer]).y1 - out.info!.H;
      expect(tabsBelow).toBeCloseTo(T, 2);
    }
  });

  it("a layered base closes the slot at the bottom and steps in", () => {
    const T = 3;
    const out = build({ T, batch: { from: 1, to: 1 }, base: { layers: 3, step: 4, width: 90, depth: 60 } });
    const layers = [1, 2, 3].map((k) => out.parts.find((p) => p.id === `base${k}-1`)!);
    expect(layers[0].holes).toHaveLength(0);
    expect(layers[1].holes.length).toBeGreaterThan(0);
    expect(bboxOf([layers[2].outer]).x1).toBeLessThan(bboxOf([layers[0].outer]).x1);
    expect(out.info!.tab).toBeCloseTo(2 * T, 6);
  });

  it("a tent card is one piece with hinge slits, the back half upside down", () => {
    const out = build({ batch: { from: 1, to: 1 }, build: { kind: "tent" } });
    expect(out.parts).toHaveLength(1);
    const card = out.parts[0];
    expect(card.cuts!.length).toBeGreaterThan(5);
    const H = out.info!.H;
    expect(bboxOf([card.outer]).y1).toBeCloseTo(2 * H + 20, 2);
    expect(issues({ build: { kind: "tent" }, material: "acr3" }).some((i) => i.code === "TENT_ACRYLIC" && i.level === "error")).toBe(true);
  });

  it("hinge slits stay inside the edges and alternate rows", () => {
    const cuts = hingeSlits(100, 0, 10, { band: 10, slit: 20, bridge: 3, pitch: 2 });
    for (const c of cuts) for (const [x] of c) { expect(x).toBeGreaterThanOrEqual(3 - 1e-9); expect(x).toBeLessThanOrEqual(97 + 1e-9); }
    const ys = [...new Set(cuts.map((c) => c[0][1]))];
    expect(ys.length).toBe(5);
    const firstEnd = (y: number) => Math.min(...cuts.filter((c) => c[0][1] === y).map((c) => c[1][0]));
    expect(firstEnd(ys[0])).not.toBeCloseTo(firstEnd(ys[1]), 3);
  });

  it("pointed plates stand on one centre tab", () => {
    const out = build({ batch: { from: 1, to: 1 }, plate: { shape: "heart" }, base: { layers: 1 } });
    const base = out.parts.find((p) => p.id.startsWith("base1"))!;
    expect(base.holes).toHaveLength(1);
  });

  it("raised numbers are Pro and go on the second material", () => {
    const out = build({ batch: { from: 1, to: 2 }, text: { mark: "raised" } });
    expect(out.parts.filter((p) => p.material === "second")).toHaveLength(2);
    expect(TABLENUM.pro!(mergeTablenum({ text: { mark: "raised" } }), out)).toMatch(/Pro/);
  });
});

describe("table numbers with a QR code", () => {
  it("each table gets its own code with its number in the link, engraved under the number", () => {
    const pr = TABLENUM.presets.find((x) => x.id === "qr-menu-tables")!;
    const p = TABLENUM.merge(pr.params);
    const out = TABLENUM.build(p, CTX) as TablenumOutput;
    expect(out.error).toBeUndefined();
    const plates = out.parts.filter((x) => x.id.startsWith("plate-"));
    expect(plates.length).toBe(12);
    for (const k of [0, 2, 11]) {
      const code = (plates[k].engrave ?? []).filter((c) => itemOf(c) === "QR code");
      expect(code.length).toBeGreaterThan(10);
      expect(decodeContours(code, out.info!.qrModule)).toBe(`https://example.com/menu?table=${k + 1}`);
      // under the number, inside the plate
      const num = (plates[k].engrave ?? []).filter((c) => itemOf(c) === "Number");
      if (num.length) expect(bboxOf(code).y0).toBeGreaterThan(bboxOf(num).y1);
    }
    expect(TABLENUM.check(p, out).filter((i) => i.level !== "info")).toEqual([]);
  });

  it("a tent card carries the code on both faces; raised numbers keep it engraved", () => {
    const tent = TABLENUM.build(mergeTablenum({ build: { kind: "tent" }, batch: { from: 1, to: 1 }, qr: { on: true } }), CTX) as TablenumOutput;
    expect((tent.parts[0].engrave ?? []).filter((c) => itemOf(c) === "QR code").length).toBeGreaterThan(20);
    const raised = TABLENUM.build(mergeTablenum({ text: { mark: "raised" }, batch: { from: 1, to: 1 }, qr: { on: true } }), CTX) as TablenumOutput;
    expect((raised.parts[0].engrave ?? []).filter((c) => itemOf(c) === "QR code").length).toBeGreaterThan(10);
  });

  it("tiny modules warn, and the fix makes the code bigger", () => {
    const p = mergeTablenum({ qr: { on: true, size: 14, url: "example.com/a/very/long/menu/address?table={n}&lang=en" }, batch: { from: 1, to: 1 } });
    const issues = TABLENUM.check(p, TABLENUM.build(p, CTX));
    const small = issues.find((i) => i.code === "QR_SMALL")!;
    expect(small).toBeDefined();
    const q = small.fixes[0].apply(p);
    expect(TABLENUM.check(q, TABLENUM.build(q, CTX)).map((i) => i.code)).not.toContain("QR_SMALL");
  });
});
