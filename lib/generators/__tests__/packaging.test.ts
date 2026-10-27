import { describe, expect, it } from "vitest";
import { PAPERBOX, PACKAGING_DESIGNS, fromPaper } from "../paperbox";
import { arrangeGenerator, genSVG } from "../output";
import { CTX } from "./ctx";

describe("Wood Packaging", () => {
  it("is plywood packaging built on the finger-joint engine", () => {
    const p = PAPERBOX.defaults();
    expect(PAPERBOX.name).toBe("Boxes & Packaging");
    expect(p.material).toMatch(/birch|ply|bass|mdf/);
    expect(p.design).toBe("box");
    const field = PAPERBOX.sections.find((s) => s.id === "design")!.fields.find((f) => f.key === "design")!;
    expect(field.kind === "choice" && field.options.map((o) => o.v)).toEqual(expect.arrayContaining(PACKAGING_DESIGNS));
    expect(PAPERBOX.merge({ design: "bird" }).design).toBe("bird");
  });

  it("builds every ready-made design without an error and with joints that fit the sheet", () => {
    expect(PAPERBOX.presets.length).toBeGreaterThanOrEqual(60);
    expect(new Set(PAPERBOX.presets.map((p) => p.id)).size).toBe(PAPERBOX.presets.length);
    for (const pr of PAPERBOX.presets.filter(p => p.id.startsWith("packaging-"))) {
      const p = PAPERBOX.merge(pr.params);
      const out = PAPERBOX.build(p, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(out.parts.length, pr.id).toBeGreaterThan(1);
      expect(PAPERBOX.check(p, out).filter((i) => i.level === "error"), pr.id).toEqual([]);
    }
  }, 240000);

  it("exports a millimetre SVG with no paper creases", () => {
    const p = PAPERBOX.merge(PAPERBOX.presets.find((x) => x.id === "packaging-tea-hinged")!.params);
    const a = arrangeGenerator(PAPERBOX, p, CTX);
    const svg = genSVG(PAPERBOX, a.params, a.lay!);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).not.toMatch(/crease|perforat|bleed/i);
  });

  it("opens a design saved by the paper version as the matching wooden box at the same inside size", () => {
    const tuck = PAPERBOX.merge({ name: "My soap", style: "reverse-tuck", paper: "350", styles: { "reverse-tuck": { L: 90, W: 60, H: 30 } } });
    expect(tuck).toMatchObject({ name: "My soap", design: "box", box: { width: 90, depth: 60, height: 30, lid: "sliding" } });
    expect(PAPERBOX.merge({ style: "two-piece", styles: { "two-piece": { L: 60, W: 60, H: 30 } } }).box.lid).toBe("liftoff");
    expect(PAPERBOX.merge({ style: "mailer", styles: { mailer: { L: 150, W: 100, H: 50 } } }).box.lid).toBe("pin");
    expect(PAPERBOX.merge({ style: "drawer", styles: { drawer: { L: 55, W: 35, H: 15 } } })).toMatchObject({ design: "drawer", drawer: { width: 60, depth: 50, height: 30 } });
    expect(PAPERBOX.merge({ style: "cell-insert", styles: { "cell-insert": { L: 240, W: 160, H: 70, cols: 3, rows: 2 } } })).toMatchObject({ design: "insert", insert: { cols: 3, rows: 2 } });
    expect(fromPaper({ design: "tray" })).toEqual({ design: "tray" });
    for (const p of [tuck]) expect(PAPERBOX.build(p, CTX).error).toBeUndefined();
  });
});
