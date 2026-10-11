import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { allowed, parseSpdx } from "../../scripts/licenses.mjs";

describe("licence gate", () => {
  it("accepts the allow-list and permissive alternatives", () => {
    for (const l of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "MPL-2.0", "OFL-1.1", "Unlicense", "CC0-1.0", "Zlib"]) expect(allowed(l)).toBe(true);
    expect(allowed("MIT OR Apache-2.0")).toBe(true);
    expect(allowed("MIT/Apache-2.0")).toBe(true);
    expect(allowed("(MIT OR Apache-2.0) AND Unicode-3.0")).toBe(true);
    expect(allowed("Apache-2.0 WITH LLVM-exception OR MIT")).toBe(true);
    expect(allowed("BSL")).toBe(true);
  });

  it("an OR with an allowed choice passes; any copyleft term that must be accepted fails", () => {
    expect(allowed("MIT OR Apache-2.0 OR LGPL-2.1-or-later")).toBe(true);
    expect(allowed("Apache-2.0 AND LGPL-3.0-or-later")).toBe(false);
    for (const l of ["GPL-2.0", "GPL-2.0-or-later", "GPL-3.0+", "LGPL-2.1", "AGPL-3.0-only", "SSPL-1.0"]) expect(allowed(l)).toBe(false);
  });

  it("unknown or missing licences fail", () => {
    expect(allowed("")).toBe(false);
    expect(allowed("UNLICENSED")).toBe(false);
    expect(allowed("SEE LICENSE IN LICENSE.md")).toBe(false);
    expect(allowed("WTFPL")).toBe(false);
  });

  it("parses nested expressions", () => {
    expect(parseSpdx("A OR (B AND C)")).toEqual({ or: [{ id: "A" }, { and: [{ id: "B" }, { id: "C" }] }] });
  });
});
