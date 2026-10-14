/** The photo look's settings and names, without the image code (so generators can import them cheaply). */

export const PHOTO_LOOKS = ["colour", "grey", "poster", "engrave"] as const;
export type PhotoLook = (typeof PHOTO_LOOKS)[number];
/** Dither patterns offered for engraved photos (see dither.ts). */
export const PHOTO_DITHERS = ["floyd", "atkinson", "jarvis", "ordered", "halftone"] as const;
export type PhotoDither = (typeof PHOTO_DITHERS)[number];

export const PAPERS = { a4: { w: 210, h: 297, name: "A4" }, letter: { w: 215.9, h: 279.4, name: "Letter" } } as const;
export type Paper = keyof typeof PAPERS;

export interface PhotoSpec {
  look: PhotoLook;
  /** −100 to 100. */
  bright: number;
  contrast: number;
  /** Flat tones of a posterised photo, 2–8. */
  tones: number;
  dither: PhotoDither;
  /** Make the background (the colour around the border, and what joins it) white. */
  bg: boolean;
  /** How far a colour may be from the background's and still go, 0–1. */
  tol: number;
  /** Longest side of the made image, px. */
  side: number;
}

export interface Subject {
  /** Centre, 0–1 across and down the photo. */
  u: number;
  v: number;
  /** Height as a share of the photo's (a face's, when one was found). */
  h: number;
  face: boolean;
}
