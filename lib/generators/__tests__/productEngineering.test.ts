import { describe, it, expect, vi } from "vitest";
import { ALL_GENERATORS } from "../all";
import { arrangeGenerator } from "../output";
import { QR } from "../qr";
import { CTX } from "./ctx";

describe("production engineering guardrails", () => {
  it("warns when the QR has only two clear modules", () => {
    const p = QR.merge({ code: { quiet: 2 }, plate: { padding: 0, frame: false }, keyring: { kind: "none" }, label: { text: "" } });
    const issue = QR.check(p, QR.build(p, CTX)).find(i => i.code === "QUIET_ZONE");
    expect(issue).toBeDefined();
    expect(issue!.fixes[0].apply(p).code.quiet).toBe(4);
    expect(issue!.fixes[0].safe).toBe(false);
  });
  for (const def of ALL_GENERATORS) it(`${def.id} rejects invalid production inputs before building`, () => {
    for (const change of [{ T: 0 }, { K: -1 }, { bedW: NaN }, { gap: -1 }, { bedH: 0 }]) {
      const build = vi.fn(() => ({ parts: [], stats: [] }));
      const out = arrangeGenerator({ ...def, build }, { ...def.defaults(), ...change }, CTX);
      expect(out.result).toHaveProperty("error");
      expect(build).not.toHaveBeenCalled();
      expect(out.lay).toBeNull();
    }
  });
  it("rejects corrupt part coordinates before kerf or packing", () => {
    const def = ALL_GENERATORS[0];
    const out = arrangeGenerator({ ...def, build: () => ({ stats: [], parts: [{ id: "bad", name: "Bad", outer: [[0,0],[NaN,10],[10,0]], holes: [] }] }) }, def.defaults(), CTX);
    expect(out.result).toHaveProperty("error");
    expect(out.lay).toBeNull();
  });
});
