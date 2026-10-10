import { describe, expect, it } from "vitest";
import { migrate } from "../index";

describe("migrate", () => {
  it("upgrades an old project: bone becomes relief and cuts stay single-line", () => {
    expect(migrate({ pattern: "bone", W: 140 })).toEqual({
      pattern: "relief", W: 140, stretch: 0, testStrip: false, cutStyle: "line", slotW: 0.8,
    });
  });

  it("leaves current settings alone", () => {
    const p = { pattern: "wave", stretch: 2, testStrip: true, cutStyle: "slot", slotW: 1 };
    expect(migrate({ ...p })).toEqual(p);
  });
});
