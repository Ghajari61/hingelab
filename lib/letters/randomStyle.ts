import { shuffleFonts } from "@/lib/generators/randomise";
import { HINGE_VARIANTS } from "@/lib/hinge/presets";
import type { Pattern } from "@/lib/hinge";
import { LETTER_DEFAULTS } from "./defaults";
import type { LetterMode, LetterParams, WallStyle } from "./types";

const PATTERNS: Pattern[] = ["straight", "wave", "relief", "serpentine"];
const WALLS: WallStyle[] = ["hinge", "faceted"];

/** A random look for the same words: a bundled font that covers them, a mode, and for boxes the walls and lattice. */
export function randomLetterStyle(p: LetterParams, { pro = true }: { pro?: boolean } = {}, rnd: () => number = Math.random): Partial<LetterParams> {
  const pick = <T,>(a: T[]) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  const modes: LetterMode[] = pro ? ["box", "solid", "stencil"] : ["box"];
  const fonts = shuffleFonts(p.text);
  const others = fonts.filter((id) => id !== p.fontId);
  const out: Partial<LetterParams> = { fontId: pick(others.length ? others : fonts) ?? p.fontId, mode: pick(modes) };
  if (out.mode === "box") {
    const style = pick(HINGE_VARIANTS.filter((v) => v.id !== "line"));
    Object.assign(out, {
      wallStyle: pick(WALLS), pattern: pick(PATTERNS), slit: LETTER_DEFAULTS.slit, bridge: LETTER_DEFAULTS.bridge, pitch: LETTER_DEFAULTS.pitch,
      overrun: LETTER_DEFAULTS.overrun, stretch: LETTER_DEFAULTS.stretch, slotW: LETTER_DEFAULTS.slotW, cutStyle: LETTER_DEFAULTS.cutStyle,
      ...(style.id === "standard" ? {} : style.params),
    });
  }
  return out;
}
