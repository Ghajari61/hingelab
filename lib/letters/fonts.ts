/**
 * Font registry and loading. Font bytes come in as an ArrayBuffer; HarfBuzz is injected,
 * so this module stays free of DOM and fetch.
 */
import { parse as parseOpenType } from "opentype.js";
import type { Font as OTFont } from "opentype.js";
import type * as HBModule from "harfbuzzjs";

export type HarfBuzz = typeof HBModule;
export type FontScript = "latin" | "arabic";

export interface FontInfo {
  id: string;
  name: string;
  /** File name inside /fonts. */
  file: string;
  scripts: FontScript[];
  /** Short hint shown in the font picker. */
  note: string;
}

/** Bundled fonts, all SIL Open Font License (see public/fonts/licenses). */
export const BUNDLED_FONTS: FontInfo[] = [
  { id: "fredoka", name: "Fredoka Bold", file: "Fredoka-Bold.ttf", scripts: ["latin"], note: "Rounded, best for hinge boxes" },
  { id: "baloo2", name: "Baloo 2 ExtraBold", file: "Baloo2-ExtraBold.ttf", scripts: ["latin"], note: "Rounded, heavy" },
  { id: "archivo-black", name: "Archivo Black", file: "ArchivoBlack-Regular.ttf", scripts: ["latin"], note: "Heavy grotesque" },
  { id: "anton", name: "Anton", file: "Anton-Regular.ttf", scripts: ["latin"], note: "Tall condensed" },
  { id: "bebas-neue", name: "Bebas Neue", file: "BebasNeue-Regular.ttf", scripts: ["latin"], note: "Condensed capitals" },
  { id: "pacifico", name: "Pacifico", file: "Pacifico-Regular.ttf", scripts: ["latin"], note: "Script, for solid letters" },
  { id: "vazirmatn", name: "Vazirmatn Black", file: "Vazirmatn-Black.ttf", scripts: ["arabic", "latin"], note: "Persian, heavy" },
  { id: "lalezar", name: "Lalezar", file: "Lalezar-Regular.ttf", scripts: ["arabic", "latin"], note: "Persian display" },
  { id: "noto-sans-arabic", name: "Noto Sans Arabic Black", file: "NotoSansArabic-Black.ttf", scripts: ["arabic"], note: "Persian / Arabic sans" },
  { id: "noto-naskh-arabic", name: "Noto Naskh Arabic Bold", file: "NotoNaskhArabic-Bold.ttf", scripts: ["arabic"], note: "Persian / Arabic naskh" },
];

export const fontInfo = (id: string) => BUNDLED_FONTS.find(f => f.id === id);

/** A parsed font, ready for shaping (HarfBuzz) and outlines (opentype.js). */
export interface LoadedFont {
  id: string;
  name: string;
  ot: OTFont;
  hb: HBModule.Font;
  unitsPerEm: number;
  /** Cap height in font units: OS/2 sCapHeight, else the height of "H", else 70% of the em. */
  capHeight: number;
}

/** Parse font bytes. Throws a readable error for files that are not fonts. */
export function loadFont(hb: HarfBuzz, id: string, name: string, bytes: ArrayBuffer): LoadedFont {
  let ot: OTFont;
  try {
    ot = parseOpenType(bytes);
  } catch {
    throw new Error("This file is not a font HingeLab can read. Use a .ttf or .otf file.");
  }
  const font = new hb.Font(new hb.Face(new hb.Blob(bytes)));
  const upm = ot.unitsPerEm || 1000;
  let cap = ot.tables.os2?.sCapHeight ?? 0;
  if (!(cap > 0)) {
    const H = ot.charToGlyphIndex("H");
    const bb = H ? ot.glyphs.get(H).getBoundingBox() : null;
    cap = bb && bb.y2 > 0 ? bb.y2 : upm * 0.7;
  }
  return { id, name, ot, hb: font, unitsPerEm: upm, capHeight: cap };
}

/** Characters that never need a glyph (spaces, joiners, direction marks). */
const IGNORABLE = /[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

/** Distinct characters of `text` that the font has no glyph for. */
export function missingChars(font: LoadedFont, text: string): string[] {
  const out = new Set<string>();
  for (const ch of text) if (!IGNORABLE.test(ch) && font.ot.charToGlyphIndex(ch) === 0) out.add(ch);
  return [...out];
}

/** Display name stored in the font file, for uploaded fonts. */
export function fontFamilyName(font: LoadedFont) {
  const ot = font.ot;
  try {
    return ot.getEnglishName("fullName") || ot.getEnglishName("fontFamily") || font.name;
  } catch {
    return font.name;
  }
}
