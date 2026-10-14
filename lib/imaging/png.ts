/**
 * Small PNG writer for grey pictures: 1-bit (engraving dots, a fraction of the size of an RGBA PNG)
 * and 8-bit. Written from the PNG specification; the zlib compression is passed in (the browser's
 * CompressionStream, or node:zlib in tests).
 */

export type Deflate = (raw: Uint8Array) => Promise<Uint8Array>;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
  return out;
}

/**
 * A grey PNG. `bits` 1: `px` holds 1 for black and 0 for white (a dither bitmap's "burn"); `bits` 8:
 * `px` holds grey levels, 0 black to 255 white.
 */
export async function encodeGreyPng(px: ArrayLike<number>, width: number, height: number, bits: 1 | 8, deflate: Deflate): Promise<Uint8Array> {
  const row = bits === 1 ? Math.ceil(width / 8) : width;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (row + 1) + 1, s = y * width;
    if (bits === 8) for (let x = 0; x < width; x++) raw[o + x] = px[s + x];
    else for (let x = 0; x < width; x++) if (!px[s + x]) raw[o + (x >> 3)] |= 0x80 >> (x & 7);
  }
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = bits;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
