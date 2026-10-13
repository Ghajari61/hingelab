import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { AIDesignError, designWithAI } from "../design";
import { aiMenu, fieldsText, productsText } from "../menu";
import { parseAIRequest } from "../request";
import { AI_OPEN_PREFIX, AI_PRODUCTS, MAX_OPEN_PATH, MAX_PROMPT } from "../types";

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } };

/** A model that answers each call with the next value (JSON), or throws it when it is an Error. */
function mock(...answers: unknown[]) {
  const calls: { prompt: unknown }[] = [];
  let i = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (opts) => {
      calls.push({ prompt: opts.prompt });
      const a = answers[Math.min(i++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return { content: [{ type: "text", text: JSON.stringify(a) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] } as never;
    },
  });
  return { model, calls };
}

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("AI designer request", () => {
  it("accepts a description, a photo or both", () => {
    expect(parseAIRequest(JSON.stringify({ prompt: "  a pen box  " }))).toEqual({ prompt: "a pen box" });
    expect(parseAIRequest(JSON.stringify({ image: PNG }))).toEqual({ prompt: "", image: PNG });
    expect(parseAIRequest(JSON.stringify({ prompt: "this", image: PNG }))).toEqual({ prompt: "this", image: PNG });
  });

  it("refuses empty, oversized and malformed requests", () => {
    expect(parseAIRequest("{}")).toHaveProperty("error");
    expect(parseAIRequest("not json")).toHaveProperty("error");
    expect(parseAIRequest("[]")).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: 5 }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: "x".repeat(MAX_PROMPT + 1) }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: "x", image: "data:image/svg+xml;base64,PHN2Zz4=" }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: "x", image: "https://example.com/a.png" }))).toHaveProperty("error");
  });
});

describe("AI designer menu", () => {
  it("offers every product with its presets, and no drawn-outline fields", async () => {
    const menu = await aiMenu();
    expect(menu.map((p) => p.id)).toEqual([...AI_PRODUCTS]);
    for (const p of menu) {
      expect(p.presets.length).toBeGreaterThan(0);
      for (const f of p.fields) expect(f.key).not.toMatch(/path$/i);
    }
    const text = productsText(menu);
    expect(text).toContain("## hinge: Hinge Box");
    expect(text).toContain("persian-box");
    const hinge = fieldsText(menu.find((p) => p.id === "hinge")!);
    expect(hinge).toMatch(/^W \| number mm \d+\.\.\d+/m);
    expect(hinge).toContain("shape | one of: rect");
    expect(hinge).not.toMatch(/^bedW /m);
  });
});

describe("AI designer", () => {
  it("builds a Hinge Box from checked settings and reports what it ignored", async () => {
    const { model, calls } = mock(
      { product: "hinge", preset: "no-such-preset", name: "Tea box", match: "exact", brief: "Rounded box 200 x 120 x 9999 mm" },
      { settings: [{ key: "W", value: "200 mm" }, { key: "D", value: "120" }, { key: "H", value: "99999" }, { key: "lid", value: "removable" }, { key: "colour", value: "red" }, { key: "pattern", value: "zigzag" }], notes: ["Height was capped."] },
    );
    const d = await designWithAI({ prompt: "a tea box", image: PNG }, "pro", "user-1", model);
    expect(d.product).toBe("hinge");
    expect(d.preset).toBeNull();
    expect(d.name).toBe("Tea box");
    expect(d.params.W).toBe(200);
    expect(d.params.D).toBe(120);
    expect(d.params.H).toBe(3000);
    expect(d.params.name).toBe("Tea box");
    expect(d.notes.join(" ")).toContain("colour");
    expect(d.notes.join(" ")).toContain("pattern");
    expect(d.notes[0]).toBe("Height was capped.");
    // The photo goes to the model as a file part.
    expect(JSON.stringify(calls[0].prompt)).toContain('"type":"file"');
  });

  it("keeps Pro designs locked on the Free plan but still returns their settings", async () => {
    const { model } = mock(
      { product: "hinge", preset: "", name: "Round jar", match: "exact", brief: "Cylinder 90 mm across, 100 mm tall" },
      { settings: [{ key: "shape", value: "cyl" }, { key: "dia", value: "90" }, { key: "H", value: "100" }], notes: [] },
    );
    const d = await designWithAI({ prompt: "round jar" }, "free", "user-1", model);
    expect(d.params.shape).toBe("cyl");
    expect(d.svg).toBeUndefined();
    expect(d.locked).toMatch(/Pro/);
    expect(d.locked).not.toContain("desktop");
  });

  it("builds a generator design with the cut file", async () => {
    const { model } = mock(
      { product: "sign", preset: "", name: "Cafe sign", match: "close", brief: "Wall sign reading Cafe Luna, 300 mm wide" },
      { settings: [{ key: "material", value: "birch3" }, { key: "nope.key", value: "1" }], notes: [] },
    );
    const d = await designWithAI({ prompt: "cafe sign" }, "pro", "user-1", model);
    expect(d.product).toBe("sign");
    expect(d.productName).toBe("Sign");
    expect(d.params.name).toBe("Cafe sign");
    expect(d.svg).toMatch(/^<\?xml|^<svg/);
    expect(d.width).toBeGreaterThan(0);
    expect(d.notes.join(" ")).toContain("nope.key");
  });

  it("sets Letters from the curated fields, clamped to their ranges", async () => {
    const { model } = mock(
      { product: "letters", preset: "persian-box", name: "Salam letters", match: "exact", brief: "Solid letters سلام 5 m tall" },
      { settings: [{ key: "text", value: "سلام" }, { key: "mode", value: "solid" }, { key: "size", value: "5000" }, { key: "fontId", value: "comic-sans" }], notes: [] },
    );
    const d = await designWithAI({ prompt: "سلام" }, "pro", "user-1", model);
    expect(d.product).toBe("letters");
    expect(d.preset).toBe("persian-box");
    expect(d.params.text).toBe("سلام");
    expect(d.params.mode).toBe("solid");
    expect(d.params.size).toBe(600);
    expect(d.params.fontId).toBe("vazirmatn");
    expect(d.summary).toContain("Solid letters");
    expect(d.notes.join(" ")).toContain("fontId");
    // The short link the desktop app opens carries only the chosen settings and fits its 512-character limit.
    expect(d.open?.startsWith(AI_OPEN_PREFIX)).toBe(true);
    expect(d.open!.length).toBeLessThanOrEqual(MAX_OPEN_PATH);
    const open = JSON.parse(Buffer.from(d.open!.slice(AI_OPEN_PREFIX.length), "base64url").toString("utf8"));
    expect(open).toMatchObject({ product: "letters", preset: "persian-box", name: "Salam letters", params: { text: "سلام", mode: "solid", size: 600 } });
  });

  it("shortens a long name so the Letters link still fits", async () => {
    const long = "ب".repeat(80);
    const { model } = mock(
      { product: "letters", preset: "", name: long, match: "exact", brief: "Letters" },
      { settings: [{ key: "text", value: "پ".repeat(60) }], notes: [] },
    );
    const d = await designWithAI({ prompt: "letters" }, "pro", "user-1", model);
    expect(d.open!.length).toBeLessThanOrEqual(MAX_OPEN_PATH);
    expect(JSON.parse(Buffer.from(d.open!.slice(AI_OPEN_PREFIX.length), "base64url").toString("utf8")).name).toBe(long.slice(0, 24));
  });

  it("picks a Parametric preset without a settings step", async () => {
    const { model, calls } = mock({ product: "parametric", preset: "slat-portrait", name: "Portrait wall", match: "close", brief: "Face sculpture" });
    const d = await designWithAI({ prompt: "a face made of wooden slats" }, "pro", "user-1", model);
    expect(calls).toHaveLength(1);
    expect(d.product).toBe("parametric");
    expect(d.preset).toBe("slat-portrait");
    expect(d.params.name).toBe("Portrait wall");
    expect(d.error).toBeUndefined();
  });

  it("says a Parametric design from a photo becomes a relief of that photo (website only)", async () => {
    const pick = { product: "parametric", preset: "slat-portrait", name: "Veiled face slat wall", match: "exact", brief: "Face relief in vertical slats" };
    const web = await designWithAI({ prompt: "", image: PNG }, "pro", "user-1", mock(pick).model, { photoRelief: true });
    expect(web.summary).toMatch(/^Your photo as a relief/);
    expect(web.summary).not.toContain("sweeping strands");
    expect(web.notes.join(" ")).toContain("Your photo becomes the relief");
    const desk = await designWithAI({ prompt: "", image: PNG }, "pro", "user-1", mock(pick).model);
    expect(desk.summary).not.toContain("Your photo");
  });

  it("keeps the preset's values when the settings step fails", async () => {
    const { model } = mock({ product: "boxes", preset: "", name: "Box", match: "exact", brief: "A box" }, new Error("model down"));
    const d = await designWithAI({ prompt: "a box" }, "pro", "user-1", model);
    expect(d.product).toBe("boxes");
    expect(d.notes.join(" ")).toContain("preset's values");
  });

  it("fails cleanly when the model answers outside the menu", async () => {
    const { model } = mock({ product: "spaceship", preset: "", name: "x", match: "exact", brief: "x" });
    await expect(designWithAI({ prompt: "a spaceship" }, "pro", "user-1", model)).rejects.toBeInstanceOf(AIDesignError);
  });
});
