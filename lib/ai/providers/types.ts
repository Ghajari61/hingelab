/**
 * The AI Studio's model providers behind one interface, so routes never depend on a vendor: an image
 * provider makes or edits a picture, a text route is a language model with its call options. Keys are
 * read on the server only (lib/ai/providers/index.ts); nothing here is sent to a browser or the app.
 */
import type { LanguageModel, generateText } from "ai";

export interface ImageData {
  data: Uint8Array;
  mediaType: string;
}

export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";

export interface ImageJob {
  prompt: string;
  /** Source pictures for an edit (image-to-image, redraw, expand); none for text-to-image. */
  images?: ImageData[];
  /** Where an edit may paint: fully transparent pixels are repainted, the rest is kept. */
  mask?: ImageData;
  size?: ImageSize;
  /** "high" costs more and draws finer detail (missing: medium). */
  quality?: "medium" | "high";
  /** A transparent background instead of a white one, for stickers and layered art. */
  transparent?: boolean;
  /** Hashed user id, passed to the provider for abuse tracking. */
  user: string;
  signal?: AbortSignal;
}

export interface ImageResult extends ImageData {
  provider: string;
  model: string;
}

export interface ImageProvider {
  /** "openai", "gateway" or "mock". */
  id: string;
  model: string;
  image(job: ImageJob): Promise<ImageResult>;
}

export interface TextRoute {
  id: string;
  model: LanguageModel;
  providerOptions: NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;
}

/** The provider account has no paid credit (OpenAI quota, AI Gateway free tier): nothing the user can change. */
export const isBillingError = (e: unknown) =>
  /no credits remaining|insufficient_quota|exceeded your current quota|billing|free tier users|top.?up|payment required/i.test(e instanceof Error ? e.message : String(e));

/** A provider failure. `retry` false means the next provider would refuse too (the prompt was blocked). */
export class ProviderError extends Error {
  constructor(message: string, readonly provider: string, readonly retry = true) {
    super(message);
  }
}
