/**
 * The Laser Brief: what the user is making, on which material and how the laser treats it. It turns
 * into a line of the image prompt, so a picture for a slate engraving and one for an acrylic cut-out
 * are drawn differently. Pure and safe in the browser.
 */
import type { BriefMethod, BriefProduct, LaserBrief } from "./request";

export const PRODUCT_NAMES: Record<BriefProduct, string> = {
  canvas: "Free design", topper: "Cake topper", sign: "Sign", trophy: "Trophy emblem", lamp: "Lamp panel", puzzle: "Puzzle",
  coaster: "Coaster", ornament: "Ornament", "wall-art": "Wall art", keychain: "Keychain", "box-lid": "Box lid", shadowbox: "Shadow box",
};

export const METHOD_NAMES: Record<BriefMethod, string> = { cut: "Cut out", engrave: "Engrave", score: "Score lines", layers: "Stacked layers" };
/** One word each, for a segmented control. */
export const METHOD_SHORT: Record<BriefMethod, string> = { cut: "Cut", engrave: "Engrave", score: "Score", layers: "Layers" };

/** What each product needs from the picture, in words for the image model. */
const PRODUCT_NEEDS: Record<BriefProduct, string> = {
  canvas: "",
  topper: "It becomes a cake topper: one connected silhouette that reads from a distance, wider than tall, with a flat bottom edge where a stake joins.",
  sign: "It becomes a sign: a bold central motif with clear empty space left for lettering added later.",
  trophy: "It becomes a trophy emblem: one strong, symmetric shape that stands upright.",
  lamp: "It becomes a lamp panel motif: a small simple shape that repeats well as perforations.",
  puzzle: "It becomes a jigsaw picture: a bright, busy scene with detail spread over the whole frame.",
  coaster: "It fits a round 90 mm coaster: centred, round composition with a margin.",
  ornament: "It becomes a hanging ornament: one connected shape with room for a small hanging hole at the top.",
  "wall-art": "It is wall art: a striking composition with depth and a clear focal point.",
  keychain: "It becomes a small keychain: a simple bold shape that survives being 40 mm wide, with room for a ring hole.",
  "box-lid": "It decorates a box lid: a rectangular composition with a border margin.",
  shadowbox: "It becomes a layered shadow box: foreground, middle and background separate clearly.",
};

const METHOD_NEEDS: Record<BriefMethod, string> = {
  cut: "Laser cut-out: solid black shapes on white, every part joined to the rest, no hairlines thinner than 1 mm at final size, no floating pieces.",
  engrave: "Laser engraving: strong contrast and clear mid-tones; fine detail is welcome.",
  score: "Laser scoring: clean single-weight outlines, no fills or shading.",
  layers: "Stacked layers: 3 to 5 flat tones from dark (front) to light (back), each tone one clean area.",
};

/** Material notes the picture should respect. */
function materialNeeds(material: string): string {
  const m = material.toLowerCase();
  if (/slate|stone/.test(m)) return "On slate: high contrast, bold shapes, avoid large solid dark areas.";
  if (/acryl|perspex|plexi/.test(m)) return "On acrylic: crisp edges and clear negative space.";
  if (/leather/.test(m)) return "On leather: medium detail, soft but clear shapes.";
  if (/glass|mirror/.test(m)) return "On glass or mirror: light, open linework.";
  if (/anod|metal|alumin/.test(m)) return "On anodised metal: fine, precise linework.";
  if (/wood|ply|birch|mdf|walnut|bamboo|oak/.test(m)) return "On wood: strong lines that survive the grain.";
  return "";
}

/** The brief as one or two sentences for the image prompt, or "" for a plain free design. */
export function briefLine(b?: Partial<LaserBrief> | null): string {
  if (!b) return "";
  return [PRODUCT_NEEDS[b.product ?? "canvas"], METHOD_NEEDS[b.method ?? "cut"], materialNeeds(b.material ?? ""), b.widthMm ? `Final width about ${Math.round(b.widthMm)} mm.` : ""]
    .filter(Boolean).join(" ");
}

/** The tool that turns the picture into a laser file, for a brief. */
export function nextStep(b: Partial<LaserBrief>): "vectorize" | "centerline" | "engrave" | "layers" {
  if (b.method === "engrave") return "engrave";
  if (b.method === "score") return "centerline";
  if (b.method === "layers" || b.product === "shadowbox") return "layers";
  return "vectorize";
}
