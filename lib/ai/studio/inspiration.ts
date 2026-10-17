/**
 * AI Studio's inspiration gallery: ready ideas, each a prompt with its style and Laser Brief, that
 * fill the composer with one click. Written for laser output and for things people sell.
 */
import type { BriefMethod, BriefProduct } from "./request";
import type { StyleId } from "./styles";

export interface Inspiration {
  id: string;
  title: string;
  prompt: string;
  style: StyleId;
  product: BriefProduct;
  method: BriefMethod;
  widthMm: number;
}

export const INSPIRATION: Inspiration[] = [
  { id: "fox-moon", title: "Sleeping fox", prompt: "A fox curled up asleep on a crescent moon among small stars", style: "line-art", product: "wall-art", method: "cut", widthMm: 300 },
  { id: "isfahan-star", title: "Isfahan star tile", prompt: "A square tile of interlacing ten-point stars inspired by the Shah Mosque in Isfahan", style: "girih", product: "coaster", method: "cut", widthMm: 100 },
  { id: "simurgh", title: "Simurgh", prompt: "The Simurgh, the mythical Persian bird, wings spread with long flowing tail feathers", style: "eslimi", product: "wall-art", method: "cut", widthMm: 400 },
  { id: "forest-deer", title: "Forest at dawn", prompt: "A deer at the edge of a pine forest with mountains and a rising sun behind", style: "layered", product: "shadowbox", method: "layers", widthMm: 250 },
  { id: "monstera", title: "Monstera study", prompt: "A single monstera leaf with its stem, every split and vein clear", style: "botanical", product: "wall-art", method: "engrave", widthMm: 200 },
  { id: "koi", title: "Koi pair", prompt: "Two koi fish circling each other among lotus leaves and ripples", style: "mandala", product: "coaster", method: "cut", widthMm: 95 },
  { id: "lighthouse", title: "Lighthouse", prompt: "A lighthouse on rocks with crashing waves and seagulls", style: "woodcut", product: "sign", method: "engrave", widthMm: 200 },
  { id: "owl-knots", title: "Celtic owl", prompt: "An owl whose body and wings are made of interlaced knotwork", style: "celtic", product: "ornament", method: "cut", widthMm: 120 },
  { id: "city-skyline", title: "Tehran skyline", prompt: "The Tehran skyline with Milad Tower and Azadi Tower in front of the Alborz mountains", style: "silhouette", product: "wall-art", method: "cut", widthMm: 500 },
  { id: "bee-hex", title: "Bees and honeycomb", prompt: "Three bees flying over a honeycomb with dripping honey", style: "tattoo", product: "coaster", method: "engrave", widthMm: 95 },
  { id: "cat-one-line", title: "One-line cat", prompt: "A cat stretching, drawn in one continuous line", style: "one-line", product: "wall-art", method: "score", widthMm: 300 },
  { id: "wolf-poly", title: "Low-poly wolf", prompt: "A howling wolf head in profile", style: "low-poly", product: "wall-art", method: "cut", widthMm: 350 },
  { id: "mountain-topo", title: "Damavand contours", prompt: "Mount Damavand as topographic contour lines", style: "topographic", product: "wall-art", method: "score", widthMm: 400 },
  { id: "rose-window", title: "Rose window", prompt: "A round gothic rose window with petals and trefoils", style: "stained-glass", product: "lamp", method: "layers", widthMm: 300 },
  { id: "dragon-comic", title: "Friendly dragon", prompt: "A small friendly dragon sitting on a pile of books, reading", style: "comic", product: "sign", method: "engrave", widthMm: 200 },
  { id: "snowflake", title: "Lace snowflake", prompt: "A six-armed snowflake with lace-like detail", style: "kirigami", product: "ornament", method: "cut", widthMm: 90 },
  { id: "peacock", title: "Peacock frame", prompt: "A peacock with its tail spread forming an oval frame around empty space", style: "art-nouveau", product: "sign", method: "cut", widthMm: 300 },
  { id: "zen-turtle", title: "Patterned turtle", prompt: "A sea turtle swimming, its shell divided into patterned sections", style: "zentangle", product: "coaster", method: "engrave", widthMm: 95 },
];
