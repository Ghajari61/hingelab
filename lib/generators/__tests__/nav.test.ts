import { describe, expect, it } from "vitest";
import { CATALOGUE, COMMUNITY, LEARN, MAKE } from "../nav";

describe("public catalogue", () => {
  it("uses unique slugs and in-app links", () => {
    const slugs = CATALOGUE.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CATALOGUE) {
      expect(c.href.startsWith("/app/editor/local") || c.href.startsWith("/home")).toBe(true);
      expect(c.blurb.length).toBeGreaterThan(10);
    }
  });

  it("keeps the three menus on this site", () => {
    expect(MAKE.map((l) => l.label)).toEqual(["Generators", "Templates", "Studio"]);
    expect(COMMUNITY.map((l) => l.label)).toEqual(["Gallery", "Collections", "Graphics", "Materials"]);
    expect(LEARN.map((l) => l.label)).toEqual(["Guides", "Kerf & fit tools", "Changelog", "For developers"]);
  });
});
