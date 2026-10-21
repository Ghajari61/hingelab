/**
 * Problems found in the fabrication audit (docs/AUDIT-FAB.md), each pinned by a test so the fix
 * is proven and stays fixed.
 */
import { describe, expect, it } from "vitest";
import { hingeIssues } from "@/lib/issues/hinge";
import { clone, DEFAULTS } from "@/lib/hinge";
import { arrangeGenerator, sheetIssues } from "@/lib/generators/output";
import { SHADOWBOX } from "@/lib/generators/shadowbox";
import { mergeShadowBox } from "@/lib/generators/shadowbox/params";
import { SIGN } from "@/lib/generators/sign";
import { CTX } from "@/lib/generators/__tests__/ctx";

describe("fabrication audit: reproduced problems", () => {
  it("A1 Shadow Box, blade cutter: every layer is its own colour of card, so it needs a sheet (mat) per colour", () => {
    const blade = SHADOWBOX.sections.flatMap((s) => s.fields).find((f) => f.key === "cutter.kind") as { apply: (p: unknown, v: string) => unknown };
    const bladed = blade.apply(mergeShadowBox({ stack: { count: 4 } }), "blade") as ReturnType<typeof mergeShadowBox>;
    const p = mergeShadowBox({ ...bladed, frame: { ...bladed.frame, size: "5x7", width: 124, height: 175 } });
    const a = arrangeGenerator(SHADOWBOX, p, CTX);
    const colours = new Set(a.lay!.items.map((it) => it.pt.src.color ?? "none"));
    expect(colours.size).toBeGreaterThan(1);
    // One colour per sheet: the sheets the layout uses cover every colour.
    expect(a.fit!.sheets).toBeGreaterThanOrEqual(colours.size);
    for (const sh of a.sheets!) {
      const on = new Set(a.lay!.items.filter((it) => it.oy + it.pt.bbox.y0 >= sh.y - 1e-6 && it.oy + it.pt.bbox.y0 < sh.y + sh.h).map((it) => it.pt.src.color ?? "none"));
      expect(on.size, "colours on one sheet").toBeLessThanOrEqual(1);
    }
  });

  it("A2 a fix that shrinks the design is never a safe fix (Auto-fix all must not resize a product)", () => {
    const p = SIGN.merge({ bedW: 120, bedH: 80 });
    const issues = sheetIssues(SIGN, p, arrangeGenerator(SIGN, p, CTX));
    const shrink = issues.flatMap((i) => i.fixes).filter((f) => /resize to fit \d+ sheet/i.test(f.label));
    expect(shrink.length).toBeGreaterThan(0);
    expect(shrink.every((f) => !f.safe)).toBe(true);
    const h = Object.assign(clone(DEFAULTS), { W: 400, D: 300, H: 200, bedW: 300, bedH: 200 });
    const hShrink = hingeIssues(h).flatMap((i) => i.fixes).filter((f) => /resized? to fit \d+ sheet/i.test(f.label));
    expect(hShrink.length).toBeGreaterThan(0);
    expect(hShrink.every((f) => !f.safe)).toBe(true);
  });
});
