/**
 * AI design kits: ready recipes that fill in a prompt, pick a style, and say what happens to the
 * picture after it is made (traced, engraved, or sent to a generator). The user only names the subject.
 */
import type { StyleId } from "./styles";

export type KitTarget = "canvas" | "topper" | "sign" | "trophy" | "lamp" | "puzzle" | "relief";

export interface DesignKit {
  id: string;
  name: string;
  blurb: string;
  /** What the user types, e.g. "your dog's breed". */
  ask: string;
  placeholder: string;
  /** The prompt, with {x} where the user's words go. */
  prompt: string;
  style: StyleId;
  /** How many variations to make. */
  count: 1 | 2 | 3 | 4;
  /** Width on the material, mm. */
  widthMm: number;
  then: "vectorize" | "engrave" | "layers";
  target: KitTarget;
}

export const DESIGN_KITS: DesignKit[] = [
  { id: "topper", name: "Cake topper", blurb: "A welded silhouette on a stake", ask: "What is it for?", placeholder: "30th birthday with balloons",
    prompt: "Cake topper silhouette for {x}", style: "silhouette", count: 2, widthMm: 140, then: "vectorize", target: "topper" },
  { id: "pet-coaster", name: "Pet portrait coaster", blurb: "Photo-style engraving on a 90 mm round", ask: "Which animal?", placeholder: "golden retriever puppy",
    prompt: "Head-and-shoulders portrait of a {x}, facing the viewer", style: "hatch", count: 2, widthMm: 90, then: "engrave", target: "canvas" },
  { id: "door-sign", name: "Door sign motif", blurb: "Line motif for a house or shop sign", ask: "What should it show?", placeholder: "a coffee cup with steam",
    prompt: "{x}, simple and bold, readable from a distance", style: "line-art", count: 2, widthMm: 120, then: "vectorize", target: "sign" },
  { id: "trophy", name: "Trophy emblem", blurb: "A cut-out emblem for the Trophy generator", ask: "Which sport or prize?", placeholder: "football",
    prompt: "Emblem for a {x} award: one bold solid shape", style: "silhouette", count: 2, widthMm: 110, then: "vectorize", target: "trophy" },
  { id: "lamp", name: "Lantern pattern", blurb: "A motif repeated as lamp perforations", ask: "Which motif?", placeholder: "small stars and moons",
    prompt: "One small simple motif: {x}", style: "silhouette", count: 2, widthMm: 40, then: "vectorize", target: "lamp" },
  { id: "kids-puzzle", name: "Kids' puzzle picture", blurb: "A bright scene engraved on a puzzle", ask: "What scene?", placeholder: "dinosaurs in a jungle",
    prompt: "Bright friendly children's illustration of {x}", style: "flat", count: 2, widthMm: 280, then: "engrave", target: "puzzle" },
  { id: "mandala-set", name: "Mandala coaster set", blurb: "Four matching mandalas to cut", ask: "Theme", placeholder: "ocean waves and shells",
    prompt: "Round mandala with a {x} theme", style: "mandala", count: 4, widthMm: 95, then: "vectorize", target: "canvas" },
  { id: "layered-art", name: "Layered wall art", blurb: "A scene split into stacked layers", ask: "Which scene?", placeholder: "mountains at sunrise",
    prompt: "Layered landscape: {x}", style: "layered", count: 1, widthMm: 250, then: "layers", target: "canvas" },
];

export const kitById = (id: string) => DESIGN_KITS.find((k) => k.id === id);

export const kitPrompt = (k: DesignKit, words: string) => k.prompt.replace("{x}", words.trim() || k.placeholder);
