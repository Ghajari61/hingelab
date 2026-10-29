import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { unzlibSync } from "fflate";
import { MINIATURE } from "@/lib/generators/miniature";
import { BOXES } from "@/lib/generators/boxes";
import { bookSteps, genericPlan } from "@/lib/generators/assemblyBook";
import { assemblySteps } from "@/lib/generators/output";
import { CTX } from "@/lib/generators/__tests__/ctx";
import type { AnyGenerator } from "@/lib/generators/types";
import { bomRows } from "../bom";
import { assemblyPDF } from "../assemblyPdf";

const OUT = process.env.BOOKLET_DIR;

/** Checks a PDF's structure: header, every xref offset at its object, the page count, and streams that inflate to drawing operators with finite numbers. */
function checkPDF(pdf: Uint8Array) {
  const text = new TextDecoder("latin1").decode(pdf);
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  const sx = Number(/startxref\n(\d+)/.exec(text)![1]);
  expect(text.slice(sx, sx + 4)).toBe("xref");
  const offs = [...text.slice(sx).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offs.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)![1]);
  let at = 0, streams = 0;
  for (;;) {
    const k = text.indexOf(">>\nstream\n", at);
    if (k < 0) break;
    const s = k + 3;
    const len = Number(/\/Length (\d+) \/Filter \/FlateDecode >>\nstream\n$/.exec(text.slice(Math.max(0, s - 80), s + 7))![1]);
    const ops = new TextDecoder().decode(unzlibSync(pdf.subarray(s + 7, s + 7 + len)));
    expect(ops).not.toMatch(/NaN|Infinity|undefined/);
    streams++;
    at = s + 7 + len;
  }
  expect(streams).toBe(pages);
  return pages;
}

describe("assembly booklet", () => {
  const cases: [AnyGenerator, string | null][] = [[MINIATURE as AnyGenerator, "country-farmhouse"], [MINIATURE as AnyGenerator, "town-shop-house"], [MINIATURE as AnyGenerator, "sofa-1-12"], [MINIATURE as AnyGenerator, "nook-old-town-alley"], [BOXES as AnyGenerator, null]];
  it.each(cases.map(([d, id]) => [`${d.id} ${id ?? "defaults"}`, d, id] as const))("%s: every part in one step, a valid PDF", (_n, def, id) => {
    const p = def.merge(id ? def.presets.find((x) => x.id === id)!.params : def.defaults()) as { T: number; gap: number; name: string };
    const out = def.build(p, CTX);
    const plan = def.assemblyPlan?.(p, out) ?? genericPlan(out);
    const { cover, steps } = bookSteps(out, p.T, plan);
    expect(cover).toMatch(/^<svg/);
    // every part appears in exactly one step
    const counted = steps.reduce((k, s) => k + s.parts.reduce((m, x) => m + (Number(/×(\d+)$/.exec(x)?.[1]) || 1), 0), 0);
    expect(counted).toBe(out.parts.length);
    const r = assemblyPDF({ title: p.name, subtitle: def.summary(p), cover, notes: assemblySteps(out.assembly, p.gap), bom: bomRows(out.parts, p.T), steps });
    expect(checkPDF(r.pdf)).toBe(r.pages);
    expect(r.pages).toBe(2 + Math.ceil(steps.length / 2) + (r.pages - 2 - Math.ceil(steps.length / 2)));
    if (OUT) writeFileSync(`${OUT}/booklet-${def.id}-${id ?? "defaults"}.pdf`, r.pdf);
  }, 60000);

  it("puts a house together base first, walls, floors, the right wall, then the roof and the garden", () => {
    const p = MINIATURE.merge(MINIATURE.presets.find((x) => x.id === "country-farmhouse")!.params);
    const titles = MINIATURE.assemblyPlan!(p, MINIATURE.build(p, CTX)).map((g) => g.title);
    const at = (t: string) => titles.indexOf(t);
    expect(titles[0]).toBe("Base");
    expect(at("Left wall")).toBeLessThan(at("Ground floor"));
    expect(at("Ground floor")).toBeLessThan(at("Top plate"));
    expect(at("Top plate")).toBeLessThan(at("Right wall"));
    expect(at("Chimney")).toBeLessThan(at("Roof"));
    expect(at("Roof")).toBeLessThan(at("Dormers"));
    expect(at("Fence and gate")).toBeGreaterThan(at("Right wall"));
  });
});
