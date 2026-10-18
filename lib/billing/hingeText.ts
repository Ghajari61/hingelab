/** Server-side shaping for the text under a Hinge Box: HarfBuzz and the chosen bundled font. */
import type { BuildContext } from "@/lib/generators/types";
import { makeTextFn } from "@/lib/generators/text";
import { baseTextFont, hasBaseText } from "@/lib/hinge/baseText";
import type { Params } from "@/lib/hinge/types";
import { bundledFont, serverHarfBuzz } from "./letterFonts";

/** A text context for the box's base text, or undefined when the box has none. */
export async function hingeTextContext(p: Partial<Params> | null | undefined): Promise<BuildContext | undefined> {
  if (!p || typeof p !== "object" || !hasBaseText(p as Params)) return undefined;
  const id = baseTextFont(p as Params);
  const hb = await serverHarfBuzz();
  const font = await bundledFont(hb, id);
  return font ? { text: makeTextFn(hb, (k) => (k === id ? font : null)) } : undefined;
}
