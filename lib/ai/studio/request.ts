/**
 * AI Studio requests, checked the same way on the server whichever app sent them. Types and checks
 * only: safe in the browser.
 */
import { z } from "zod";
import { STYLE_PRESETS } from "./styles";

export const MAX_STUDIO_PROMPT = 1000;
/**
 * Largest picture sent (data URL characters). The Studio sends JPEG at most 1536 px on the long side,
 * plus a small PNG mask; Vercel takes request bodies up to 4.5 MB.
 */
export const MAX_STUDIO_IMAGE = 3_000_000;
export const MAX_STUDIO_MASK = 600_000;
export const MAX_STUDIO_BODY = MAX_STUDIO_IMAGE + MAX_STUDIO_MASK + 8_000;

const dataUrl = (max: number) => z.string().max(max).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Send a PNG, JPEG or WebP picture.");
const STYLE_IDS = STYLE_PRESETS.map((s) => s.id) as [string, ...string[]];

export const imageRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("generate"), prompt: z.string().trim().min(3).max(MAX_STUDIO_PROMPT), style: z.enum(STYLE_IDS).optional(), aspect: z.enum(["square", "wide", "tall"]).default("square") }),
  z.object({ op: z.literal("restyle"), prompt: z.string().trim().max(MAX_STUDIO_PROMPT).default(""), style: z.enum(STYLE_IDS).optional(), image: dataUrl(MAX_STUDIO_IMAGE), sketch: z.boolean().default(false) }),
  z.object({ op: z.literal("redraw"), prompt: z.string().trim().min(2).max(MAX_STUDIO_PROMPT), image: dataUrl(MAX_STUDIO_IMAGE), mask: dataUrl(MAX_STUDIO_MASK) }),
  z.object({ op: z.literal("expand"), prompt: z.string().trim().max(MAX_STUDIO_PROMPT).default(""), image: dataUrl(MAX_STUDIO_IMAGE), mask: dataUrl(MAX_STUDIO_MASK) }),
  z.object({ op: z.literal("cutout"), image: dataUrl(MAX_STUDIO_IMAGE) }),
]);

export type ImageRequest = z.infer<typeof imageRequestSchema>;

export interface ImageResponse {
  /** PNG or other picture as a data URL. */
  image: string;
  credits: number;
  provider: string;
  model: string;
}

export const MAX_CHAT_TURNS = 16;
export const MAX_CHAT_TEXT = 2000;

export const assistantRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(MAX_CHAT_TEXT) })).min(1).max(MAX_CHAT_TURNS),
  context: z.object({
    material: z.string().max(80).optional(),
    machine: z.string().max(80).optional(),
    sheet: z.object({ w: z.number().positive().max(5000), h: z.number().positive().max(5000) }).optional(),
    layers: z.array(z.object({ index: z.number().int().min(0).max(63), name: z.string().max(60), mode: z.enum(["cut", "score", "fill", "image"]) })).max(32).optional(),
    selection: z.string().max(400).optional(),
  }).default({}),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** What the assistant asks the Studio to do; the user applies each one with a click. */
export type AssistantAction =
  | { kind: "layer"; layer: number; name: string; power: number; speed: number; passes: number; interval?: number; note: string }
  | { kind: "design"; name: string; productName: string; summary: string; svg?: string; width?: number; height?: number; open?: string; product: string; preset: string | null; params: Record<string, unknown>; notes: string[]; error?: string; locked?: string }
  | { kind: "image"; prompt: string; style?: string };

export interface AssistantResponse {
  reply: string;
  actions: AssistantAction[];
  credits: number;
}

export const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid request.";
