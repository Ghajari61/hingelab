/**
 * AI Studio requests, checked the same way on the server whichever app sent them. Types and checks
 * only: safe in the browser.
 */
import { z } from "zod";
import { STYLE_PRESETS } from "./styles";

export const MAX_STUDIO_PROMPT = 1000;
/** A picture prompt as sent: the user's words (or the Creative Director's brief) plus the Laser Brief line. */
export const MAX_IMAGE_PROMPT = 2000;
/**
 * Largest picture sent (data URL characters). The Studio sends JPEG at most 1536 px on the long side,
 * plus a small PNG mask; Vercel takes request bodies up to 4.5 MB.
 */
export const MAX_STUDIO_IMAGE = 3_000_000;
export const MAX_STUDIO_MASK = 600_000;
export const MAX_STUDIO_BODY = Math.max(MAX_STUDIO_IMAGE + MAX_STUDIO_MASK, 3 * 900_000) + 8_000;

const dataUrl = (max: number) => z.string().max(max).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Send a PNG, JPEG or WebP picture.");
const STYLE_IDS = STYLE_PRESETS.map((s) => s.id) as [string, ...string[]];

/** Reference pictures sent with a prompt: up to three small JPEGs. */
export const MAX_STUDIO_REFS = 3;
export const MAX_STUDIO_REF = 900_000;
/** Variations of one prompt made at once (each is its own job). */
export const MAX_VARIATIONS = 4;

const quality = z.enum(["medium", "high"]).default("medium");

export const imageRequestSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("generate"), prompt: z.string().trim().min(3).max(MAX_IMAGE_PROMPT), style: z.enum(STYLE_IDS).optional(), aspect: z.enum(["square", "wide", "tall"]).default("square"),
    quality, transparent: z.boolean().default(false),
    /** Which of several variations this is (0-based): each asks for a different composition. */
    variation: z.number().int().min(0).max(MAX_VARIATIONS - 1).optional(),
    refs: z.array(dataUrl(MAX_STUDIO_REF)).max(MAX_STUDIO_REFS).optional(),
  }),
  z.object({ op: z.literal("restyle"), prompt: z.string().trim().max(MAX_IMAGE_PROMPT).default(""), style: z.enum(STYLE_IDS).optional(), image: dataUrl(MAX_STUDIO_IMAGE), sketch: z.boolean().default(false), quality }),
  z.object({ op: z.literal("redraw"), prompt: z.string().trim().min(2).max(MAX_STUDIO_PROMPT), image: dataUrl(MAX_STUDIO_IMAGE), mask: dataUrl(MAX_STUDIO_MASK) }),
  z.object({ op: z.literal("expand"), prompt: z.string().trim().max(MAX_STUDIO_PROMPT).default(""), image: dataUrl(MAX_STUDIO_IMAGE), mask: dataUrl(MAX_STUDIO_MASK) }),
  z.object({ op: z.literal("cutout"), image: dataUrl(MAX_STUDIO_IMAGE) }),
]);

/** A request before its defaults are filled in (what callers may send). */
export type ImageRequest = z.input<typeof imageRequestSchema>;

export interface ImageResponse {
  /** PNG or other picture as a data URL. */
  image: string;
  credits: number;
  provider: string;
  model: string;
  /** Shown with the result, e.g. that Claude drew it as vectors. */
  note?: string;
}

// ------------------------------------------------------------------ Creative Director and review

export const BRIEF_PRODUCTS = ["canvas", "topper", "sign", "trophy", "lamp", "puzzle", "coaster", "ornament", "wall-art", "keychain", "box-lid", "shadowbox"] as const;
export const BRIEF_METHODS = ["cut", "engrave", "score", "layers"] as const;
export type BriefProduct = (typeof BRIEF_PRODUCTS)[number];
export type BriefMethod = (typeof BRIEF_METHODS)[number];

/** What the user is making: the Laser Brief that shapes every prompt. */
export const laserBriefSchema = z.object({
  product: z.enum(BRIEF_PRODUCTS).default("canvas"),
  method: z.enum(BRIEF_METHODS).default("cut"),
  material: z.string().trim().max(80).default(""),
  widthMm: z.number().min(10).max(3000).optional(),
});
export type LaserBrief = z.infer<typeof laserBriefSchema>;

export const directorRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("enhance"), prompt: z.string().trim().min(2).max(MAX_STUDIO_PROMPT), style: z.enum(STYLE_IDS).optional(), brief: laserBriefSchema.default({ product: "canvas", method: "cut", material: "" }) }),
  z.object({ op: z.literal("critique"), image: dataUrl(MAX_STUDIO_IMAGE), prompt: z.string().trim().max(MAX_STUDIO_PROMPT).default(""), brief: laserBriefSchema.default({ product: "canvas", method: "cut", material: "" }) }),
]);
export type DirectorRequest = z.infer<typeof directorRequestSchema>;

/** The Creative Director's design brief, which the user can edit before making pictures. */
export interface EnhanceResponse {
  title: string;
  /** The prompt the image model gets (English). */
  prompt: string;
  /** The distinct parts the design should show. */
  elements: string[];
  /** Words to set as real text after the picture is made (any language). */
  text: string[];
  credits: number;
}

export interface CritiqueResponse {
  /** 0–100: how well the picture suits the brief and the laser. */
  score: number;
  /** Short problems, at most four. */
  issues: string[];
  /** A better prompt to try, or empty when the picture is good. */
  fix: string;
  credits: number;
}

export const MAX_CHAT_TURNS = 16;
export const MAX_CHAT_TEXT = 2000;
/** The selected picture sent with a chat message (a small JPEG). */
export const MAX_CHAT_IMAGE = 300_000;

export const assistantRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(MAX_CHAT_TEXT) })).min(1).max(MAX_CHAT_TURNS),
  context: z.object({
    material: z.string().max(80).optional(),
    machine: z.string().max(80).optional(),
    sheet: z.object({ w: z.number().positive().max(5000), h: z.number().positive().max(5000) }).optional(),
    layers: z.array(z.object({ index: z.number().int().min(0).max(63), name: z.string().max(60), mode: z.enum(["cut", "score", "fill", "image"]) })).max(32).optional(),
    selection: z.string().max(400).optional(),
    /** The selected picture, small, for review_selection. */
    image: dataUrl(MAX_CHAT_IMAGE).optional(),
  }).default({}),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** What the assistant asks the Studio to do; the user applies each one with a click. */
export type AssistantAction =
  | { kind: "layer"; layer: number; name: string; power: number; speed: number; passes: number; interval?: number; note: string }
  | { kind: "design"; name: string; productName: string; summary: string; svg?: string; width?: number; height?: number; open?: string; product: string; preset: string | null; params: Record<string, unknown>; notes: string[]; error?: string; locked?: string }
  | { kind: "image"; prompt: string; style?: string; count?: number }
  | { kind: "recipe"; recipe: string; words: string; fields?: Record<string, string> };

export interface AssistantResponse {
  reply: string;
  actions: AssistantAction[];
  credits: number;
}

export const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid request.";
