/**
 * Which providers a deployment has, from its environment. Pure, so tests pass their own environment.
 * The deployment's own OpenAI key goes first (its own billing), then the Vercel AI Gateway (the
 * deployment's OIDC token on Vercel, or AI_GATEWAY_API_KEY elsewhere).
 */
export type Env = Record<string, string | undefined>;

/** Gateway image model; the deployment can override it with AI_IMAGE_MODEL. */
export const IMAGE_MODEL = "openai/gpt-image-2";
/** OpenAI image model when OPENAI_API_KEY is set; OPENAI_IMAGE_MODEL overrides it. */
export const OPENAI_IMAGE_MODEL = "gpt-image-2";
/** Gateway text model for the assistant; AI_ASSISTANT_MODEL overrides it, then AI_DESIGN_MODEL. */
export const ASSISTANT_MODEL = "openai/gpt-6-astra";
/** Older models if Astra is refused. The last one is the AI Gateway free-tier model. */
export const ASSISTANT_FALLBACKS = ["openai/gpt-5.6-luna", "openai/gpt-5-mini"];
/** Direct OpenAI model. GPT-6 Astra is the newest ChatGPT model; OPENAI_MODEL overrides it. */
export const OPENAI_TEXT_MODEL = "gpt-6-astra";

/** Google's Nano Banana image model (Gemini image) with GOOGLE_GENERATIVE_AI_API_KEY; GOOGLE_IMAGE_MODEL overrides it. */
export const GOOGLE_IMAGE_MODEL = "gemini-nano-banana-2.1";

export const gatewayAvailable = (env: Env) => !!(env.VERCEL || env.VERCEL_OIDC_TOKEN || env.AI_GATEWAY_API_KEY);
export const openaiAvailable = (env: Env) => !!env.OPENAI_API_KEY;
export const googleAvailable = (env: Env) => !!env.GOOGLE_GENERATIVE_AI_API_KEY;
export const anyProvider = (env: Env) => gatewayAvailable(env) || openaiAvailable(env) || googleAvailable(env);
/** Anything AI Studio's cloud tools can use: a picture service, or Claude for vector drawings. */
export const studioProvider = (env: Env) => anyProvider(env) || !!env.ANTHROPIC_API_KEY;

export interface ProviderPlan { id: "openai" | "gateway" | "google"; model: string }

/** Pictures: Nano Banana first when its key is set, then OpenAI, then the Gateway. */
export function imagePlan(env: Env): ProviderPlan[] {
  const out: ProviderPlan[] = [];
  if (googleAvailable(env)) out.push({ id: "google", model: env.GOOGLE_IMAGE_MODEL || GOOGLE_IMAGE_MODEL });
  if (openaiAvailable(env)) out.push({ id: "openai", model: env.OPENAI_IMAGE_MODEL || OPENAI_IMAGE_MODEL });
  if (gatewayAvailable(env)) out.push({ id: "gateway", model: env.AI_IMAGE_MODEL || IMAGE_MODEL });
  return out;
}

export function textPlan(env: Env): { id: "openai" | "gateway"; model: string }[] {
  const out: { id: "openai" | "gateway"; model: string }[] = [];
  if (openaiAvailable(env)) out.push({ id: "openai", model: env.OPENAI_MODEL || OPENAI_TEXT_MODEL });
  if (gatewayAvailable(env)) out.push({ id: "gateway", model: env.AI_ASSISTANT_MODEL || env.AI_DESIGN_MODEL || ASSISTANT_MODEL });
  return out;
}
