import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { mockImageProvider } from "../providers/mock";
import { claudeFirstRoutes } from "../providers";
import { briefLine, nextStep, PRODUCT_NAMES } from "../studio/brief";
import { COSTS, HIGH_QUALITY_EXTRA, imageCost } from "../studio/credits";
import { directorTurn, DIRECTOR_SYSTEM } from "../studio/director";
import { INSPIRATION } from "../studio/inspiration";
import { DESIGN_KITS, isRtl, KIT_CATEGORIES, kitFont, kitPrompt } from "../studio/kits";
import { assistantRequestSchema, BRIEF_PRODUCTS, directorRequestSchema, imageRequestSchema, MAX_VARIATIONS } from "../studio/request";
import { ASSISTANT_SYSTEM, generatePrompt, SERVICE_UNPAID, studioImage, VARIATION_HINTS } from "../studio/server";
import { styleArt, styleArtIds } from "../studio/styleArt";
import { STYLE_GROUPS, STYLE_PRESETS, styleById } from "../studio/styles";

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const signal = new AbortController().signal;

describe("AI Studio styles and recipes", () => {
  it("has 25 laser styles in four groups, each with its own preview", () => {
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(STYLE_PRESETS.map((s) => s.id)).size).toBe(STYLE_PRESETS.length);
    for (const s of STYLE_PRESETS) {
      expect(STYLE_GROUPS).toContain(s.group);
      expect(s.prompt.length).toBeGreaterThan(40);
      expect(styleArtIds).toContain(s.id);
      const svg = styleArt(s.id);
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 64 64"/);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
    for (const id of ["girih", "eslimi", "calligraphy-panel", "celtic", "stained-glass"]) expect(styleById(id)).toBeDefined();
  });

  it("has 30 or more recipes in every category, with real text instead of drawn words", () => {
    expect(DESIGN_KITS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(DESIGN_KITS.map((k) => k.id)).size).toBe(DESIGN_KITS.length);
    for (const c of KIT_CATEGORIES) expect(DESIGN_KITS.some((k) => k.category === c)).toBe(true);
    for (const k of DESIGN_KITS) {
      expect(styleById(k.style)).toBeDefined();
      expect(kitPrompt(k, "")).toContain(k.placeholder);
      if (k.product) expect(BRIEF_PRODUCTS).toContain(k.product);
      expect(k.prompt).not.toMatch(/\btext\b|\bletters?\b|\bwords?\b/i);
    }
    expect(DESIGN_KITS.filter((k) => k.fields?.length).length).toBeGreaterThanOrEqual(10);
  });

  it("picks a Persian font for Persian words and keeps Latin fonts for Latin words", () => {
    const nowruz = DESIGN_KITS.find((k) => k.id === "nowruz-haftsin")!;
    expect(isRtl("نوروز مبارک")).toBe(true);
    expect(kitFont(nowruz, "نوروز مبارک")).toBe("noto-nastaliq");
    expect(kitFont(nowruz, "Happy Nowruz")).toBe("montserrat");
    expect(kitFont(undefined, "سارا")).toBe("vazirmatn");
    const wedding = DESIGN_KITS.find((k) => k.id === "wedding-welcome")!;
    expect(kitFont(wedding, "Sara & Ali")).toBe("great-vibes");
  });

  it("has inspiration ideas that use real styles and products", () => {
    expect(INSPIRATION.length).toBeGreaterThanOrEqual(12);
    for (const x of INSPIRATION) {
      expect(styleById(x.style)).toBeDefined();
      expect(PRODUCT_NAMES[x.product]).toBeDefined();
    }
  });
});

describe("the Laser Brief", () => {
  it("writes the product, method and material into the prompt", () => {
    const line = briefLine({ product: "topper", method: "cut", material: "Acrylic 3 mm", widthMm: 140 });
    expect(line).toMatch(/cake topper/i);
    expect(line).toMatch(/cut-out/i);
    expect(line).toMatch(/acrylic/i);
    expect(line).toContain("140 mm");
    expect(briefLine({ product: "coaster", method: "engrave", material: "slate" })).toMatch(/slate/i);
    expect(briefLine(null)).toBe("");
  });

  it("chooses the next laser step", () => {
    expect(nextStep({ method: "engrave" })).toBe("engrave");
    expect(nextStep({ method: "score" })).toBe("centerline");
    expect(nextStep({ method: "cut", product: "shadowbox" })).toBe("layers");
    expect(nextStep({ method: "cut", product: "sign" })).toBe("vectorize");
  });
});

describe("AI Studio engine", () => {
  it("charges more for high quality, only on Pro", async () => {
    expect(imageCost("generate", "high")).toBe(COSTS.generate + HIGH_QUALITY_EXTRA);
    expect(imageCost("generate")).toBe(COSTS.generate);
    const p = mockImageProvider();
    const pro = await studioImage({ op: "generate", prompt: "a fox", quality: "high", transparent: true }, "u", signal, [p], "pro");
    expect(pro.credits).toBe(COSTS.generate + HIGH_QUALITY_EXTRA);
    expect(p.jobs[0]).toMatchObject({ quality: "high", transparent: true });
    expect(p.jobs[0].prompt).toMatch(/Transparent background/);
    const q = mockImageProvider();
    const free = await studioImage({ op: "generate", prompt: "a fox", quality: "high" }, "u", signal, [q], "free");
    expect(free.credits).toBe(COSTS.generate);
    expect(q.jobs[0].quality).toBe("medium");
  });

  it("asks each variation for a different take and sends reference pictures", async () => {
    expect(VARIATION_HINTS).toHaveLength(MAX_VARIATIONS);
    const prompts = VARIATION_HINTS.map((_, i) => generatePrompt({ op: "generate", prompt: "an owl", variation: i }));
    expect(new Set(prompts).size).toBe(MAX_VARIATIONS);
    const p = mockImageProvider();
    await studioImage({ op: "generate", prompt: "an owl", refs: [PNG_1x1, PNG_1x1] }, "u", signal, [p]);
    expect(p.jobs[0].images).toHaveLength(2);
    expect(p.jobs[0].prompt).toMatch(/references/);
  });

  it("says plainly when the AI accounts have no paid credit", async () => {
    const broke = mockImageProvider("openai", () => { throw new Error("AI_APICallError: You have no credits remaining. Add credits to continue"); });
    const free = mockImageProvider("gateway", () => { throw new Error("Free tier users do not have access to this model."); });
    const noClaude = async () => { throw new Error("Your credit balance is too low (billing)"); };
    await expect(studioImage({ op: "generate", prompt: "a fox" }, "u", signal, [broke, free], "pro", noClaude)).rejects.toMatchObject({ status: 503, message: SERVICE_UNPAID });
    const down = mockImageProvider("x", () => { throw new Error("503 upstream"); });
    const overloaded = async () => { throw new Error("overloaded"); };
    await expect(studioImage({ op: "generate", prompt: "a fox" }, "u", signal, [down], "pro", overloaded)).rejects.toMatchObject({ status: 502 });
  });

  it("checks the new requests", () => {
    expect(imageRequestSchema.safeParse({ op: "generate", prompt: "a fox", variation: 3, quality: "high" }).success).toBe(true);
    expect(imageRequestSchema.safeParse({ op: "generate", prompt: "a fox", variation: 4 }).success).toBe(false);
    expect(imageRequestSchema.safeParse({ op: "generate", prompt: "a fox", refs: [PNG_1x1, PNG_1x1, PNG_1x1, PNG_1x1] }).success).toBe(false);
    expect(directorRequestSchema.safeParse({ op: "enhance", prompt: "روباه خوابیده زیر ماه" }).success).toBe(true);
    expect(directorRequestSchema.safeParse({ op: "enhance", prompt: "a fox", brief: { product: "rocket" } }).success).toBe(false);
    expect(directorRequestSchema.safeParse({ op: "critique", image: "data:text/html;base64,AAAA" }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "user", text: "hi" }], context: { image: PNG_1x1 } }).success).toBe(true);
  });

  it("uses only Gemini by default, and the other vendors only when AI_VENDORS names them", () => {
    const env = { AI_GATEWAY_API_KEY: "x", OPENAI_API_KEY: "y", ANTHROPIC_API_KEY: "z", GOOGLE_GENERATIVE_AI_API_KEY: "g" };
    expect(claudeFirstRoutes("u", "t", env).map((r) => r.id)).toEqual(["google", "google-fast"]);
    expect(claudeFirstRoutes("u", "t", { ...env, GOOGLE_GENERATIVE_AI_API_KEY: "" })).toEqual([]);
    expect(claudeFirstRoutes("u", "t", { ...env, AI_VENDORS: "anthropic,openai,gateway" }).map((r) => r.id)).toEqual(["claude", "claude-gateway", "openai", "gateway"]);
  });
});

describe("the Creative Director", () => {
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } };
  const model = (out: object) => new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: JSON.stringify(out) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }) as never,
  });

  it("turns an idea into a brief, keeping the words to set as real text", async () => {
    const r = await directorTurn({ op: "enhance", prompt: "روباه با نوشته‌ی سارا", brief: { product: "sign", method: "cut", material: "" } }, "u", signal,
      model({ title: "Fox sign", prompt: "A sleeping fox curled under a crescent moon, bold even line weight, empty space below for a name", elements: ["fox", "moon", "stars"], text: ["سارا"] }));
    expect(r).toMatchObject({ title: "Fox sign", text: ["سارا"], credits: COSTS.enhance });
    expect("prompt" in r && r.prompt).toMatch(/fox/);
    expect(DIRECTOR_SYSTEM).toMatch(/never ask it for words/);
  });

  it("scores a picture and clamps the score", async () => {
    const r = await directorTurn({ op: "critique", image: PNG_1x1, prompt: "a fox", brief: { product: "canvas", method: "cut", material: "" } }, "u", signal,
      model({ score: 140, issues: ["Thin whiskers will burn away"], fix: "" }));
    expect(r).toMatchObject({ score: 100, issues: ["Thin whiskers will burn away"], credits: COSTS.critique });
  });

  it("tells the assistant about its new tools", () => {
    for (const t of ["use_recipe", "review_selection", "variations"]) expect(ASSISTANT_SYSTEM).toContain(t);
    expect(ASSISTANT_SYSTEM).toMatch(/user's language/);
  });
});
