import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { AIDesignError, designWithAI } from "../design";
import { aiMenu, fieldsText, productsText } from "../menu";
import { parseAIRequest } from "../request";
import { AI_OPEN_PREFIX, AI_PRODUCTS, MAX_IMAGE_NOTE, MAX_OPEN_PATH, MAX_PROMPT, MAX_REVISE_CHARS, reviseOf } from "../types";

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

  it("keeps a note about the photo only when there is a photo", () => {
    expect(parseAIRequest(JSON.stringify({ image: PNG, imageNote: "  30 × 40 cm  " }))).toEqual({ prompt: "", image: PNG, imageNote: "30 × 40 cm" });
    expect(parseAIRequest(JSON.stringify({ prompt: "a box", imageNote: "30 cm" }))).toEqual({ prompt: "a box" });
    expect(parseAIRequest(JSON.stringify({ image: PNG, imageNote: "x".repeat(MAX_IMAGE_NOTE + 1) }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ image: PNG, imageNote: 5 }))).toHaveProperty("error");
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
      if (p.id === "art") expect(p.presets).toEqual([]);
      else expect(p.presets.length).toBeGreaterThan(0);
      for (const f of p.fields) expect(f.key).not.toMatch(/path$/i);
    }
    const text = productsText(menu);
    expect(text).toContain("## hinge: Hinge Box");
    expect(text).toContain("name-box");
    const hinge = fieldsText(menu.find((p) => p.id === "hinge")!);
    expect(hinge).toMatch(/^W \| number mm \d+\.\.\d+/m);
    expect(hinge).toContain("shape | one of: rect");
    expect(hinge).not.toMatch(/^bedW /m);
  });
});

describe("AI designer", () => {
  it("builds a Hinge Box from checked settings and reports what it ignored", async () => {
    const { model, calls } = mock(
      { product: "hinge", preset: "no-such-preset", name: "Tea box", match: "exact", flat: false, brief: "Rounded box 200 x 120 x 9999 mm" },
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
      { product: "hinge", preset: "", name: "Round jar", match: "exact", flat: false, brief: "Cylinder 90 mm across, 100 mm tall" },
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
      { product: "boxes", preset: "", name: "Pen box", match: "exact", flat: false, brief: "Finger-jointed box 150 x 80 x 60 mm" },
      { settings: [{ key: "nope.key", value: "1" }], notes: [] },
    );
    const d = await designWithAI({ prompt: "pen box" }, "pro", "user-1", model);
    expect(d.product).toBe("boxes");
    expect(d.params.name).toBe("Pen box");
    expect(d.svg).toMatch(/^<\?xml|^<svg/);
    expect(d.width).toBeGreaterThan(0);
    expect(d.notes.join(" ")).toContain("nope.key");
  });

  it("sets Letters from the curated fields, clamped to their ranges", async () => {
    const { model } = mock(
      { product: "letters", preset: "name-box", name: "Salam letters", match: "exact", flat: false, brief: "Solid letters سلام 5 m tall" },
      { settings: [{ key: "text", value: "سلام" }, { key: "mode", value: "solid" }, { key: "size", value: "5000" }, { key: "fontId", value: "comic-sans" }], notes: [] },
    );
    const d = await designWithAI({ prompt: "سلام" }, "pro", "user-1", model);
    expect(d.product).toBe("letters");
    expect(d.preset).toBe("name-box");
    expect(d.params.text).toBe("سلام");
    expect(d.params.mode).toBe("solid");
    expect(d.params.size).toBe(600);
    expect(d.params.fontId).toBe("fredoka");
    expect(d.summary).toContain("Solid letters");
    expect(d.notes.join(" ")).toContain("fontId");
    // The short link the desktop app opens carries only the chosen settings and fits its 512-character limit.
    expect(d.open?.startsWith(AI_OPEN_PREFIX)).toBe(true);
    expect(d.open!.length).toBeLessThanOrEqual(MAX_OPEN_PATH);
    const open = JSON.parse(Buffer.from(d.open!.slice(AI_OPEN_PREFIX.length), "base64url").toString("utf8"));
    expect(open).toMatchObject({ product: "letters", preset: "name-box", name: "Salam letters", params: { text: "سلام", mode: "solid", size: 600 } });
  });

  it("shortens a long name so the Letters link still fits", async () => {
    const long = "ب".repeat(80);
    const { model } = mock(
      { product: "letters", preset: "", name: long, match: "exact", flat: false, brief: "Letters" },
      { settings: [{ key: "text", value: "پ".repeat(60) }], notes: [] },
    );
    const d = await designWithAI({ prompt: "letters" }, "pro", "user-1", model);
    expect(d.open!.length).toBeLessThanOrEqual(MAX_OPEN_PATH);
    expect(JSON.parse(Buffer.from(d.open!.slice(AI_OPEN_PREFIX.length), "base64url").toString("utf8")).name).toBe(long.slice(0, 24));
  });

  it("picks a Parametric preset without a settings step", async () => {
    const { model, calls } = mock({ product: "parametric", preset: "slat-portrait", name: "Portrait wall", match: "exact", flat: false, brief: "Face sculpture" });
    const d = await designWithAI({ prompt: "a face made of wooden slats" }, "pro", "user-1", model);
    expect(calls).toHaveLength(1);
    expect(d.product).toBe("parametric");
    expect(d.preset).toBe("slat-portrait");
    expect(d.params.name).toBe("Portrait wall");
    expect(d.error).toBeUndefined();
  });

  it("says a Parametric design from a photo becomes a relief of that photo (website only)", async () => {
    const pick = { product: "parametric", preset: "slat-portrait", name: "Veiled face slat wall", match: "exact", flat: false, brief: "Face relief in vertical slats" };
    const web = await designWithAI({ prompt: "", image: PNG }, "pro", "user-1", mock(pick).model, { photoRelief: true });
    expect(web.summary).toMatch(/^Your photo as a relief/);
    expect(web.summary).not.toContain("sweeping strands");
    expect(web.notes.join(" ")).toContain("Your photo becomes the relief");
    const desk = await designWithAI({ prompt: "", image: PNG }, "pro", "user-1", mock(pick).model);
    expect(desk.summary).not.toContain("Your photo");
  });

  it("gives both steps the note about the photo", async () => {
    const { model, calls } = mock({ product: "boxes", preset: "", name: "Box", match: "exact", flat: false, brief: "A box" }, { settings: [], notes: [] });
    await designWithAI({ prompt: "", image: PNG, imageNote: "make it 30 × 40 cm with the name سارا" }, "pro", "user-1", model);
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(JSON.stringify(c.prompt)).toContain("About the photo: make it 30 × 40 cm with the name سارا");
  });

  it("edits a design: only the asked change, everything else kept, no product pick", async () => {
    const first = await designWithAI({ prompt: "round jar" }, "pro", "user-1", mock(
      { product: "hinge", preset: "", name: "Round jar", match: "exact", flat: false, brief: "Cylinder 90 mm across, 100 mm tall" },
      { settings: [{ key: "shape", value: "cyl" }, { key: "dia", value: "90" }, { key: "H", value: "100" }], notes: [] },
    ).model);
    const { model, calls } = mock({ settings: [{ key: "H", value: "15 cm" }], notes: [], name: "" });
    const d = await designWithAI({ prompt: "make it 15 cm tall", revise: reviseOf(first) }, "pro", "user-1", model);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0].prompt)).toContain("make it 15 cm tall");
    expect(d).toMatchObject({ product: "hinge", name: "Round jar", match: "exact" });
    expect(d.params).toMatchObject({ shape: "cyl", dia: 90, H: 150 });
    expect(d.svg).toMatch(/<svg/);
  });

  it("edits Letters from their current settings", async () => {
    const first = await designWithAI({ prompt: "سلام" }, "pro", "user-1", mock(
      { product: "letters", preset: "name-box", name: "Salam", match: "exact", flat: false, brief: "Solid letters سلام" },
      { settings: [{ key: "text", value: "سلام" }, { key: "mode", value: "solid" }, { key: "size", value: "200" }], notes: [] },
    ).model);
    const d = await designWithAI({ prompt: "change the word to سارا", revise: reviseOf(first) }, "pro", "user-1", mock({ settings: [{ key: "text", value: "سارا" }], notes: [], name: "Sara letters" }).model);
    expect(d.params).toMatchObject({ text: "سارا", mode: "solid", size: 200 });
    expect(d.name).toBe("Sara letters");
  });

  it("edits a sculpture by picking its style again, within sculptures only", async () => {
    const first = await designWithAI({ prompt: "a face" }, "pro", "user-1", mock({ product: "parametric", preset: "slat-portrait", name: "Face", match: "exact", flat: false, brief: "Face" }).model);
    const { model, calls } = mock({ product: "boxes", preset: "wave-lamp", name: "Other", match: "exact", flat: false, brief: "Waves" });
    const d = await designWithAI({ prompt: "make it waves instead", revise: reviseOf(first) }, "pro", "user-1", model);
    expect(d.product).toBe("parametric");
    expect(d.name).toBe("Face");
    expect(JSON.stringify(calls[0].prompt)).toContain("Current design");
  });

  it("refuses edits without a change or with a broken design", () => {
    const revise = { product: "sign", preset: null, name: "Sign", match: "exact", params: { W: 300 } };
    expect(parseAIRequest(JSON.stringify({ prompt: "  ", revise }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: "wider", revise: { ...revise, product: "rocket" } }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: "wider", revise: { ...revise, params: [] } }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: "wider", revise: { ...revise, params: { big: "x".repeat(MAX_REVISE_CHARS) } } }))).toHaveProperty("error");
    expect(parseAIRequest(JSON.stringify({ prompt: "wider", image: PNG, revise }))).toEqual({ prompt: "wider", revise });
  });

  it("keeps the preset's values when the settings step fails", async () => {
    const { model } = mock({ product: "boxes", preset: "", name: "Box", match: "exact", flat: false, brief: "A box" }, new Error("model down"));
    const d = await designWithAI({ prompt: "a box" }, "pro", "user-1", model);
    expect(d.product).toBe("boxes");
    expect(d.notes.join(" ")).toContain("preset's values");
  });

  it("fails cleanly when the model answers outside the menu", async () => {
    const { model } = mock({ product: "spaceship", preset: "", name: "x", match: "exact", flat: false, brief: "x" });
    await expect(designWithAI({ prompt: "a spaceship" }, "pro", "user-1", model)).rejects.toBeInstanceOf(AIDesignError);
  });

  const ART_PICK = { product: "art", preset: "", name: "Round phone stand", match: "exact", flat: false, brief: "A circular phone stand" };
  const art = (over: Record<string, unknown> = {}) => ({
    name: "Round phone stand", summary: "A round phone stand, 100 mm across, in two slotted parts.",
    width: 210, height: 100, material: "3 mm birch plywood", thickness: 3,
    shapes: [
      { layer: "cut", d: "M50 0A50 50 0 1 1 49.99 0Z M47 60H53V100H47Z" },
      { layer: "cut", d: "M110 20H210V80H110Z" },
      { layer: "engrave", d: "M40 30C45 20 55 20 60 30S75 40 60 45Z" },
    ],
    texts: [{ text: "سارا", font: "fredoka", cx: 50, cy: 75, height: 12, maxWidth: 40, layer: "engrave" }],
    notes: [],
    ...over,
  });

  it("draws an original design, looks at its own drawing and fixes it", async () => {
    const { model, calls } = mock(ART_PICK, art({ shapes: [{ layer: "cut", d: "M0 0H100V100H0Z" }], texts: [] }), { ...art(), looksRight: false, problems: ["plain square"] });
    const d = await designWithAI({ prompt: "circle Phone stand" }, "pro", "user-1", model);
    expect(d.product).toBe("art");
    expect(d.productName).toBe("Original design");
    expect(d.preset).toBeNull();
    expect(d.svg).toContain('<g id="cut" fill="none" stroke="#FF0000"');
    expect(d.svg).toContain('<g id="engrave" fill="#000000" fill-rule="evenodd"');
    expect(d.svg).not.toContain("سارا");
    expect(d.width).toBe(210);
    expect(d.stats?.find((s) => s.label === "Cut shapes")?.value).toBe("3");
    expect(d.fileName).toBe("Round phone stand.svg");
    expect(calls).toHaveLength(3);
    const reviewed = JSON.stringify(calls[2].prompt);
    expect(reviewed).toContain("image/png");
    expect(reviewed).toContain("M0 0H100V100H0Z");
    expect((d.params.art as { texts: unknown[] }).texts).toHaveLength(1);
  });

  it("shows the shop's examples with the first drawing only, and draws without them when they fail", async () => {
    const reviewed = { ...art(), looksRight: false, problems: ["thin"] };
    const { model, calls } = mock(ART_PICK, art(), reviewed);
    const asked: string[] = [];
    const examples = async (q: string) => { asked.push(q); return [{ type: "text" as const, text: "Example 1: Moon stand (100 × 100 mm)" }, { type: "file" as const, mediaType: "image/png", data: "UE5H" }]; };
    const d = await designWithAI({ prompt: "circle Phone stand" }, "pro", "user-1", model, { examples });
    expect(d.product).toBe("art");
    expect(asked[0]).toContain("circle Phone stand");
    expect(asked[0]).toContain("A circular phone stand");
    const drawCall = JSON.stringify(calls[1].prompt);
    expect(drawCall).toContain("Example 1: Moon stand");
    expect(drawCall.indexOf("Example 1")).toBeLessThan(drawCall.indexOf("Request: circle Phone stand"));
    expect(JSON.stringify(calls[2].prompt)).not.toContain("Example 1");
    const broken = mock(ART_PICK, art(), { ...art(), looksRight: true, problems: [] });
    const ok = await designWithAI({ prompt: "circle Phone stand" }, "pro", "user-1", broken.model, { examples: async () => { throw new Error("db down"); } });
    expect(ok.product).toBe("art");
  });

  it("draws anything a product would only approximate, and never fills in a template layout", async () => {
    const reviewed = { ...art(), looksRight: true, problems: [] };
    const near = mock({ product: "boxes", preset: "phone-stand", name: "Phone stand", match: "close", flat: false, brief: "A circular phone stand" }, art(), reviewed);
    expect((await designWithAI({ prompt: "circle Phone stand" }, "pro", "user-1", near.model)).product).toBe("art");
    expect(JSON.stringify(near.calls[0].prompt)).not.toContain("## sign:");
    const templated = mock({ product: "sign", preset: "welcome-arch", name: "Home sign", match: "exact", flat: false, brief: "Wall sign خانه ما" }, art(), reviewed);
    const d = await designWithAI({ prompt: "تابلوی خانه ما" }, "pro", "user-1", templated.model);
    expect(d.product).toBe("art");
    expect(JSON.stringify(templated.calls[1].prompt)).toContain("Wall sign خانه ما");
  });

  it("draws flat things even when the model reaches for an engineered product", async () => {
    const reviewed = { ...art(), looksRight: true, problems: [] };
    const stand = mock({ product: "boxes", preset: "", name: "Phone stand", match: "exact", flat: true, brief: "A circular phone stand" }, art(), reviewed);
    expect((await designWithAI({ prompt: "circle Phone stand" }, "pro", "user-1", stand.model)).product).toBe("art");
    const puzzle = mock({ product: "puzzle", preset: "", name: "Puzzle", match: "exact", flat: true, brief: "A 12 piece puzzle" }, { settings: [], notes: [] });
    expect((await designWithAI({ prompt: "kids puzzle" }, "pro", "user-1", puzzle.model)).product).toBe("puzzle");
  });

  it("tells the review what it measured: a frame cut out with its text, a sheet engraved black", async () => {
    const reviewed = { ...art(), looksRight: true, problems: [] };
    const framed = art({
      width: 300, height: 120,
      shapes: [{ layer: "cut", d: "M0 0H300V120H0Z" }, { layer: "cut", d: "M15 15H285V105H15Z" }],
      texts: [{ text: "خانه ما", font: "vazirmatn", cx: 150, cy: 60, height: 50, maxWidth: 240, layer: "engrave" }],
    });
    const a = mock(ART_PICK, framed, reviewed);
    await designWithAI({ prompt: "sign" }, "pro", "user-1", a.model);
    expect(JSON.stringify(a.calls[2].prompt)).toContain("1 closed cut inside a part would cut out a large piece");
    const black = art({ shapes: [{ layer: "cut", d: "M0 0H210V100H0Z" }, { layer: "engrave", d: "M2 2H208V98H2Z" }], texts: [] });
    const b = mock(ART_PICK, black, reviewed);
    await designWithAI({ prompt: "sign" }, "pro", "user-1", b.model);
    expect(JSON.stringify(b.calls[2].prompt)).toMatch(/Engraving covers 9\d% of the sheet/);
  });

  it("keeps the first drawing when the review fails, and fails cleanly when nothing is drawn", async () => {
    const kept = await designWithAI({ prompt: "a sign" }, "free", "user-1", mock(ART_PICK, art(), new Error("model down")).model);
    expect(kept.product).toBe("art");
    expect(kept.svg).toContain("HingeLab");
    const empty = mock(ART_PICK, art({ shapes: [{ layer: "cut", d: "M0 0L10 10Z\"/><script>alert(1)</script>" }, { layer: "cut", d: "javascript:alert(1)" }], texts: [] }));
    await expect(designWithAI({ prompt: "a sign" }, "pro", "user-1", empty.model)).rejects.toBeInstanceOf(AIDesignError);
  });

  it("edits an original design from its picture, without picking a product", async () => {
    const first = await designWithAI({ prompt: "circle Phone stand" }, "pro", "user-1", mock(ART_PICK, art(), { ...art(), looksRight: true, problems: [] }).model);
    const { model, calls } = mock({ ...art({ name: "Sara phone stand", width: 250 }) }, { ...art(), looksRight: true, problems: [] });
    const d = await designWithAI({ prompt: "make it 25 cm wide", revise: reviseOf(first) }, "pro", "user-1", model);
    expect(d.product).toBe("art");
    expect(d.name).toBe("Sara phone stand");
    expect(d.width).toBe(250);
    const asked = JSON.stringify(calls[0].prompt);
    expect(asked).toContain("make it 25 cm wide");
    expect(asked).toContain("image/png");
    await expect(designWithAI({ prompt: "wider", revise: { ...reviseOf(first), params: { art: { shapes: 5 } } } }, "pro", "user-1", model)).rejects.toBeInstanceOf(AIDesignError);
  });

  it("asks OpenAI directly when the deployment has an OpenAI key, then falls back to the gateway", async () => {
    const hosts: string[] = [];
    vi.stubEnv("OPENAI_API_KEY", "sk-test-not-real");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gw-test-not-real");
    vi.stubGlobal("fetch", async (url: string | URL | Request) => {
      hosts.push(new URL(url instanceof Request ? url.url : url).host);
      return new Response(JSON.stringify({ error: { message: "bad key", type: "invalid_request_error" } }), { status: 401, headers: { "content-type": "application/json" } });
    });
    try {
      await expect(designWithAI({ prompt: "a box" }, "pro", "user-1")).rejects.toBeInstanceOf(AIDesignError);
      expect(hosts[0]).toBe("api.openai.com");
      expect(hosts.some((h) => h.includes("ai-gateway"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
