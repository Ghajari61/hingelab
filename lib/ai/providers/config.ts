/**
 * Which providers a deployment has, from its environment. Pure, so tests pass their own environment.
 * The owner chose Google only (Nano Banana for pictures, Gemini for words and drawings), so only
 * Google is used unless AI_VENDORS names the others (comma list of google, openai, anthropic,
 * gateway); their keys alone no longer switch them on.
 */
export type Env = Record<string, string | undefined>;

export type Vendor = "google" | "openai" | "anthropic" | "gateway";
const VENDORS: Vendor[] = ["google", "openai", "anthropic", "gateway"];

/** The vendors the deployment allows, in its order (missing: Google only). */
export function vendors(env: Env): Vendor[] {
  const raw = (env.AI_VENDORS || "google").split(",").map((s) => s.trim().toLowerCase());
  const list = raw.filter((v): v is Vendor => (VENDORS as string[]).includes(v));
  return list.length ? [...new Set(list)] : ["google"];
}
const allows = (env: Env, v: Vendor) => vendors(env).includes(v);

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

/** Google's Nano Banana image models, newest first; GOOGLE_IMAGE_MODEL puts another one first. */
export const GOOGLE_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const GOOGLE_IMAGE_FALLBACKS = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
/**
 * Gemini for words, plans and SVG drawings: the strongest first, then fast ones. Each model has its
 * own quota and can be busy on its own, so the chain is long. GOOGLE_TEXT_MODEL overrides the first.
 */
export const GOOGLE_TEXT_MODEL = "gemini-pro-latest";
export const GOOGLE_TEXT_FALLBACKS = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-lite-latest"];

export const gatewayAvailable = (env: Env) => allows(env, "gateway") && !!(env.VERCEL || env.VERCEL_OIDC_TOKEN || env.AI_GATEWAY_API_KEY);
export const openaiAvailable = (env: Env) => allows(env, "openai") && !!env.OPENAI_API_KEY;
export const anthropicAvailable = (env: Env) => allows(env, "anthropic") && !!env.ANTHROPIC_API_KEY;
export const googleAvailable = (env: Env) => allows(env, "google") && !!env.GOOGLE_GENERATIVE_AI_API_KEY;
export const anyProvider = (env: Env) => gatewayAvailable(env) || openaiAvailable(env) || googleAvailable(env);
/** Anything AI Studio's cloud tools can use: a picture service, or a model that draws vectors. */
export const studioProvider = (env: Env) => anyProvider(env) || anthropicAvailable(env);
/** Anything the AI designer can use. */
export const designProvider = (env: Env) => googleAvailable(env) || openaiAvailable(env) || anthropicAvailable(env) || gatewayAvailable(env);

export interface ProviderPlan { id: "openai" | "gateway" | "google"; model: string }

/** Pictures: Nano Banana (newest model first), then OpenAI and the Gateway when allowed. */
export function imagePlan(env: Env): ProviderPlan[] {
  const out: ProviderPlan[] = [];
  if (googleAvailable(env)) {
    const first = env.GOOGLE_IMAGE_MODEL || GOOGLE_IMAGE_MODEL;
    for (const model of [first, GOOGLE_IMAGE_MODEL, ...GOOGLE_IMAGE_FALLBACKS]) if (!out.some((p) => p.model === model)) out.push({ id: "google", model });
  }
  if (openaiAvailable(env)) out.push({ id: "openai", model: env.OPENAI_IMAGE_MODEL || OPENAI_IMAGE_MODEL });
  if (gatewayAvailable(env)) out.push({ id: "gateway", model: env.AI_IMAGE_MODEL || IMAGE_MODEL });
  return out;
}

/** Gemini text models, in the order to try them. */
export function googleTextPlan(env: Env): string[] {
  if (!googleAvailable(env)) return [];
  return [...new Set([env.GOOGLE_TEXT_MODEL || GOOGLE_TEXT_MODEL, ...GOOGLE_TEXT_FALLBACKS])];
}

export function textPlan(env: Env): { id: "openai" | "gateway"; model: string }[] {
  const out: { id: "openai" | "gateway"; model: string }[] = [];
  if (openaiAvailable(env)) out.push({ id: "openai", model: env.OPENAI_MODEL || OPENAI_TEXT_MODEL });
  if (gatewayAvailable(env)) out.push({ id: "gateway", model: env.AI_ASSISTANT_MODEL || env.AI_DESIGN_MODEL || ASSISTANT_MODEL });
  return out;
}
