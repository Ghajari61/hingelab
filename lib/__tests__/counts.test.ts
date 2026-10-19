import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "@/lib/generators/all";

const root = join(__dirname, "../..");
const DIRS = ["app", "components", "lib", "desktop/src", "packages"];
/** "132 designs", "436+ presets": a count typed into copy goes stale when presets are added. */
const COUNT = /\b\d{2,4}\+? (ready-made )?(designs|presets)\b(?! a day)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "node_modules" || f === "__tests__" || f.startsWith(".")) return [];
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|mdx?)$/.test(f) ? [p] : [];
  });
}

describe("design counts come from the preset data", () => {
  it("no copy types a number of designs or presets", () => {
    const hits: string[] = [];
    for (const d of DIRS) for (const f of sources(join(root, d))) {
      readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => { if (COUNT.test(line)) hits.push(`${f.slice(root.length + 1)}:${i + 1}: ${line.trim().slice(0, 90)}`); });
    }
    expect(hits).toEqual([]);
  });

  it("the Shadow Box help counts its own presets", () => {
    const sb = ALL_GENERATORS.find((g) => g.id === "shadowbox")!;
    const text = JSON.stringify(sb);
    expect(text).toContain(`${sb.presets.length} ready-made designs`);
  });
});
