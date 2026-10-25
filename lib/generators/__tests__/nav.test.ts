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
    expect(MAKE.map((l) => l.label)).toEqual(["Generators", "Templates", "Free tools", "Free-form Studio"]);
    expect(COMMUNITY.map((l) => l.label)).toEqual(["Gallery", "Collections", "Graphics", "Materials"]);
    expect(LEARN.map((l) => l.label)).toEqual(["Guides", "Kerf & fit tools", "Changelog", "For developers"]);
  });
});

describe("collections and free tools", () => {
  it("every collection has designs whose pictures exist, and the tools have pages", async () => {
    const { allCollections } = await import("@/lib/site/collections");
    const { TOOLS } = await import("@/lib/site/tools");
    const cs = allCollections();
    expect(cs.map((c) => c.slug)).toContain("christmas");
    for (const c of cs) {
      expect(c.items.length, c.slug).toBeGreaterThanOrEqual(3);
      for (const it of c.items) expect(existsSync(join(process.cwd(), "public", it.picture)), it.picture).toBe(true);
    }
    expect(cs.find((c) => c.slug === "christmas")!.items.slice(0, 4).map((i) => i.id)).toEqual(["name-ornament", "star-ornament", "tree-of-life-ornament", "birdhouse-ornament"]);
    expect(TOOLS.map((t) => t.id)).toEqual(["thickness-resizer", "svg-to-stl", "nesting"]);
  });
});
