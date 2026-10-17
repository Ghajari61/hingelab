/**
 * Looks for AI Studio's picture generation, each written for laser output: what the picture should
 * look like, and how the Studio turns it into something to cut or engrave afterwards.
 */
export type StyleId =
  | "line-art" | "flat" | "hatch" | "woodcut" | "stencil" | "mandala" | "silhouette" | "sticker" | "layered" | "photo"
  | "girih" | "calligraphy-panel" | "eslimi" | "art-nouveau" | "celtic" | "low-poly" | "topographic" | "zentangle"
  | "kirigami" | "botanical" | "tattoo" | "one-line" | "comic" | "blueprint" | "stained-glass";

export type StyleGroup = "Lines" | "Shapes" | "Tones" | "Ornament";

export interface StylePreset {
  id: StyleId;
  name: string;
  /** One line for the picker. */
  blurb: string;
  group: StyleGroup;
  /** Added to the user's words. */
  prompt: string;
  /** What the Studio suggests next: trace to vectors, dither to engrave, or keep the picture. */
  next: "vectorize" | "centerline" | "engrave" | "layers";
}

const BASE = "Pure white background, no frame, no border, no text or lettering unless the request asks for words, no watermark, the whole subject inside the picture.";

export const STYLE_PRESETS: StylePreset[] = [
  { id: "line-art", name: "Line art", blurb: "Clean black outlines, nothing filled", group: "Lines", next: "centerline",
    prompt: "Clean line drawing in solid black ink, even line weight, no shading, no grey, no fills, every outline closed." },
  { id: "one-line", name: "One line", blurb: "A single continuous stroke", group: "Lines", next: "centerline",
    prompt: "Minimal continuous one-line drawing: the whole subject drawn with a single unbroken black line of even weight, elegant and sparse, no fills." },
  { id: "hatch", name: "Engraving hatch", blurb: "Old-print line shading", group: "Lines", next: "engrave",
    prompt: "Black and white engraving in the style of an antique book plate: shading made only of fine parallel and crossing lines, no solid grey." },
  { id: "blueprint", name: "Blueprint", blurb: "Technical drawing lines", group: "Lines", next: "centerline",
    prompt: "Technical blueprint-style line drawing in black on white: precise construction lines, clean geometry, a few dimension-like guide lines, no shading." },
  { id: "botanical", name: "Botanical", blurb: "Fine plant illustration", group: "Lines", next: "vectorize",
    prompt: "Fine botanical illustration in black ink: leaves, stems and flowers with clear outlines and delicate vein lines, balanced composition, no grey wash." },
  { id: "topographic", name: "Topographic", blurb: "Contour lines like a map", group: "Lines", next: "centerline",
    prompt: "Topographic contour-line art in black on white: smooth evenly spaced contour lines that follow the form, no fills, no shading." },
  { id: "flat", name: "Flat vector", blurb: "Bold flat shapes, few colours", group: "Shapes", next: "vectorize",
    prompt: "Flat vector illustration with a few solid colours, bold simple shapes, no gradients, no shadows, no texture." },
  { id: "silhouette", name: "Silhouette", blurb: "One solid black shape", group: "Shapes", next: "vectorize",
    prompt: "A single solid black silhouette with a clean, recognisable outline and no inner detail, centred." },
  { id: "stencil", name: "Stencil", blurb: "Islands joined, ready to cut", group: "Shapes", next: "vectorize",
    prompt: "Single-colour stencil design in solid black: every black area joins the others, white areas inside shapes are connected to the outside by bridges, no thin hairlines." },
  { id: "woodcut", name: "Woodcut", blurb: "Bold carved black and white", group: "Shapes", next: "vectorize",
    prompt: "Bold woodcut print, black and white only, thick carved strokes, strong contrast, no grey tones." },
  { id: "sticker", name: "Sticker", blurb: "Cartoon with a thick outline", group: "Shapes", next: "vectorize",
    prompt: "Cute cartoon sticker with a thick black outline around the whole subject, flat colours, simple shapes." },
  { id: "tattoo", name: "Tattoo flash", blurb: "Bold traditional linework", group: "Shapes", next: "vectorize",
    prompt: "Traditional tattoo flash design in black: bold confident outlines, solid black accents, simple dot shading, iconic composition." },
  { id: "comic", name: "Comic ink", blurb: "Inked comic panel look", group: "Shapes", next: "vectorize",
    prompt: "Bold comic-book ink illustration in black and white: confident brush outlines, solid black shadows, simple halftone dots, dynamic pose." },
  { id: "low-poly", name: "Low poly", blurb: "Faceted geometric planes", group: "Shapes", next: "vectorize",
    prompt: "Low-poly geometric illustration: the subject built from flat triangular facets with clear black edges between them, no gradients." },
  { id: "kirigami", name: "Paper cut", blurb: "Lace-like cut paper", group: "Shapes", next: "vectorize",
    prompt: "Intricate paper-cut (kirigami) design in solid black on white: lace-like cut patterns, every piece connected to the frame, no floating parts." },
  { id: "layered", name: "Layered", blurb: "3–5 tones for stacked layers", group: "Tones", next: "layers",
    prompt: "Layered paper-cut scene in 4 flat grey tones from dark (front) to light (back), each tone one solid area, no gradients, no outlines." },
  { id: "photo", name: "Photo", blurb: "Realistic, for photo engraving", group: "Tones", next: "engrave",
    prompt: "Realistic high-contrast black and white photograph with clear detail and good mid-tones." },
  { id: "stained-glass", name: "Stained glass", blurb: "Colour cells with lead lines", group: "Tones", next: "layers",
    prompt: "Stained-glass window design: flat colour cells separated by thick, even black lead lines, every cell closed, no gradients." },
  { id: "mandala", name: "Mandala", blurb: "Symmetric radial ornament", group: "Ornament", next: "vectorize",
    prompt: "Symmetric radial mandala ornament in solid black on white, crisp shapes with clear gaps between them, no hairlines thinner than the gaps." },
  { id: "girih", name: "Persian girih", blurb: "Geometric star patterns", group: "Ornament", next: "vectorize",
    prompt: "Persian girih geometric pattern in solid black on white: interlacing straps forming ten-point and five-point stars, precise symmetry, even strap width." },
  { id: "eslimi", name: "Eslimi", blurb: "Persian arabesque spirals", group: "Ornament", next: "vectorize",
    prompt: "Persian eslimi arabesque ornament in solid black on white: flowing spiral stems, split palmettes and leaves, symmetric, every part joined." },
  { id: "calligraphy-panel", name: "Calligraphy panel", blurb: "Frame for Persian lettering", group: "Ornament", next: "vectorize",
    prompt: "Ornamental frame for a Persian calligraphy panel in black on white: a cartouche with floral corners and a large empty centre where lettering is added later." },
  { id: "art-nouveau", name: "Art Nouveau", blurb: "Flowing organic curves", group: "Ornament", next: "vectorize",
    prompt: "Art Nouveau ornament in black on white: whiplash curves, stylised flowers and an elegant flowing frame, clean bold lines." },
  { id: "celtic", name: "Celtic knot", blurb: "Interlaced endless knots", group: "Ornament", next: "vectorize",
    prompt: "Celtic knotwork in black on white: continuous interlaced bands crossing over and under with clear gaps, even band width, symmetric." },
  { id: "zentangle", name: "Zentangle", blurb: "Patterned doodle fills", group: "Ornament", next: "engrave",
    prompt: "Zentangle-style illustration in black ink: the subject outline filled with varied repeating doodle patterns in separate sections, crisp and detailed." },
];

export const STYLE_GROUPS: StyleGroup[] = ["Lines", "Shapes", "Tones", "Ornament"];

export const styleById = (id: string) => STYLE_PRESETS.find((s) => s.id === id);

export function stylePrompt(user: string, style?: string): string {
  const s = style ? styleById(style) : undefined;
  return [user.trim(), s?.prompt, BASE].filter(Boolean).join("\n");
}
