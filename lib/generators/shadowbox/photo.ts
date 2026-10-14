/**
 * Where the back board's photo goes and how it is made: it covers the window and a bleed round it,
 * zoomed from the middle and shifted by a share of the spare room; the stored image is sized for the
 * look (a print, or engraving dots at the chosen resolution across the photo's real width).
 */
import type { PhotoSpec, Subject } from "@/lib/imaging/photoSpec";
import type { ShadowBoxParams } from "./params";

/** The window inside the border, mm. */
export interface WinBox { x0: number; y0: number; w: number; h: number; cx: number; cy: number }

export interface PhotoPlace {
  /** The whole photo's top left and size, mm. */
  x: number;
  y: number;
  iw: number;
  ih: number;
  /** The window plus the bleed (what shows, with a margin), and the bleed, mm. */
  bw: number;
  bh: number;
  b: number;
}

/** Long side of a printed photo, px (about 160 dpi across a 10 in window). */
export const PRINT_SIDE = 1600;
/** Long side of an engraved photo, px. */
export const MAX_ENGRAVE_SIDE = 2400;

export function photoPlace(p: ShadowBoxParams, w: WinBox): PhotoPlace {
  const ph = p.photo;
  const b = Math.min(3, p.frame.border / 2);
  const bw = w.w + 2 * b, bh = w.h + 2 * b, z = ph.zoom / 100, a = ph.aspect;
  const [iw, ih] = a > bw / bh ? [bh * z * a, bh * z] : [bw * z, (bw * z) / a];
  const x = w.cx - iw / 2 + ((iw - bw) / 2) * (ph.x / 100);
  const y = w.cy - ih / 2 + ((ih - bh) / 2) * (ph.y / 100);
  return { x, y, iw, ih, bw, bh, b };
}

/** How the stored image is made from the original. */
export function photoSpec(p: ShadowBoxParams, w: WinBox | null): PhotoSpec {
  const ph = p.photo;
  let side = PRINT_SIDE;
  if (ph.look === "engrave" && w) {
    const at = photoPlace(p, w);
    side = Math.min(MAX_ENGRAVE_SIDE, Math.max(200, Math.round((Math.max(at.iw, at.ih) / 25.4) * Number(ph.dpi))));
  }
  return { look: ph.look, bright: ph.bright, contrast: ph.contrast, tones: ph.tones, dither: ph.dither, bg: ph.bg, tol: ph.tol / 100, side };
}

/** Dots per inch the stored image gives across the photo's printed size. */
export function photoDpi(p: ShadowBoxParams, w: WinBox): number {
  const at = photoPlace(p, w);
  return p.photo.px > 0 ? (p.photo.px / Math.max(at.iw, at.ih)) * 25.4 : 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Zoom and shift so the subject sits in the window: a face fills about a third of the window's
 * height a little above the middle; another subject is centred and fills about three quarters.
 */
export function centreOn(p: ShadowBoxParams, w: WinBox, s: Subject): ShadowBoxParams {
  const base = photoPlace({ ...p, photo: { ...p.photo, zoom: 100, x: 0, y: 0 } }, w);
  const want = (s.face ? 0.34 : 0.75) * base.bh;
  const zoom = Math.round(clamp(s.h > 0 ? want / (s.h * base.ih) : 1, 1, 3) * 100);
  const at = photoPlace({ ...p, photo: { ...p.photo, zoom, x: 0, y: 0 } }, w);
  const ty = s.face ? -0.06 : 0;
  const share = (spare: number, off: number) => (spare > 0.01 ? clamp(Math.round((off / spare) * 100), -100, 100) : 0);
  const x = share((at.iw - at.bw) / 2, (0.5 - s.u) * at.iw);
  const y = share((at.ih - at.bh) / 2, ty * at.bh + (0.5 - s.v) * at.ih);
  return { ...p, photo: { ...p.photo, zoom, x, y } };
}
