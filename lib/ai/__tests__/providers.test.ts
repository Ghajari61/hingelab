import { describe, expect, it } from "vitest";
import { anyProvider, imagePlan, textPlan, IMAGE_MODEL, OPENAI_IMAGE_MODEL } from "../providers/config";
import { withFallback } from "../providers/fallback";
import { mockImageProvider } from "../providers/mock";
import { ProviderError } from "../providers/types";
import { imageProviders, textRoutes, userTag } from "../providers";
import { imageDims, imagePrompt, laserSettings, sizeFor, studioImage, StudioError } from "../studio/server";
import { assistantRequestSchema, imageRequestSchema } from "../studio/request";
import { DESIGN_KITS, kitPrompt } from "../studio/kits";
import { STYLE_PRESETS, stylePrompt } from "../studio/styles";
import { COSTS, STUDIO_DAILY } from "../studio/credits";

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("provider configuration", () => {
  it("uses the deployment's OpenAI key first, then the gateway", () => {
    expect(imagePlan({})).toEqual([]);
    expect(anyProvider({})).toBe(false);
    expect(imagePlan({ OPENAI_API_KEY: "k" }).map((p) => p.id)).toEqual(["openai"]);
    expect(imagePlan({ VERCEL: "1" })).toEqual([{ id: "gateway", model: IMAGE_MODEL }]);
    expect(imagePlan({ AI_GATEWAY_API_KEY: "g", OPENAI_API_KEY: "k" })).toEqual([{ id: "openai", model: OPENAI_IMAGE_MODEL }, { id: "gateway", model: IMAGE_MODEL }]);
    expect(textPlan({ VERCEL_OIDC_TOKEN: "t" }).map((p) => p.id)).toEqual(["gateway"]);
  });

  it("models can be overridden by the environment", () => {
    expect(imagePlan({ VERCEL: "1", AI_IMAGE_MODEL: "bfl/flux-2-pro" })[0].model).toBe("bfl/flux-2-pro");
    expect(imagePlan({ OPENAI_API_KEY: "k", OPENAI_IMAGE_MODEL: "gpt-image-1" })[0].model).toBe("gpt-image-1");
    expect(textPlan({ VERCEL: "1", AI_DESIGN_MODEL: "a/b" })[0].model).toBe("a/b");
    expect(textPlan({ VERCEL: "1", AI_DESIGN_MODEL: "a/b", AI_ASSISTANT_MODEL: "c/d" })[0].model).toBe("c/d");
  });

  it("builds real providers without calling them", () => {
    const ps = imageProviders({ OPENAI_API_KEY: "sk-test", VERCEL: "1" });
    expect(ps.map((p) => p.id)).toEqual(["openai", "gateway"]);
    expect(textRoutes("u", "t", { AI_GATEWAY_API_KEY: "g" }).map((r) => r.id)).toEqual(["gateway"]);
    expect(imageProviders({})).toEqual([]);
  });

  it("hashes user ids per scope", () => {
    expect(userTag("a", "user-1")).toHaveLength(24);
    expect(userTag("a", "user-1")).not.toBe(userTag("b", "user-1"));
    expect(userTag("a", "user-1")).not.toContain("user-1");
  });
});

describe("fallback", () => {
  it("tries the next provider after a failure", async () => {
    const bad = mockImageProvider("first", () => { throw new ProviderError("down", "first"); });
    const good = mockImageProvider("second");
    const failed: string[] = [];
    const r = await withFallback([bad, good], (p) => p.image({ prompt: "x", user: "u" }), undefined, (p) => failed.push(p.id));
    expect(r.provider.id).toBe("second");
    expect(failed).toEqual(["first"]);
    expect(bad.jobs).toHaveLength(1);
    expect(good.jobs).toHaveLength(1);
  });

  it("stops at a refusal the next provider would repeat", async () => {
    const refuse = mockImageProvider("first", () => { throw new ProviderError("blocked", "first", false); });
    const good = mockImageProvider("second");
    await expect(withFallback([refuse, good], (p) => p.image({ prompt: "x", user: "u" }))).rejects.toThrow("blocked");
    expect(good.jobs).toHaveLength(0);
  });

  it("stops when cancelled and fails clearly with no providers", async () => {
    const ctl = new AbortController();
    ctl.abort(new Error("Cancelled"));
    const p = mockImageProvider();
    await expect(withFallback([p], (x) => x.image({ prompt: "x", user: "u" }), ctl.signal)).rejects.toThrow("Cancelled");
    expect(p.jobs).toHaveLength(0);
    await expect(withFallback([], async () => 1)).rejects.toThrow(/No AI provider/);
  });

  it("throws the last error when every provider fails", async () => {
    const a = mockImageProvider("a", () => { throw new Error("a down"); });
    const b = mockImageProvider("b", () => { throw new Error("b down"); });
    await expect(withFallback([a, b], (p) => p.image({ prompt: "x", user: "u" }))).rejects.toThrow("b down");
  });
});

describe("AI Studio pictures", () => {
  const signal = new AbortController().signal;

  it("sends the styled prompt, size and source picture to the provider", async () => {
    const p = mockImageProvider();
    const r = await studioImage({ op: "generate", prompt: "a fox", style: "line-art", aspect: "wide" }, "user-1", signal, [p]);
    expect(r.image.startsWith("data:image/png;base64,")).toBe(true);
    expect(r.credits).toBe(COSTS.generate);
    expect(p.jobs[0].size).toBe("1536x1024");
    expect(p.jobs[0].prompt).toContain("a fox");
    expect(p.jobs[0].prompt).toContain("line drawing");
    expect(p.jobs[0].user).not.toContain("user-1");

    const q = mockImageProvider();
    await studioImage({ op: "redraw", prompt: "add a hat", image: PNG_1x1, mask: PNG_1x1 }, "u", signal, [q]);
    expect(q.jobs[0].images).toHaveLength(1);
    expect(q.jobs[0].mask?.mediaType).toBe("image/png");
    expect(q.jobs[0].size).toBe("1024x1024");
  });

  it("turns provider refusals and outages into user messages", async () => {
    const refuse = mockImageProvider("x", () => { throw new ProviderError("safety system", "x", false); });
    await expect(studioImage({ op: "generate", prompt: "abc", aspect: "square" }, "u", signal, [refuse])).rejects.toMatchObject({ status: 422 });
    const down = mockImageProvider("x", () => { throw new Error("503"); });
    const noVector = async () => { throw new Error("503"); };
    await expect(studioImage({ op: "generate", prompt: "abc", aspect: "square" }, "u", signal, [down], "pro", noVector)).rejects.toBeInstanceOf(StudioError);
  });

  it("prompts for each operation keep the original where they should", () => {
    expect(imagePrompt({ op: "cutout", image: PNG_1x1 })).toMatch(/pure white/);
    expect(imagePrompt({ op: "expand", prompt: "", image: PNG_1x1, mask: PNG_1x1 })).toMatch(/Keep the original area/);
    expect(imagePrompt({ op: "restyle", prompt: "", image: PNG_1x1, sketch: true, style: "flat" })).toMatch(/sketch/);
  });

  it("reads picture sizes and picks the model's size", () => {
    expect(imageDims(Uint8Array.from(Buffer.from(PNG_1x1.split(",")[1], "base64")))).toEqual({ w: 1, h: 1 });
    expect(sizeFor(1600, 900)).toBe("1536x1024");
    expect(sizeFor(900, 1600)).toBe("1024x1536");
    expect(sizeFor(1000, 1000)).toBe("1024x1024");
  });

  it("checks requests", () => {
    expect(imageRequestSchema.safeParse({ op: "generate", prompt: "ok fox" }).success).toBe(true);
    expect(imageRequestSchema.safeParse({ op: "generate", prompt: "x" }).success).toBe(false);
    expect(imageRequestSchema.safeParse({ op: "redraw", prompt: "hat", image: "data:text/html;base64,AAAA", mask: PNG_1x1 }).success).toBe(false);
    expect(imageRequestSchema.safeParse({ op: "nope" }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "user", text: "hi" }] }).success).toBe(true);
    expect(assistantRequestSchema.safeParse({ messages: [] }).success).toBe(false);
  });
});

describe("assistant tools and studio data", () => {
  it("laser settings come from the material library", () => {
    const cut = laserSettings("birch plywood", "co2", "cut");
    expect(cut).toMatchObject({ found: true, possible: true, power: 65, passes: 1 });
    const engrave = laserSettings("acr3", "co2", "engrave");
    expect(engrave).toMatchObject({ possible: true, interval: 0.1 });
    expect(laserSettings("anodised aluminium", "diode", "cut")).toMatchObject({ found: true, possible: false });
    expect(laserSettings("unobtainium", "co2", "cut")).toMatchObject({ found: false });
  });

  it("styles, kits and credits", () => {
    expect(new Set(STYLE_PRESETS.map((s) => s.id)).size).toBe(STYLE_PRESETS.length);
    for (const id of ["line-art", "flat", "hatch", "woodcut", "stencil", "mandala", "silhouette", "sticker", "layered"]) expect(STYLE_PRESETS.some((s) => s.id === id)).toBe(true);
    expect(stylePrompt("owl", "stencil")).toMatch(/^owl\n/);
    for (const k of DESIGN_KITS) {
      expect(STYLE_PRESETS.some((s) => s.id === k.style)).toBe(true);
      expect(kitPrompt(k, "")).toContain(k.placeholder);
      expect(kitPrompt(k, "cats")).toContain("cats");
    }
    expect(STUDIO_DAILY.pro).toBeGreaterThan(STUDIO_DAILY.free);
  });
});
