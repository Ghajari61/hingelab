import "server-only";
/**
 * Real providers for the deployment's environment: OpenAI with the deployment's own key, then the
 * Vercel AI Gateway. Keys stay in process.env on the server; the browser and the desktop app only
 * ever talk to HingeLab's routes.
 */
import { createHash } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, generateImage, type ImageModel } from "ai";
import { ASSISTANT_FALLBACKS, gatewayAvailable, imagePlan, textPlan, type Env, type ProviderPlan } from "./config";
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
        const openai = { quality: job.quality ?? "medium", ...(job.transparent ? { background: "transparent", output_format: "png" } : {}) };
        const { image } = await generateImage({
          model,
          prompt,
          size: job.size ?? "1024x1024",
          n: 1,
          maxRetries: 1,
          abortSignal: job.signal,
          providerOptions: plan.id === "gateway"
            ? { gateway: { user: job.user, tags: ["ai-studio"] }, openai }
            : { openai: { user: job.user, ...openai } },
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

/** Gateway and direct Claude, used first for writing and judging designs. */
export const CLAUDE_GATEWAY_MODEL = "anthropic/claude-sonnet-5-5";
export const CLAUDE_DIRECT_MODEL = "claude-sonnet-5-5";

/**
 * Claude first (the Gateway, then a direct key), then the OpenAI chain, the same order as the AI
 * designer. AI_DESIGN_ORDER=openai,gateway drops Claude without a code change.
 */
export function claudeFirstRoutes(user: string, tag: string, env: Env = process.env): TextRoute[] {
  const order = (env.AI_DESIGN_ORDER || "claude,openai,gateway").split(",").map((s) => s.trim());
  const claude: TextRoute[] = [];
  if (gatewayAvailable(env)) claude.push({ id: "claude-gateway", model: env.AI_CLAUDE_MODEL || CLAUDE_GATEWAY_MODEL, providerOptions: { gateway: { user, tags: [tag] } } });
  if (env.ANTHROPIC_API_KEY) claude.push({ id: "claude", model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.ANTHROPIC_MODEL || CLAUDE_DIRECT_MODEL), providerOptions: {} });
  const rest = textRoutes(user, tag, env);
  const byHop: Record<string, TextRoute[]> = { claude, openai: rest.filter((r) => r.id === "openai"), gateway: rest.filter((r) => r.id === "gateway") };
  const list = order.flatMap((h) => byHop[h] ?? []);
  return list.length ? list : [...claude, ...rest];
}

/** Language models for the assistant, in the order to try them. */
export function textRoutes(user: string, tag: string, env: Env = process.env): TextRoute[] {
  return textPlan(env).map((p): TextRoute => p.id === "openai"
    ? { id: "openai", model: createOpenAI({ apiKey: env.OPENAI_API_KEY })(p.model), providerOptions: { openai: { safetyIdentifier: user } } }
    : { id: "gateway", model: p.model, providerOptions: { gateway: { models: ASSISTANT_FALLBACKS, user, tags: [tag] } } });
}
