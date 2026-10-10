import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { LETTER_DEFAULTS, computeLetterModel, exportLetterSVG, layoutLetters, loadFont, type LetterParams, type LoadedFont } from "@/lib/letters";
import { addWatermark, isSingleLetterBox, letterCount, lettersLock } from "@/lib/plans";
import { MAX_EXPORT_TEXT, MAX_UPLOAD_FONT_BYTES, exportLettersForPlan, parseLetterRequest } from "@/lib/billing/exportLetters";
import { bundledFont, serverHarfBuzz, uploadedFont } from "@/lib/billing/letterFonts";

const fontFile = (f: string) => readFileSync(join(process.cwd(), "lib/letters/__tests__/fonts", f));
const fixture = (file: string, id: string, name: string): LoadedFont => {
  const b = fontFile(file);
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const vazir = fixture("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black");

const P = (extra: Partial<LetterParams>): LetterParams => ({ ...LETTER_DEFAULTS, ...extra });
function localSVG(p: LetterParams, font: LoadedFont) {
  const m = computeLetterModel(p, font, hb);
  if ("error" in m) throw new Error(m.error);
  return exportLetterSVG(layoutLetters(m, p), p, font.name);
}

describe("Letters plan rule", () => {
  it("counts visible characters, not code units or spaces", () => {
    expect(letterCount("A")).toBe(1);
    expect(letterCount("  A \n")).toBe(1);
    expect(letterCount("Sam")).toBe(3);
    expect(letterCount("س")).toBe(1);
    expect(letterCount("e\u0301")).toBe(1);
    expect(letterCount("👍🏽")).toBe(1);
    expect(letterCount(" ")).toBe(0);
  });

  it("Free can export only a Letter Box of one letter; Pro anything", () => {
    expect(isSingleLetterBox({ mode: "box", text: "S" })).toBe(true);
    expect(isSingleLetterBox({ mode: "box", text: "سا" })).toBe(false);
    expect(isSingleLetterBox({ mode: "solid", text: "S" })).toBe(false);
    expect(lettersLock("free", { mode: "box", text: "S" })).toBeNull();
    expect(lettersLock("free", { mode: "box", text: "Sam" })).toMatch(/Pro feature/);
    expect(lettersLock("free", { mode: "stencil", text: "O" })).toMatch(/single letter/);
    expect(lettersLock("pro", { mode: "stencil", text: "Sam" })).toBeNull();
  });
});

describe("Letters export for a plan", () => {
  it("Free single-letter box: the same file as the editor builds, plus the mark", () => {
    const p = P({ text: "S", mode: "box" });
    const out = exportLettersForPlan(p, "free", fredoka, hb);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.svg).toBe(addWatermark(localSVG(p, fredoka)));
    expect(out.svg).toContain('id="watermark"');
  });

  it("Pro: byte-identical to the editor's export, no mark, any mode", () => {
    for (const p of [P({ text: "Sam", mode: "solid" }), P({ text: "ABOPQR8", mode: "stencil" }), P({ text: "Sam", mode: "box" })]) {
      const out = exportLettersForPlan(p, "pro", fredoka, hb);
      expect(out.ok && out.svg).toBe(localSVG(p, fredoka));
    }
    const fa = P({ text: "سام", fontId: "vazirmatn", mode: "box" });
    const out = exportLettersForPlan(fa, "pro", vazir, hb);
    expect(out.ok && out.svg).toBe(localSVG(fa, vazir));
  });

  it("Free is refused anything else with 403; design errors are 422", () => {
    for (const p of [P({ text: "Sam", mode: "box" }), P({ text: "S", mode: "solid" }), P({ text: "O", mode: "stencil" })]) {
      const out = exportLettersForPlan(p, "free", fredoka, hb);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.status).toBe(403);
    }
    const bad = exportLettersForPlan(P({ text: "S", mode: "box", K: 5 }), "free", fredoka, hb);
    expect(!bad.ok && bad.status).toBe(422);
  });

  it("parses request settings over the defaults and rejects junk", () => {
    expect(parseLetterRequest(null)).toHaveProperty("error");
    expect(parseLetterRequest([1])).toHaveProperty("error");
    expect(parseLetterRequest({ mode: "sculpture" })).toHaveProperty("error");
    expect(parseLetterRequest({ text: "x".repeat(MAX_EXPORT_TEXT + 1) })).toHaveProperty("error");
    const p = parseLetterRequest({ text: "A", mode: "box", marquee: { enabled: true } });
    expect("error" in p).toBe(false);
    if (!("error" in p)) {
      expect(p.marquee).toEqual({ ...LETTER_DEFAULTS.marquee, enabled: true });
      expect(p.layers).toEqual(LETTER_DEFAULTS.layers);
    }
  });
});

describe("server fonts", () => {
  it("bundled fonts load from public/fonts and give the same file as the fixtures", async () => {
    const shb = await serverHarfBuzz();
    const f = await bundledFont(shb, "fredoka");
    expect(f).not.toBeNull();
    const p = P({ text: "Sam", mode: "box" });
    const out = exportLettersForPlan(p, "pro", f!, shb);
    expect(out.ok && out.svg).toBe(localSVG(p, fredoka));
    expect(bundledFont(shb, "upload:abc")).toBeNull();
  });

  it("an uploaded font sent as base64 builds the same file; oversize and empty uploads are refused", async () => {
    const shb = await serverHarfBuzz();
    const b64 = fontFile("Vazirmatn-Black.ttf").toString("base64");
    const up = uploadedFont(shb, "upload:1", "My Vazir", b64);
    const p = P({ text: "سام", fontId: "upload:1", mode: "solid" });
    const out = exportLettersForPlan(p, "pro", up, shb);
    expect(out.ok && out.svg).toBe(localSVG(p, { ...vazir, name: "My Vazir" }));
    expect(() => uploadedFont(shb, "upload:2", "x", "")).toThrow(/empty/);
    expect(() => uploadedFont(shb, "upload:3", "x", Buffer.alloc(MAX_UPLOAD_FONT_BYTES + 1).toString("base64"))).toThrow(/over 3 MB/);
    expect(() => uploadedFont(shb, "upload:4", "x", Buffer.from("not a font").toString("base64"))).toThrow(/not a font/);
  });
});
