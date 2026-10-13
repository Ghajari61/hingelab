import { MAX_IMAGE_CHARS } from "./types";

/** Limits of one example in the AI designer's library (browser and server). */
export const MAX_EXAMPLE_SVG = 2_500_000;
export const MAX_EXAMPLE_TITLE = 120;
export const MAX_EXAMPLE_DESCRIPTION = 1000;
export const MAX_EXAMPLE_TAGS = 300;
/** A whole upload: the SVG, the photo and the words; under the 4.5 MB request limit of the host. */
export const MAX_EXAMPLE_BODY = MAX_EXAMPLE_SVG + MAX_IMAGE_CHARS + 16 * 1024;

export interface AIExample {
  id: string;
  title: string;
  description: string;
  tags: string;
  width: number;
  height: number;
  hasPhoto: boolean;
  created: string;
}
