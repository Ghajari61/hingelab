/**
 * A QR code as an engraved element in another generator (table numbers, signs): the dark modules as
 * filled contours, `size` mm wide, centred on (cx, cy). "{n}" in the text is replaced per item, so
 * every table can get its own code (a menu link with the table number in it).
 */
import { shapeContours } from "@/lib/letters/polygon";
import type { Contour, Pt } from "../types";
import { moduleShapes } from "./build";
import { qrMatrix } from "./encode";
import type { Ecc, ModuleStyle } from "./params";
import { resolveEyes } from "./eyes";

export interface QrElement {
  contours: Contour[];
  /** Module size, mm. */
  module: number;
  /** Modules across. */
  n: number;
  /** The text it holds. */
  payload: string;
}

/** Web addresses without a scheme get https://, as in the QR generator. */
export function qrText(raw: string, n = ""): string {
  const t = raw.replace(/\{n\}/g, n).trim();
  if (!t) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || /\s/.test(t) || !/\.[a-z]{2,}/i.test(t)) return t;
  return `https://${t}`;
}

export function qrElement(text: string, size: number, cx = 0, cy = 0, style: ModuleStyle = "square", ecc: Ecc = "M"): QrElement | null {
  if (!text) return null;
  const mat = qrMatrix(text, ecc);
  if (!mat) return null;
  const m = size / mat.n;
  const eyes = style === "square" ? undefined : resolveEyes(style, "auto", "auto");
  const cs = shapeContours(moduleShapes((r, c) => mat.dark[r][c], mat.n, m, style, 85, -size / 2, -size / 2, eyes));
  return { contours: cs.map((c) => c.map(([x, y]) => [x + cx, y + cy] as Pt)), module: m, n: mat.n, payload: text };
}
