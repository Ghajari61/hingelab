import "server-only";
/**
 * Real providers for the deployment's environment: OpenAI with the deployment's own key, then the
 * Vercel AI Gateway. Keys stay in process.env on the server; the browser and the desktop app only
 * ever talk to HingeLab's routes.
 */
import { createHash } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, generateImage, type ImageModel } from "ai";
import { ASSISTANT_FALLBACKS, imagePlan, textPlan, type Env, type ProviderPlan } from "./config";
import { ProviderError, type ImageJob, type ImageProvider, type TextRoute } from "./types";

export * from "./types";
export { withFallback } from "./fallback";
export { anyProvider, imagePlan, textPlan } from "./config";

/** A user id the providers can track abuse by, without learning who the user is. */
export const userTag = (scope: string, userId: string) => createHash("sha256").update(`${scope}:${userId}`).digest("hex").slice(0, 24);

/** Prompts the provider's safety system blocks would be blocked by the next provider too. */
const BLOCKED = /safety|moderation|content[_ ]policy|policy violation|not allowed|rejected by/i;

export function aiSdkImageProvider(plan: ProviderPlan, model: ImageModel): ImageProvider {
  return {
    id: plan.id,
    model: plan.model,
    async image(job: ImageJob) {
      try {
        const prompt = job.images?.length
          ? { text: job.prompt, images: job.images.map((i) => i.data), ...(job.mask ? { mask: job.mask.data } : {}) }
          : job.prompt;
        const { image } = await generateImage({
          model,
          prompt,
          size: job.size ?? "1024x1024",
          n: 1,
          maxRetries: 1,
          abortSignal: job.signal,
          providerOptions: plan.id === "gateway"
            ? { gateway: { user: job.user, tags: ["ai-studio"] }, openai: { quality: "medium" } }
            : { openai: { user: job.user, quality: "medium" } },
        });
        return { data: image.uint8Array, mediaType: image.mediaType || "image/png", provider: plan.id, model: plan.model };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new ProviderError(msg.slice(0, 300), plan.id, !BLOCKED.test(msg));
      }
    },
  };
}

export function imageProviders(env: Env = process.env): ImageProvider[] {
  return imagePlan(env).map((p) => aiSdkImageProvider(p, p.id === "openai" ? createOpenAI({ apiKey: env.OPENAI_API_KEY }).image(p.model) : gateway.image(p.model)));
}

/** Language models for the assistant, in the order to try them. */
export function textRoutes(user: string, tag: string, env: Env = process.env): TextRoute[] {
  return textPlan(env).map((p): TextRoute => p.id === "openai"
    ? { id: "openai", model: createOpenAI({ apiKey: env.OPENAI_API_KEY })(p.model), providerOptions: { openai: { safetyIdentifier: user } } }
    : { id: "gateway", model: p.model, providerOptions: { gateway: { models: ASSISTANT_FALLBACKS, user, tags: [tag] } } });
}
