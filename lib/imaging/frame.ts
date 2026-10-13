/**
 * Image models only paint 1:1, 3:2 and 2:3 pictures. Pictures sent to them are padded to the
 * nearest of those shapes, and the answer is cropped back, so nothing comes back stretched.
 */
import { makeImg, type Img } from "./image";

/** Where the original sits in a padded picture, as fractions of the padded size. */
export interface FrameRect { x: number; y: number; w: number; h: number }

export const MODEL_ASPECTS = [1, 1.5, 2 / 3] as const;

export const nearestAspect = (a: number) => MODEL_ASPECTS.reduce((b, x) => (Math.abs(Math.log(x / a)) < Math.abs(Math.log(b / a)) ? x : b), 1 as number);

/** Pads `img` (centred, or placed at `at` 0–1) to `aspect` with `fill`. */
export function padTo(img: Img, aspect: number, fill: [number, number, number, number] = [255, 255, 255, 255], at = { x: 0.5, y: 0.5 }): { img: Img; rect: FrameRect } {
  let W = img.width, H = img.height;
  if (W / H < aspect) W = Math.round(H * aspect); else H = Math.round(W / aspect);
  return place(img, W, H, fill, at);
}

/** Puts `img` on a W × H canvas at `at` (0–1 of the free room). */
export function place(img: Img, W: number, H: number, fill: [number, number, number, number], at = { x: 0.5, y: 0.5 }): { img: Img; rect: FrameRect } {
  const out = makeImg(W, H, fill);
  const ox = Math.round((W - img.width) * at.x), oy = Math.round((H - img.height) * at.y);
  for (let y = 0; y < img.height; y++) out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + oy) * W + ox) * 4);
  return { img: out, rect: { x: ox / W, y: oy / H, w: img.width / W, h: img.height / H } };
}

/** The part of `img` inside `rect` (fractions). */
export function cropTo(img: Img, rect: FrameRect): Img {
  const x0 = Math.round(rect.x * img.width), y0 = Math.round(rect.y * img.height);
  const w = Math.max(1, Math.min(img.width - x0, Math.round(rect.w * img.width))), h = Math.max(1, Math.min(img.height - y0, Math.round(rect.h * img.height)));
  const out = makeImg(w, h, [0, 0, 0, 0]);
  for (let y = 0; y < h; y++) out.data.set(img.data.subarray(((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x0 + w) * 4), y * w * 4);
  return out;
}

/**
 * The mask for an edit: opaque where the picture stays, transparent where the model paints.
 * `paint` marks pixels to repaint inside `rect`; everything outside `rect` is repainted when
 * `outside` is true (expanding) and kept otherwise.
 */
export function editMask(W: number, H: number, rect: FrameRect, outside: boolean, paint?: Uint8Array, pw = 0, ph = 0): Img {
  const m = makeImg(W, H, [0, 0, 0, 255]);
  const x0 = Math.round(rect.x * W), y0 = Math.round(rect.y * H), x1 = x0 + Math.round(rect.w * W), y1 = y0 + Math.round(rect.h * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
    let clear = !inside && outside;
    if (inside && paint) {
      const px = Math.min(pw - 1, Math.floor(((x - x0) / (x1 - x0)) * pw)), py = Math.min(ph - 1, Math.floor(((y - y0) / (y1 - y0)) * ph));
      clear = paint[py * pw + px] === 1;
    }
    if (clear) m.data[(y * W + x) * 4 + 3] = 0;
  }
  return m;
}
