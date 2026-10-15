/**
 * Settings and panel fields for the user's own motif: a picture traced on the device into brightness
 * levels, or words in a font. motifRef.ts turns them into a motif for the build.
 */
import { isImageDataURL } from "@/lib/security/svg";
import { isPictureText } from "./shadowbox/picPath";
import type { FieldSpec } from "./types";
import { getPath } from "./path";

export interface MotifArt {
  /** Small grey preview of the picture (a data URL), for the panel. */
  image: string;
  /** Picture width / height. */
  aspect: number;
  /** Traced outlines, `|` between brightness levels (shadowbox/picPath.ts). */
  levels: string;
  /** The picture file's name. */
  name: string;
  /** Brightness level used, % (dark parts below it make the motif). */
  cut: number;
  /** Use the light parts instead of the dark ones. */
  invert: boolean;
  /** Words of "Your text". */
  text: string;
  fontId: string;
}

export const MOTIF_ART: MotifArt = { image: "", aspect: 1, levels: "", name: "", cut: 50, invert: false, text: "Love", fontId: "pacifico" };

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Settings for the user's motif with every value checked; anything else gets the default. */
export function cleanMotifArt(raw: unknown): MotifArt {
  const a = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof MotifArt, unknown>>;
  const d = MOTIF_ART;
  return {
    image: typeof a.image === "string" && isImageDataURL(a.image) ? a.image : "",
    aspect: num(a.aspect, 0.1, 10, d.aspect),
    levels: isPictureText(a.levels) ? a.levels : "",
    name: String(a.name ?? "").replace(/[^\p{L}\p{N}\p{Zs}_.,()+-]/gu, "").slice(0, 80),
    cut: num(a.cut, 0, 100, d.cut),
    invert: a.invert === true,
    text: typeof a.text === "string" ? a.text.slice(0, 60) : d.text,
    fontId: typeof a.fontId === "string" && a.fontId ? a.fontId.slice(0, 60) : d.fontId,
  };
}

/**
 * Panel fields for the user's motif, under a motif choice at `kindKey` whose settings live at `base`
 * (for example "motif.kind" and "motif.art"). `show` limits them further.
 */
export function motifArtFields<P>(kindKey: string, base: string, show: (p: P) => boolean = () => true): FieldSpec<P>[] {
  const kind = (p: P) => (show(p) ? String(getPath(p, kindKey)) : "");
  const art = (p: P) => getPath(p, base) as MotifArt;
  return [
    {
      kind: "image", key: `${base}.image`, aspectKey: `${base}.aspect`, trace: { levels: `${base}.levels`, name: `${base}.name` }, label: "Motif picture",
      show: (p) => kind(p) === "picture",
      help: "A drawing, logo or photo (JPEG, PNG or WebP) or an SVG file; it is traced here, in your browser, into outlines that are engraved, scored or cut like the other motifs.",
    },
    {
      kind: "number", key: `${base}.cut`, label: "Picture level", unit: "%", min: 0, max: 100, step: 1,
      show: (p) => kind(p) === "picture" && art(p).levels.includes("|"),
      help: "Which parts of the picture make the motif: a low level keeps only the darkest parts, a high one takes in lighter tones too.",
    },
    { kind: "toggle", key: `${base}.invert`, label: "Use the light parts", show: (p) => kind(p) === "picture" && !!art(p).levels, help: "Makes the motif from the picture's light parts, for a light drawing on a dark background." },
    { kind: "text", key: `${base}.text`, label: "Motif text", multiline: true, maxLength: 60, placeholder: "Initials, a word or a date", show: (p) => kind(p) === "text", help: "Words or initials used as the motif; press Enter for a new line." },
    { kind: "font", key: `${base}.fontId`, label: "Motif font", sample: (p) => art(p).text || "Aa", show: (p) => kind(p) === "text", help: "The typeface of the motif text (the same fonts as Letters)." },
  ];
}

/** The motif's font, to load, when the motif is text. */
export const motifFonts = (kind: string, art: MotifArt): string[] => (kind === "text" && art.text.trim() ? [art.fontId] : []);
