/**
 * WOFF 1.0 fonts unpacked to the TrueType or OpenType file inside (W3C WOFF File Format 1.0):
 * each table is zlib-compressed on its own, so the sfnt is rebuilt from the table directory.
 * WOFF2 needs Brotli and table transforms and is refused with a readable message.
 */
import { unzlibSync } from "fflate";

const WOFF = 0x774f4646;
const WOFF2 = 0x774f4632;

export function fontSignature(bytes: ArrayBuffer): "woff" | "woff2" | "sfnt" | "unknown" {
  if (bytes.byteLength < 4) return "unknown";
  const s = new DataView(bytes).getUint32(0);
  if (s === WOFF) return "woff";
  if (s === WOFF2) return "woff2";
  // TrueType 1.0, OpenType CFF ('OTTO'), Apple 'true'.
  if (s === 0x00010000 || s === 0x4f54544f || s === 0x74727565) return "sfnt";
  return "unknown";
}

/** The sfnt (TTF or OTF) inside a WOFF file. Throws a readable error for broken or WOFF2 files. */
export function woffToSfnt(bytes: ArrayBuffer): ArrayBuffer {
  const kind = fontSignature(bytes);
  if (kind === "woff2") throw new Error("WOFF2 fonts cannot be read yet. Use the .ttf, .otf or .woff version of the font.");
  if (kind !== "woff") throw new Error("This is not a WOFF font.");
  const v = new DataView(bytes);
  const bad = () => new Error("This WOFF font is damaged and cannot be read.");
  if (bytes.byteLength < 44) throw bad();
  const flavor = v.getUint32(4), n = v.getUint16(12);
  if (!n || 44 + n * 20 > bytes.byteLength) throw bad();
  const tables: { tag: number; sum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < n; i++) {
    const at = 44 + i * 20;
    const tag = v.getUint32(at), off = v.getUint32(at + 4), comp = v.getUint32(at + 8), orig = v.getUint32(at + 12), sum = v.getUint32(at + 16);
    if (off + comp > bytes.byteLength || comp > orig) throw bad();
    const raw = new Uint8Array(bytes, off, comp);
    let data: Uint8Array;
    try {
      data = comp < orig ? unzlibSync(raw) : raw;
    } catch {
      throw bad();
    }
    if (data.length !== orig) throw bad();
    tables.push({ tag, sum, data });
  }
  tables.sort((a, b) => a.tag - b.tag);
  const pad = (k: number) => (k + 3) & ~3;
  const head = 12 + 16 * n;
  const size = tables.reduce((s, t) => s + pad(t.data.length), head);
  const out = new Uint8Array(size), w = new DataView(out.buffer);
  let es = 0;
  while (2 ** (es + 1) <= n) es++;
  const range = 2 ** es * 16;
  w.setUint32(0, flavor);
  w.setUint16(4, n);
  w.setUint16(6, range);
  w.setUint16(8, es);
  w.setUint16(10, n * 16 - range);
  let at = head;
  tables.forEach((t, i) => {
    const d = 12 + i * 16;
    w.setUint32(d, t.tag);
    w.setUint32(d + 4, t.sum);
    w.setUint32(d + 8, at);
    w.setUint32(d + 12, t.data.length);
    out.set(t.data, at);
    at += pad(t.data.length);
  });
  return out.buffer;
}
