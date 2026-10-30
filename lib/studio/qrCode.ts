/**
 * Insert QR Code: a scannable code drawn with the QR generator's geometry (module styles and eye
 * shapes) as one compound path on a fill (engrave) layer, centred where the view is. Like the code
 * tools in laser software, but with the designer styles of online QR makers.
 */
import { shapeContours } from "@/lib/letters/polygon";
import { moduleShapes } from "@/lib/generators/qr/build";
import { qrMatrix } from "@/lib/generators/qr/encode";
import { resolveEyes, type EyeBall, type EyeFrame } from "@/lib/generators/qr/eyes";
import type { Ecc, ModuleStyle } from "@/lib/generators/qr/params";
import { newId } from "./doc";
import { addNode } from "./scene";
import { traceLayer } from "./trace/place";
import type { Document, PathNode, Subpath, Vec } from "./types";

export interface QrInsert {
  text: string;
  /** Width of the code without its quiet zone, mm. */
  size: number;
  ecc: Ecc;
  style: ModuleStyle;
  eyeFrame: EyeFrame;
  eyeBall: EyeBall;
  /** Light modules dark instead (for materials that engrave light). */
  invert: boolean;
}

export const QR_INSERT_DEFAULTS: QrInsert = { text: "https://example.com", size: 40, ecc: "M", style: "square", eyeFrame: "auto", eyeBall: "auto", invert: false };

/** The code's outlines centred on (0, 0), and its module size; null when the text is empty or too long. */
export function qrOutlines(o: QrInsert): { subpaths: Subpath[]; module: number; n: number } | null {
  const text = o.text.trim();
  if (!text) return null;
  const mat = qrMatrix(text, o.ecc);
  if (!mat) return null;
  const size = Math.max(5, o.size), m = size / mat.n;
  const eyes = o.eyeFrame !== "auto" || o.eyeBall !== "auto" ? resolveEyes(o.style, o.eyeFrame, o.eyeBall) : undefined;
  let cs = shapeContours(moduleShapes((r, c) => mat.dark[r][c], mat.n, m, o.style, 85, -size / 2, -size / 2, eyes));
  if (o.invert) {
    // the light modules filled, inside a quiet zone of four modules
    const q = size / 2 + 4 * m;
    cs = [[[-q, -q], [q, -q], [q, q], [-q, q]], ...cs.map((c) => c.slice().reverse())];
  }
  return { subpaths: cs.map((c) => ({ closed: true, nodes: c.map(([x, y]) => ({ x, y })) })), module: m, n: mat.n };
}

/** Adds the code as a path at `at` on a fill layer; returns its id, or null when there is nothing to add. */
export function placeQr(d: Document, o: QrInsert, currentLayer: number, at: Vec, ids: () => string = newId): string | null {
  const q = qrOutlines(o);
  if (!q) return null;
  const node: PathNode = { id: ids(), type: "path", name: "QR code", layer: traceLayer(d, currentLayer, true), transform: [1, 0, 0, 1, at.x, at.y], subpaths: q.subpaths };
  addNode(d, node);
  return node.id;
}
