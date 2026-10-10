/** The small part of the opentype.js 2.x API that HingeLab uses (the package ships no typings). */
declare module "opentype.js" {
  export type PathCommand =
    | { type: "M" | "L"; x: number; y: number }
    | { type: "Q"; x1: number; y1: number; x: number; y: number }
    | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "Z" };

  export interface Path {
    commands: PathCommand[];
  }

  export interface Glyph {
    index: number;
    name?: string;
    unicode?: number;
    advanceWidth?: number;
    yMax?: number;
    getPath(x?: number, y?: number, fontSize?: number): Path;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }

  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    names: Record<string, Record<string, string> | undefined>;
    tables: { os2?: { sCapHeight?: number; sxHeight?: number } & Record<string, unknown> } & Record<string, unknown>;
    glyphs: { length: number; get(index: number): Glyph };
    charToGlyphIndex(ch: string): number;
    charToGlyph(ch: string): Glyph;
    getEnglishName(name: string): string;
  }

  // The ESM build (used by production bundles) has named exports only, no default export.
  export function parse(buffer: ArrayBuffer, opt?: Record<string, unknown>): Font;
}
