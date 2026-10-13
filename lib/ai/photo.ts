import { MAX_IMAGE_CHARS } from "./types";

/** Longest side of a photo sent to the designer, px. */
const PHOTO_PX = 1024;

/** The photo as a colour JPEG data URL, at most PHOTO_PX on its longest side and small enough to send (browser only). */
export async function photoJpeg(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, PHOTO_PX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(bmp.width * k));
  cv.height = Math.max(1, Math.round(bmp.height * k));
  const g = cv.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  let q = 0.85, url = cv.toDataURL("image/jpeg", q);
  while (url.length > MAX_IMAGE_CHARS * 0.9 && q > 0.4) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); }
  return url;
}
