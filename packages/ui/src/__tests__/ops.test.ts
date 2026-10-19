import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPORT_LAYERS, SCORE_LAYER } from "@/lib/hinge/export";
import { OPS } from "../ops";

const tokens = readFileSync(join(__dirname, "../../../../styles/tokens.css"), "utf8");
/** The value of a custom property in the first block of `css` that matches `block`. */
function prop(block: RegExp, name: string): string | undefined {
  const m = block.exec(tokens);
  if (!m) return undefined;
  const body = tokens.slice(m.index, tokens.indexOf("}", m.index));
  return new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(body)?.[1]?.toUpperCase();
}
const LIGHT = /:root\s*\{[^}]*--l-outline/;
const DARK = /:root\[data-theme="dark"\], :root\[data-theme="darker"\] \{/;

describe("operation colours: one palette", () => {
  it("are the cut files' colours", () => {
    const byKey = Object.fromEntries(EXPORT_LAYERS.map((l) => [l.key, l.color]));
    expect(byKey.outline).toBe(OPS.cut.color);
    expect(byKey.slots).toBe(OPS.inner.color);
    expect(byKey.hinge).toBe(OPS.hinge.color);
    expect(byKey.labels).toBe(OPS.engrave.color);
    expect(SCORE_LAYER.color).toBe(OPS.score.color);
  });

  it("are what the canvas draws, with lifted shades in the dark themes", () => {
    for (const op of Object.values(OPS)) {
      expect(prop(LIGHT, op.css), op.css).toBe(op.color);
      expect(prop(DARK, op.css), op.css).toBe(op.dark.toUpperCase());
    }
  });
});
