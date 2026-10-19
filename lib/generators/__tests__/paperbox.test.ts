import { describe, expect, it } from "vitest";
import { arrangeGenerator, genSVG } from "../output";
import { PAPERBOX } from "../paperbox";
import { dashes } from "../paperbox/build";
import { listBoxStyles } from "@/lib/paperbox";
import { CTX } from "./ctx";

describe("Paper Box generator", () => {
  it("makes its panels from every style's schema, shown only for that style", () => {
    for (const s of listBoxStyles()) {
      const own = PAPERBOX.sections.filter((x) => x.id.startsWith(`${s.id}-`));
      expect(own.length, s.id).toBeGreaterThan(1);
      const p = PAPERBOX.merge({ style: s.id });
      for (const sec of own) expect(sec.show!(p)).toBe(true);
      const other = PAPERBOX.merge({ style: listBoxStyles().find((x) => x.id !== s.id)!.id });
      for (const sec of own) expect(sec.show!(other)).toBe(false);
    }
  });

  it("picks the board's thickness from its weight", () => {
    const f = PAPERBOX.sections.find((s) => s.id === "board")!.fields[0];
    expect(f.kind === "choice" && f.apply!(PAPERBOX.defaults(), "eflute").T).toBe(1.6);
  });

  it("every preset builds, with creases on the score layer and cuts on the outline", () => {
    expect(PAPERBOX.presets.length).toBeGreaterThanOrEqual(25);
    for (const pr of PAPERBOX.presets) {
      const p = PAPERBOX.merge(pr.params);
      const out = PAPERBOX.build(p, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(out.parts.length).toBeGreaterThan(0);
      for (const part of out.parts) expect(part.score!.length, pr.id).toBeGreaterThan(4);
    }
    const p = PAPERBOX.merge(PAPERBOX.presets.find((x) => x.id === "tea-box")!.params);
    const svg = genSVG(PAPERBOX, p, arrangeGenerator(PAPERBOX, p, CTX).lay!);
    expect(svg).toContain('inkscape:label="01 Score lines"');
    expect(svg).toContain('inkscape:label="02 Outline cut"');
  });

  it("each style and size is kept while you switch styles", () => {
    const p = PAPERBOX.merge({ style: "mailer", styles: { "reverse-tuck": { L: 77 } } });
    expect(p.styles["reverse-tuck"].L).toBe(77);
    expect(PAPERBOX.summary({ ...p, style: "reverse-tuck" })).toContain("77");
  });

  it("cuts perforations as dashes", () => {
    const d = dashes([[0, 0], [10, 0]], 2, 1);
    expect(d.map((c) => c.map((q) => q[0]))).toEqual([[0, 2], [3, 5], [6, 8], [9, 10]]);
  });
});
