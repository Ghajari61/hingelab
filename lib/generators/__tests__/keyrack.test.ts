import { describe, expect, it } from "vitest";
import { bboxOf } from "../geom";
import { arrangeGenerator } from "../output";
import { KEYRACK } from "../keyrack";
import type { KeyrackOutput } from "../keyrack/build";
import { mergeKeyrack } from "../keyrack/params";
import { CTX } from "./ctx";

const build = (raw: unknown) => KEYRACK.build(mergeKeyrack(raw), CTX) as KeyrackOutput;

describe("key holder", () => {
  it("cuts a slot and a hook for every hook, tabs as thick as the material", () => {
    const out = build({ T: 4, hooks: { count: 5, style: "hook" } });
    const board = out.parts[0];
    expect(out.parts.filter((p) => p.id.startsWith("hook"))).toHaveLength(5);
    const slots = board.holes.filter((h) => { const b = bboxOf([h]); return Math.abs(b.x1 - b.x0 - 4) < 1e-6; });
    expect(slots).toHaveLength(5);
    const hook = out.parts[1];
    expect(bboxOf([hook.outer]).x0).toBeCloseTo(-4, 6);
  });

  it("pegs and screw hooks are holes only", () => {
    const peg = build({ hooks: { count: 3, style: "peg", hole: 10 } });
    expect(peg.parts).toHaveLength(1);
    const screw = KEYRACK.sections.flatMap((s) => s.fields).find((f) => f.key === "hooks.style")!;
    if (screw.kind !== "choice" || !screw.apply) throw new Error("hooks.style must apply");
    expect(screw.apply(mergeKeyrack({}), "screw").hooks.hole).toBe(3);
  });

  it("engraves a name above each hook", () => {
    const plain = build({ hooks: { labels: "" } });
    const named = build({ hooks: { labels: "Mom\nDad" } });
    expect(named.parts[0].engrave!.length).toBeGreaterThan(plain.parts[0].engrave!.length);
  });

  it("adds a shelf and brackets with matching slots", () => {
    const out = build({ shelf: { on: true, depth: 70, at: 14 } });
    expect(out.parts.map((p) => p.id)).toEqual(expect.arrayContaining(["shelf", "bracket1", "bracket2"]));
    expect(KEYRACK.pro!(mergeKeyrack({ shelf: { on: true } }), out)).toMatch(/Pro/);
  });

  it("raised letters go on their own material's sheet", () => {
    const p = mergeKeyrack({ text: { mark: "raised" } });
    const a = arrangeGenerator(KEYRACK, p, CTX);
    expect(a.sheets!.at(-1)!.label).toMatch(/mirror acrylic/);
  });

  it("flags holes outside a shaped board", () => {
    const p = mergeKeyrack({ board: { shape: "heart", width: 200, height: 180 }, hooks: { count: 4, margin: 5, y: 85 } });
    const issues = KEYRACK.check(p, KEYRACK.build(p, CTX));
    expect(issues.some((i) => i.code === "OUTSIDE_BOARD")).toBe(true);
  });

  it("flags crowded hooks", () => {
    const p = mergeKeyrack({ hooks: { count: 12 } });
    const i = KEYRACK.check(p, KEYRACK.build(p, CTX)).find((x) => x.code === "HOOKS_CROWDED")!;
    expect(i.fixes[0].apply(p).hooks.count).toBeLessThan(12);
  });
});
