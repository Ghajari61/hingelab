/**
 * Font registry and loading. Font bytes come in as an ArrayBuffer; HarfBuzz is injected,
 * so this module stays free of DOM and fetch.
 */
import { parse as parseOpenType } from "opentype.js";
import type { Font as OTFont } from "opentype.js";
import type * as HBModule from "harfbuzzjs";

export type HarfBuzz = typeof HBModule;
export * from "./fontList";
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
  const sig = bytes.byteLength >= 4 ? new DataView(bytes).getUint32(0) : 0;
  // WOFF is unpacked to its TTF or OTF when it is added (woff.ts); HarfBuzz reads only the unpacked font.
  if (sig === 0x774f4646 || sig === 0x774f4632) throw new Error("This web font must be unpacked first. Add it with Upload font….");
  let ot: OTFont;
  try {
    ot = parseOpenType(bytes);
  } catch {
    throw new Error("This file is not a font HingeLab can read. Use a .ttf, .otf or .woff file.");
  }
  const font = new hb.Font(new hb.Face(new hb.Blob(bytes)));
  const upm = ot.unitsPerEm || 1000;
  let cap = ot.tables.os2?.sCapHeight ?? 0;
  const H = ot.charToGlyphIndex("H");
  const hTop = H ? ot.glyphs.get(H).getBoundingBox().y2 : 0;
  // Some fonts carry a wrong sCapHeight (Courgette says 301 of 2048); the H itself is the truth then.
  if (!(cap > 0) || (hTop > 0 && Math.abs(cap - hTop) > hTop * 0.3)) cap = hTop > 0 ? hTop : upm * 0.7;
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
