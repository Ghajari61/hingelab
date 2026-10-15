import { describe, expect, it } from "vitest";
import { retiredLetterSample } from "@/lib/letters";

describe("retiredLetterSample", () => {
  it("matches only the removed Persian sign sample", () => {
    expect(retiredLetterSample({ name: "Persian sign", text: "سلام" })).toBe(true);
    expect(retiredLetterSample({ name: "Persian sign", text: "  سلام  " })).toBe(true);
    expect(retiredLetterSample({ name: "Persian sign", text: "سلام\n" })).toBe(true);
    expect(retiredLetterSample({ name: "Persian sign", text: "Sam" })).toBe(false);
    expect(retiredLetterSample({ name: "Name box", text: "سلام" })).toBe(false);
    expect(retiredLetterSample({ name: "Persian box", text: "عشق" })).toBe(false);
    expect(retiredLetterSample(null)).toBe(false);
  });
});
