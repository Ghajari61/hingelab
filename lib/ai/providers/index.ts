import "server-only";
/**
 * Real providers for the deployment's environment: Google's Nano Banana and OpenAI with the
 * deployment's own keys, then the Vercel AI Gateway. Keys stay in process.env on the server; the browser and the desktop app only
 * ever talk to HingeLab's routes.
 */
import { createHash } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, generateImage, type ImageModel } from "ai";
import { anthropicAvailable, ASSISTANT_FALLBACKS, gatewayAvailable, googleTextPlan, imagePlan, textPlan, vendors, type Env, type ProviderPlan } from "./config";
import { ProviderError, type ImageJob, type ImageProvider, type TextRoute } from "./types";

export * from "./types";
export { withFallback } from "./fallback";
export { anyProvider, designProvider, imagePlan, textPlan, vendors } from "./config";

/** A user id the providers can track abuse by, without learning who the user is. */
export const userTag = (scope: string, userId: string) => createHash("sha256").update(`${scope}:${userId}`).digest("hex").slice(0, 24);

/** Prompts the provider's safety system blocks would be blocked by the next provider too. */
const BLOCKED = /safety|moderation|content[_ ]policy|policy violation|not allowed|rejected by/i;

const ASPECT: Record<string, "1:1" | "3:2" | "2:3"> = { "1024x1024": "1:1", "1536x1024": "3:2", "1024x1536": "2:3" };

/**
 * Google's Nano Banana (Gemini image): sizes become aspect ratios, and it takes no mask, so an edit
 * sends the mask as a second picture and says where to paint. No transparent background either:
 * the Studio turns white into transparent where it needs to.
 */
export function googleImageProvider(plan: ProviderPlan, model: ImageModel): ImageProvider {
  return {
    id: plan.id,
    model: plan.model,
    async image(job: ImageJob) {
      try {
        const files = [...(job.images ?? []), ...(job.mask ? [job.mask] : [])].map((i) => i.data);
        const text = job.mask
          ? `${job.prompt}\nThe last picture is a mask of the first: change only where the mask is transparent and keep everything else exactly as it is.`
          : job.prompt;
        const { image } = await generateImage({
          model,
          prompt: files.length ? { text, images: files } : text,
          aspectRatio: ASPECT[job.size ?? "1024x1024"] ?? "1:1",
          n: 1,
          maxRetries: 1,
          abortSignal: job.signal,
        });
        return { data: image.uint8Array, mediaType: image.mediaType || "image/png", provider: plan.id, model: plan.model };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new ProviderError(msg.slice(0, 300), plan.id, !BLOCKED.test(msg));
      }
    },
  };
}

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
  return imagePlan(env).map((p) => p.id === "google"
    ? googleImageProvider(p, createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }).image(p.model))
    : aiSdkImageProvider(p, p.id === "openai" ? createOpenAI({ apiKey: env.OPENAI_API_KEY }).image(p.model) : gateway.image(p.model)));
}

/** Gateway and direct Claude, used first for writing and judging designs. */
export const CLAUDE_GATEWAY_MODEL = "anthropic/claude-sonnet-5-5";
export const CLAUDE_DIRECT_MODEL = "claude-sonnet-5-5";

/** Gemini text routes: the strongest model, then the fast one. */
export function googleTextRoutes(env: Env = process.env): TextRoute[] {
  const plan = googleTextPlan(env);
  if (!plan.length) return [];
  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return plan.map((m, i): TextRoute => ({ id: i ? "google-fast" : "google", model: google(m), providerOptions: {} }));
}

/**
 * Every model for words, plans and drawings, in the deployment's vendor order (AI_VENDORS; Google
 * only unless it says otherwise): Gemini, then Claude, OpenAI and the Gateway when allowed.
 */
export function claudeFirstRoutes(user: string, tag: string, env: Env = process.env): TextRoute[] {
  const claude: TextRoute[] = [];
  if (anthropicAvailable(env)) claude.push({ id: "claude", model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.ANTHROPIC_MODEL || CLAUDE_DIRECT_MODEL), providerOptions: {} });
  if (anthropicAvailable(env) && gatewayAvailable(env)) claude.push({ id: "claude-gateway", model: env.AI_CLAUDE_MODEL || CLAUDE_GATEWAY_MODEL, providerOptions: { gateway: { user, tags: [tag] } } });
  const rest = textRoutes(user, tag, env);
  const byVendor: Record<string, TextRoute[]> = {
    google: googleTextRoutes(env), anthropic: claude, openai: rest.filter((r) => r.id === "openai"), gateway: rest.filter((r) => r.id === "gateway"),
  };
  return vendors(env).flatMap((v) => byVendor[v] ?? []);
}

/** The same routes under the name the AI designer uses. */
export const designRoutes = claudeFirstRoutes;

/** Language models for the assistant, in the order to try them. */
export function textRoutes(user: string, tag: string, env: Env = process.env): TextRoute[] {
  return textPlan(env).map((p): TextRoute => p.id === "openai"
    ? { id: "openai", model: createOpenAI({ apiKey: env.OPENAI_API_KEY })(p.model), providerOptions: { openai: { safetyIdentifier: user } } }
    : { id: "gateway", model: p.model, providerOptions: { gateway: { models: ASSISTANT_FALLBACKS, user, tags: [tag] } } });
}
