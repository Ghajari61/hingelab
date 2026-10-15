/**
 * Pictures for the desktop app's generators: the app shrinks a photo or drawing to one grey byte a
 * pixel (or sends an SVG file's text) and the server traces it the way the website's worker does
 * (lib/imaging/levels). Nothing is stored; only the outlines go back.
 */
import { PictureError, TRACE_SIDE, svgLevels, traceLevels } from "@/lib/imaging/levels";
import type { TraceResponse } from "./types";

/** Largest SVG file traced, characters. */
export const MAX_TRACE_SVG = 2 * 1024 * 1024;
/** The request's limit: a full-size grey picture in base64, or the largest SVG. */
export const MAX_TRACE_BODY = MAX_TRACE_SVG + 64 * 1024;

type Out = { status: number; body: TraceResponse | { error: "invalid"; message: string } };

const bad = (status: number, message: string): Out => ({ status, body: { error: "invalid", message } });
const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const side = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= TRACE_SIDE;

export function traceForDesktop(input: unknown): Out {
  if (!plainObject(input)) return bad(400, "Invalid request.");
  try {
    if (input.kind === "svg") {
      if (typeof input.text !== "string" || !input.text.trim()) return bad(400, "Send the SVG file's text.");
      if (input.text.length > MAX_TRACE_SVG) return bad(413, "That SVG is larger than 2 MB. Simplify it and try again.");
      return { status: 200, body: svgLevels(input.text) };
    }
    if (input.kind !== "raster") return bad(400, "Unknown picture kind.");
    const { width, height, grey } = input;
    if (!side(width) || !side(height)) return bad(400, `Shrink the picture to at most ${TRACE_SIDE} px a side.`);
    if (typeof grey !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(grey)) return bad(400, "Invalid picture data.");
    const bytes = Buffer.from(grey, "base64");
    if (bytes.length !== width * height) return bad(400, "The picture's size does not match its data.");
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < bytes.length; i++) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = bytes[i];
      data[i * 4 + 3] = 255;
    }
    return { status: 200, body: traceLevels({ width, height, data }) };
  } catch (e) {
    if (e instanceof PictureError) return bad(422, e.message);
    throw e;
  }
}
