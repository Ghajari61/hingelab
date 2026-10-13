/**
 * Looks for AI Studio's picture generation, each written for laser output: what the picture should
 * look like, and how the Studio turns it into something to cut or engrave afterwards.
 */
export type StyleId = "line-art" | "flat" | "hatch" | "woodcut" | "stencil" | "mandala" | "silhouette" | "sticker" | "layered" | "photo";

export interface StylePreset {
  id: StyleId;
  name: string;
  /** One line for the picker. */
  blurb: string;
  /** Added to the user's words. */
  prompt: string;
  /** What the Studio suggests next: trace to vectors, dither to engrave, or keep the picture. */
  next: "vectorize" | "centerline" | "engrave" | "layers";
}

const BASE = "Pure white background, no frame, no border, no text or lettering unless the request asks for words, no watermark, the whole subject inside the picture.";

export const STYLE_PRESETS: StylePreset[] = [
  { id: "line-art", name: "Line art", blurb: "Clean black outlines, nothing filled", next: "centerline",
    prompt: "Clean line drawing in solid black ink, even line weight, no shading, no grey, no fills, every outline closed." },
  { id: "flat", name: "Flat vector", blurb: "Bold flat shapes, few colours", next: "vectorize",
    prompt: "Flat vector illustration with a few solid colours, bold simple shapes, no gradients, no shadows, no texture." },
  { id: "hatch", name: "Engraving hatch", blurb: "Old-print line shading", next: "engrave",
    prompt: "Black and white engraving in the style of an antique book plate: shading made only of fine parallel and crossing lines, no solid grey." },
  { id: "woodcut", name: "Woodcut", blurb: "Bold carved black and white", next: "vectorize",
    prompt: "Bold woodcut print, black and white only, thick carved strokes, strong contrast, no grey tones." },
  { id: "stencil", name: "Stencil", blurb: "Islands joined, ready to cut", next: "vectorize",
    prompt: "Single-colour stencil design in solid black: every black area joins the others, white areas inside shapes are connected to the outside by bridges, no thin hairlines." },
  { id: "mandala", name: "Mandala", blurb: "Symmetric radial ornament", next: "vectorize",
    prompt: "Symmetric radial mandala ornament in solid black on white, crisp shapes with clear gaps between them, no hairlines thinner than the gaps." },
  { id: "silhouette", name: "Silhouette", blurb: "One solid black shape", next: "vectorize",
    prompt: "A single solid black silhouette with a clean, recognisable outline and no inner detail, centred." },
  { id: "sticker", name: "Sticker", blurb: "Cartoon with a thick outline", next: "vectorize",
    prompt: "Cute cartoon sticker with a thick black outline around the whole subject, flat colours, simple shapes." },
  { id: "layered", name: "Layered", blurb: "3–5 tones for stacked layers", next: "layers",
    prompt: "Layered paper-cut scene in 4 flat grey tones from dark (front) to light (back), each tone one solid area, no gradients, no outlines." },
  { id: "photo", name: "Photo", blurb: "Realistic, for photo engraving", next: "engrave",
    prompt: "Realistic high-contrast black and white photograph with clear detail and good mid-tones." },
];

export const styleById = (id: string) => STYLE_PRESETS.find((s) => s.id === id);

export function stylePrompt(user: string, style?: string): string {
  const s = style ? styleById(style) : undefined;
  return [user.trim(), s?.prompt, BASE].filter(Boolean).join("\n");
}
