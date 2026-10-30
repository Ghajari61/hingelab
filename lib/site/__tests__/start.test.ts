import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { siteProducts } from "../products";
import { startGroups } from "../start";
import { START_PRESETS } from "@/lib/generators/startPresets";
import { isGeneratorId } from "@/lib/generators/ids";
import { HINGE_PRESETS } from "@/lib/hinge/presets";

describe("start page", () => {
  const groups = startGroups();
  const items = groups.flatMap((g) => g.items);

  it("offers every product the site has, once", () => {
    expect(items.map((c) => c.id).sort()).toEqual(siteProducts().map((p) => p.id).sort());
  });

  it("opens each one on a design that exists, with its picture", () => {
    for (const c of items) {
      const u = new URL(c.start, "https://x");
      const preset = u.searchParams.get("preset");
      expect(preset, c.id).toBeTruthy();
      expect(existsSync(join(process.cwd(), "public", c.picture)), c.picture).toBe(true);
      if (isGeneratorId(c.id)) expect(START_PRESETS[c.id].some((p) => p.id === preset) || START_PRESETS[c.id].length === 0, `${c.id}/${preset}`).toBe(true);
      if (c.id === "hinge") expect(HINGE_PRESETS.some((p) => p.id === preset)).toBe(true);
      expect(c.hint.length).toBeGreaterThan(5);
    }
  });
});
