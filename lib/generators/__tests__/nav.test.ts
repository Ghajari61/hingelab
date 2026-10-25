import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGUE, COLLECTIONS, COMMUNITY, LEARN, MAKE } from "../nav";

describe("public catalogue", () => {
  it("uses unique slugs and in-app links", () => {
    const slugs = CATALOGUE.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CATALOGUE) {
      expect(c.href.startsWith("/app/editor/local") || c.href.startsWith("/home")).toBe(true);
      expect(c.blurb.length).toBeGreaterThan(10);
    }
  });

  it("gives every card that opens a design a picture that exists", () => {
    for (const c of CATALOGUE) {
      if (c.slug === "photo-layers" || c.slug === "engrave-prep") { expect(c.picture).toBeNull(); continue; }
      expect(c.picture, c.slug).toMatch(/^\/presets\/[a-z]+\/[a-z0-9-]+\.svg$/);
      expect(existsSync(join(process.cwd(), "public", c.picture!)), c.picture!).toBe(true);
    }
    for (const c of COLLECTIONS) expect(existsSync(join(process.cwd(), "public", c.picture ?? "-")), `${c.slug}: ${c.picture}`).toBe(true);
  });

  it("keeps the three menus on this site", () => {
    expect(MAKE.map((l) => l.label)).toEqual(["Generators", "Templates", "Free-form Studio"]);
    expect(COMMUNITY.map((l) => l.label)).toEqual(["Gallery", "Collections", "Graphics", "Materials"]);
    expect(LEARN.map((l) => l.label)).toEqual(["Guides", "Kerf & fit tools", "Changelog", "For developers"]);
  });
});
