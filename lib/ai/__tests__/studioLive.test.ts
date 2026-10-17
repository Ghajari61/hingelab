/**
 * The vector engine against the real Claude API. Off by default; run with the key in the
 * environment:  LIVE_AI=1 ANTHROPIC_API_KEY=… npx vitest run lib/ai/__tests__/studioLive.test.ts
 * The drawings are written to tmp/live-*.png to look at.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { readiness } from "@/lib/imaging/readiness";
import { briefLine } from "../studio/brief";
import { drawVectorArt, shapeCount } from "../studio/vectorArt";

const live = process.env.LIVE_AI === "1" && !!process.env.ANTHROPIC_API_KEY;

const CASES = [
  { id: "fox", prompt: "A fox curled up asleep under a crescent moon with a few small stars", style: "line-art", method: "score" as const, product: "wall-art" as const },
  { id: "girih", prompt: "A square Persian girih tile with interlacing ten-point stars, like the Shah Mosque in Isfahan", style: "girih", method: "cut" as const, product: "coaster" as const },
  { id: "topper", prompt: "روباه کوچک با بادکنک برای تولد بچه", style: "silhouette", method: "cut" as const, product: "topper" as const },
];

describe.skipIf(!live)("AI Studio vector engine, live", () => {
  mkdirSync("tmp", { recursive: true });
  for (const c of CASES) {
    it(`draws ${c.id} as a laser-ready picture`, async () => {
      const brief = { product: c.product, method: c.method, material: "Birch plywood 3 mm", widthMm: 150 };
      const t0 = Date.now();
      const r = await drawVectorArt({ prompt: [c.prompt, briefLine(brief)].join("\n"), style: c.style, aspect: "square" }, "live-test", AbortSignal.timeout(170_000));
      writeFileSync(`tmp/live-${c.id}.png`, r.png);
      writeFileSync(`tmp/live-${c.id}.svg`, r.svg);
      const img = new Resvg(r.svg, { fitTo: { mode: "width", value: 480 }, background: "#ffffff" }).render();
      const score = readiness({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.pixels) }, { method: c.method, widthMm: 150, thicknessMm: 3 });
      console.log(`${c.id}: ${shapeCount(r.svg)} shapes, score ${score.score} (${score.grade}), ${Math.round((Date.now() - t0) / 1000)} s, ${r.model}`, score.checks.filter((x) => !x.ok).map((x) => x.label).join(", "));
      expect(shapeCount(r.svg)).toBeGreaterThanOrEqual(12);
      expect(score.score).toBeGreaterThanOrEqual(60);
    }, 180_000);
  }
});
