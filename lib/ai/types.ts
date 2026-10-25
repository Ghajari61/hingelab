/** The AI designer's request and answer. Types and constants only, safe to import in the browser and the desktop app. */

export const AI_PRODUCTS = ["art", "hinge", "letters", "parametric", "boxes", "sign", "trophy", "topper", "keyrack", "tablenum", "clock", "puzzle", "qr", "shadowbox", "paperbox", "popup"] as const;
export type AIProduct = (typeof AI_PRODUCTS)[number];

export const isAIProduct = (v: unknown): v is AIProduct => typeof v === "string" && (AI_PRODUCTS as readonly string[]).includes(v);

/** sessionStorage key of the design the AI page hands to the editor (`/app/editor/local?p=<product>&ai=1`). */
export const AI_START_KEY = "hingelab-ai-start";

/** Longest description the designer reads. */
export const MAX_PROMPT = 1500;
/** Largest photo (a data URL; the apps shrink pictures to 1024 px JPEG before sending). */
export const MAX_IMAGE_CHARS = 1_400_000;

/** Longest note about the photo, characters. */
export const MAX_IMAGE_NOTE = 600;

export interface AIDesignRequest {
  prompt: string;
  /** A photo of the product as a data URL (JPEG, PNG or WebP). */
  image?: string;
  /** What the user says about the photo: what it shows, its size, what to change. Only sent with a photo. */
  imageNote?: string;
  /** Edit this design instead of starting a new one; `prompt` then says what to change. */
  revise?: AIRevise;
}

/** How closely the products can make what was asked. */
export type AIMatch = "exact" | "close" | "loose";

/** The design being edited, as the designer returned it. */
export interface AIRevise {
  product: AIProduct;
  preset: string | null;
  name: string;
  match: AIMatch;
  params: Record<string, unknown>;
}

/** Largest settings of a design sent back for editing, characters of JSON. */
export const MAX_REVISE_CHARS = 200_000;

/** The part of a design that is sent back to edit it. */
export const reviseOf = (d: AIDesign): AIRevise => ({ product: d.product, preset: d.preset, name: d.name, match: d.match, params: d.params });

export interface AIDesign {
  product: AIProduct;
  /** Display name of the product. */
  productName: string;
  name: string;
  /** The preset the design starts from, if any. */
  preset: string | null;
  /** Full settings of the design, opened in the product's editor. */
  params: Record<string, unknown>;
  summary: string;
  match: AIMatch;
  /** What the designer assumed or could not do, in short sentences. */
  notes: string[];
  /** The cut file when the caller's plan can export this design (Hinge Box and generators). */
  svg?: string;
  /** Sheet size, mm. */
  width?: number;
  height?: number;
  /** Why the preview needs Pro. */
  locked?: string;
  /** Why the cut file could not be built (the design still opens in the editor). */
  error?: string;
  stats?: { label: string; value: string }[];
  /** Letters and Parametric: a website path that opens the design in its editor (how the desktop app gets there). */
  open?: string;
  /** File name for saving the cut file. */
  fileName?: string;
}

/** What an `open` link carries: the preset and only the settings that differ from it. */
export interface AIOpen {
  product: AIProduct;
  preset: string | null;
  name: string;
  params: Record<string, unknown>;
}

/** Start of `AIDesign.open`; the rest is the AIOpen as base64url JSON. */
export const AI_OPEN_PREFIX = "/app/ai#open=";
/**
 * The desktop app's website view takes paths up to 512 characters, and when it is not signed in
 * yet the link goes inside a one-time sign-in link of about 110 characters more.
 */
export const MAX_OPEN_PATH = 380;
