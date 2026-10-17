import { describe, expect, it } from "vitest";
import { MockImageModelV4 } from "ai/test";
import { anyProvider, GOOGLE_IMAGE_FALLBACKS, GOOGLE_IMAGE_MODEL, imagePlan } from "../providers/config";
import { googleImageProvider, imageProviders } from "../providers";
import { ProviderError } from "../providers/types";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function model() {
  const calls: Record<string, unknown>[] = [];
  const m = new MockImageModelV4({
    provider: "google", modelId: GOOGLE_IMAGE_MODEL,
    doGenerate: async (opts) => {
      calls.push(opts as unknown as Record<string, unknown>);
      return { images: [Buffer.from(PNG).toString("base64")], warnings: [], response: { timestamp: new Date(), modelId: GOOGLE_IMAGE_MODEL, headers: {} } } as never;
    },
  });
  return { m, calls };
}

describe("Nano Banana (Google Gemini image)", () => {
  it("is the only picture service by default, and counts as a provider", () => {
    const env = { GOOGLE_GENERATIVE_AI_API_KEY: "g", OPENAI_API_KEY: "o", VERCEL: "1" };
    expect(imagePlan(env).map((p) => p.model)).toEqual([GOOGLE_IMAGE_MODEL, ...GOOGLE_IMAGE_FALLBACKS]);
    expect(new Set(imagePlan(env).map((p) => p.id))).toEqual(new Set(["google"]));
    expect(imagePlan({ ...env, AI_VENDORS: "google,openai,gateway" }).map((p) => p.id).slice(-2)).toEqual(["openai", "gateway"]);
    expect(imagePlan({ GOOGLE_GENERATIVE_AI_API_KEY: "g", GOOGLE_IMAGE_MODEL: "gemini-3-pro-image-preview" })[0].model).toBe("gemini-3-pro-image-preview");
    expect(anyProvider({ GOOGLE_GENERATIVE_AI_API_KEY: "g" })).toBe(true);
    expect(new Set(imageProviders({ GOOGLE_GENERATIVE_AI_API_KEY: "g" }).map((p) => p.id))).toEqual(new Set(["google"]));
  });

  it("asks for an aspect ratio instead of a size and returns the picture", async () => {
    const { m, calls } = model();
    const p = googleImageProvider({ id: "google", model: GOOGLE_IMAGE_MODEL }, m);
    const r = await p.image({ prompt: "a fox", size: "1536x1024", user: "u" });
    expect(r).toMatchObject({ provider: "google", model: GOOGLE_IMAGE_MODEL });
    expect(Array.from(r.data.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
    expect(calls[0]).toMatchObject({ aspectRatio: "3:2", prompt: "a fox" });
    expect(calls[0].size).toBeUndefined();
  });

  it("sends the source picture, and the mask as a second picture with words saying what it means", async () => {
    const { m, calls } = model();
    const p = googleImageProvider({ id: "google", model: GOOGLE_IMAGE_MODEL }, m);
    await p.image({ prompt: "add a hat", user: "u", images: [{ data: PNG, mediaType: "image/png" }], mask: { data: PNG, mediaType: "image/png" } });
    expect((calls[0].files as unknown[]).length).toBe(2);
    expect(calls[0].mask).toBeUndefined();
    expect(String(calls[0].prompt)).toMatch(/mask of the first/);
  });

  it("marks refusals as final and outages as worth trying the next service", async () => {
    const refuse = new MockImageModelV4({ doGenerate: async () => { throw new Error("blocked by the safety system"); } });
    const down = new MockImageModelV4({ doGenerate: async () => { throw new Error("503 unavailable"); } });
    const plan = { id: "google" as const, model: GOOGLE_IMAGE_MODEL };
    await expect(googleImageProvider(plan, refuse).image({ prompt: "x", user: "u" })).rejects.toMatchObject({ retry: false });
    const e = await googleImageProvider(plan, down).image({ prompt: "x", user: "u" }).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.retry).toBe(true);
  });
});
