import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { BUNDLED_FONTS, loadFont, type LoadedFont } from "@/lib/letters/fonts";
import { makeTextFn } from "../text";
import type { BuildContext } from "../types";

const cache = new Map<string, LoadedFont>();

function fontOf(id: string): LoadedFont | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const info = BUNDLED_FONTS.find((f) => f.id === id);
  if (!info) return null;
  const b = readFileSync(join(__dirname, "../../../public/fonts", info.file));
  const font = loadFont(hb, info.id, info.name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  cache.set(id, font);
  return font;
}

/** A build context with every bundled font available (as in the app once fonts have loaded). */
export const CTX: BuildContext = { text: makeTextFn(hb, fontOf) };
