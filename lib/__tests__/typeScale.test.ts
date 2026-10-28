import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/** Every stylesheet of the site and the app. */
function sheets(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "node_modules" || f.startsWith(".")) return [];
    return statSync(p).isDirectory() ? sheets(p) : p.endsWith(".css") ? [p] : [];
  });
}

// The scale in styles/tokens.css. Page titles use clamp(); em/rem sizes follow their parent.
const SCALE = new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 34, 46]);

it("font sizes stay on the type scale", () => {
  const off: string[] = [];
  for (const file of ["app", "components", "styles"].flatMap(sheets)) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) if (!SCALE.has(Number(m[1]))) off.push(`${file}: ${m[0]}`);
  }
  expect(off).toEqual([]);
});
