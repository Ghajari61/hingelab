/**
 * A vector PDF of a scene at actual size, one page per sheet, written from the PDF 1.4 reference.
 * Lines keep their layer colour; engraved areas are filled (even-odd); text is Helvetica. Pictures
 * go in as they are stored: a JPEG with DCTDecode, a grey or RGB PNG's compressed data with
 * FlateDecode and the PNG predictor. Other pictures (with transparency, a palette or interlacing)
 * are counted as skipped.
 */
import { jpegInfo } from "@/lib/imaging/pdf";
import type { Rect } from "./profiles";
import type { Poly, Scene, SceneImage } from "./scene";
import { itemsOn, placePoint, type Place } from "./sheets";

const PT = 72 / 25.4;
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, (c) => "\\" + c);

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function base64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

interface PdfImage { dict: string; data: Uint8Array }

/** A picture as a PDF image XObject, or null when it cannot go in as stored. */
export function pdfImage(href: string): PdfImage | null {
  const m = /^data:image\/(jpeg|jpg|png);base64,(.*)$/is.exec(href);
  if (!m) return null;
  let b: Uint8Array;
  try { b = base64(m[2]); } catch { return null; }
  if (m[1].toLowerCase() !== "png") {
    const info = jpegInfo(b);
    if (!info) return null;
    const space = info.components === 1 ? "/DeviceGray" : info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    return { dict: `/Width ${info.width} /Height ${info.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode${info.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""}`, data: b };
  }
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let w = 0, h = 0, depth = 0, type = -1, interlace = 0;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= b.length;) {
    const size = dv.getUint32(i), kind = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const body = b.subarray(i + 8, i + 8 + size);
    if (kind === "IHDR") { w = dv.getUint32(i + 8); h = dv.getUint32(i + 12); depth = b[i + 16]; type = b[i + 17]; interlace = b[i + 20]; }
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    i += 12 + size;
  }
  if (!w || !h || interlace || !idat.length || (type !== 0 && type !== 2) || ![1, 2, 4, 8].includes(depth) || (type === 2 && depth !== 8)) return null;
  const colors = type === 2 ? 3 : 1;
  const data = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of idat) { data.set(c, at); at += c.length; }
  return { dict: `/Width ${w} /Height ${h} /ColorSpace ${colors === 3 ? "/DeviceRGB" : "/DeviceGray"} /BitsPerComponent ${depth} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent ${depth} /Columns ${w} >>`, data };
}

export interface PdfResult { pdf: Uint8Array; pages: number; skipped: number }

/** One page per place (a sheet, or the whole document). `line` is the stroke width in mm. */
export function scenePDF(scene: Scene, rects: Rect[], places: Place[], line: number): PdfResult {
  const images = new Map<string, { name: string; img: PdfImage } | null>();
  let skipped = 0, font = false;
  const pages: string[] = [];
  for (const pl of places) {
    const H = pl.rect.h;
    const XY = (x: number, y: number) => { const [px, py] = placePoint(pl, x, y); return `${n(px * PT)} ${n((H - py) * PT)}`; };
    const ops: string[] = [`${n(line * PT)} w 1 J 1 j`];
    for (const { layer, items } of itemsOn(scene, rects, pl.sheet)) {
      if (!items.length) continue;
      const [r, g, b] = rgb(layer.color);
      ops.push(`${n(r)} ${n(g)} ${n(b)} RG ${n(r)} ${n(g)} ${n(b)} rg`);
      for (const { it, dy } of items) {
        const X = (x: number, y: number) => XY(x, y + dy);
        const path = (polys: Poly[], close: boolean) => polys.map((p) => p.pts.map(([x, y], i) => `${X(x, y)} ${i ? "l" : "m"}`).join("\n") + (close || p.closed ? "\nh" : "")).join("\n");
        for (const im of it.images) {
          const op = imageOps(im, pl, images, dy);
          if (op) ops.push(op); else skipped++;
        }
        if (it.polys.length) ops.push(path(it.polys, layer.fill), layer.fill ? "f*" : "S");
        for (const t of it.texts) {
          font = true;
          const a = (-t.rot * Math.PI) / 180;
          const sx = pl.mirror ? -1 : 1;
          const c = Math.cos(a), s = Math.sin(a);
          // Helvetica averages about half an em per character.
          const wdt = t.str.length * t.size * 0.52;
          const dx = t.anchor === "middle" ? -wdt / 2 : t.anchor === "end" ? -wdt : 0, dy = t.middle ? -t.size * 0.35 : 0;
          const [px, py] = placePoint(pl, t.x, t.y + dy);
          const ox = px + (c * dx - s * dy) * sx, oy = (H - py) + (s * dx + c * dy);
          ops.push(`BT /F1 ${n(t.size * PT)} Tf ${n(c * sx)} ${n(s)} ${n(-s * sx)} ${n(c)} ${n(ox * PT)} ${n(oy * PT)} Tm (${ascii(t.str)}) Tj ET`);
        }
      }
    }
    pages.push(ops.join("\n"));
  }

  // Objects: 1 catalog, 2 pages, then a page and its content for each page, the font, the images.
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const put = (u: Uint8Array | string) => {
    const b = typeof u === "string" ? latin1(u) : u;
    chunks.push(b);
    size += b.length;
  };
  const obj = (k: number, head: string, stream?: Uint8Array) => {
    offsets[k] = size;
    put(`${k} 0 obj\n${head}\n`);
    if (stream) { put("stream\n"); put(stream); put("\nendstream\n"); }
    put("endobj\n");
  };
  const fontId = 3 + 2 * places.length;
  const imgs = [...images.values()].filter((v): v is { name: string; img: PdfImage } => !!v);
  const firstImg = fontId + 1;
  const res = `<< ${font ? `/Font << /F1 ${fontId} 0 R >> ` : ""}${imgs.length ? `/XObject << ${imgs.map((v, i) => `/${v.name} ${firstImg + i} 0 R`).join(" ")} >> ` : ""}>>`;
  put("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${places.map((_, i) => `${3 + 2 * i} 0 R`).join(" ")}] /Count ${places.length} >>`);
  places.forEach((pl, i) => {
    const content = latin1(pages[i]);
    obj(3 + 2 * i, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pl.rect.w * PT)} ${n(pl.rect.h * PT)}] /Resources ${res} /Contents ${4 + 2 * i} 0 R >>`);
    obj(4 + 2 * i, `<< /Length ${content.length} >>`, content);
  });
  obj(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  imgs.forEach((v, i) => obj(firstImg + i, `<< /Type /XObject /Subtype /Image ${v.img.dict} /Length ${v.img.data.length} >>`, v.img.data));
  const count = firstImg + imgs.length;
  const xref = size;
  put(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1, count).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return { pdf: out, pages: places.length, skipped };
}

/** Drawing a picture: its unit square mapped onto the page, inside its clip. */
function imageOps(im: SceneImage, pl: Place, images: Map<string, { name: string; img: PdfImage } | null>, dy: number): string | null {
  if (!images.has(im.href)) {
    const img = pdfImage(im.href);
    images.set(im.href, img ? { name: `Im${[...images.values()].filter(Boolean).length + 1}`, img } : null);
  }
  const ref = images.get(im.href);
  if (!ref) return null;
  const [a, b, c, d, e, f] = im.m;
  const H = pl.rect.h, sx = pl.mirror ? -1 : 1;
  // The image's (u, v) square has v up; in the SVG its top-left corner is (x, y).
  const px0 = a * im.x + c * (im.y + im.h) + e, py0 = b * im.x + d * (im.y + im.h) + f;
  const [qx, qy] = placePoint(pl, px0, py0 + dy);
  const cm = [sx * a * im.w, -b * im.w, -sx * c * im.h, d * im.h, qx, H - qy].map((v) => n(v * PT));
  const clip = im.clip?.length
    ? im.clip.map((p) => p.pts.map(([x, y], i) => { const [u, v] = placePoint(pl, x, y + dy); return `${n(u * PT)} ${n((H - v) * PT)} ${i ? "l" : "m"}`; }).join("\n") + "\nh").join("\n") + "\nW* n\n"
    : "";
  return `q\n${clip}${cm.join(" ")} cm /${ref.name} Do\nQ`;
}

function latin1(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u;
}
