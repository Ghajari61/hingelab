/**
 * A one-page PDF with a JPEG photo placed at its real size, for printing at 100 %: the photo clipped
 * to an outline, a thin cut line along it, crop marks at its corners and a caption. Written from the
 * PDF 1.4 reference (JPEG embedded as is with DCTDecode, Helvetica as a standard font, no other fonts).
 */
import type { Contour } from "@/lib/letters/types";
import { PAPERS, type Paper } from "./photoSpec";

export interface JpegInfo { width: number; height: number; components: number }

/** Size and colour channels from a JPEG's frame header, or null when it is not a JPEG. */
export function jpegInfo(b: Uint8Array): JpegInfo | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], components: b[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

export interface PrintPage {
  /** Page size, mm. */
  pageW: number;
  pageH: number;
  /** The photo (a JPEG of exactly the printed area) and where it goes on the page, mm from the top left. */
  jpeg: Uint8Array;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Outline the print is clipped to and cut along, mm, relative to the photo's top left. */
  clip?: Contour;
  /** One line of plain ASCII under the photo. */
  caption?: string;
}

const PT = 72 / 25.4;
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, (c) => "\\" + c);

export function photoPdf(pg: PrintPage): Uint8Array {
  const info = jpegInfo(pg.jpeg);
  if (!info) throw new Error("The print needs a JPEG.");
  const H = pg.pageH * PT;
  const X = (mm: number) => n((pg.x + mm) * PT), Y = (mm: number) => n(H - (pg.y + mm) * PT);
  const path = (c: Contour) => c.map(([x, y], i) => `${X(x)} ${Y(y)} ${i ? "l" : "m"}`).join("\n") + "\nh";
  const ops: string[] = ["q"];
  if (pg.clip?.length) ops.push(path(pg.clip), "W n");
  ops.push(`${n(pg.w * PT)} 0 0 ${n(pg.h * PT)} ${X(0)} ${n(H - (pg.y + pg.h) * PT)} cm`, "/Im1 Do", "Q");
  if (pg.clip?.length) ops.push("q 0.55 G 0.3 w [2 2] 0 d", path(pg.clip), "S Q");
  // Crop marks: 5 mm lines starting 2 mm outside each corner of the photo.
  const marks: string[] = ["q 0 G 0.3 w"];
  for (const [cx, cy, sx, sy] of [[0, 0, -1, -1], [pg.w, 0, 1, -1], [0, pg.h, -1, 1], [pg.w, pg.h, 1, 1]] as const) {
    marks.push(`${X(cx + sx * 2)} ${Y(cy)} m ${X(cx + sx * 7)} ${Y(cy)} l S`, `${X(cx)} ${Y(cy + sy * 2)} m ${X(cx)} ${Y(cy + sy * 7)} l S`);
  }
  marks.push("Q");
  ops.push(...marks);
  if (pg.caption) ops.push(`BT /F1 8 Tf 0.3 g ${X(0)} ${Y(pg.h + 12)} Td (${ascii(pg.caption)}) Tj ET`);
  const content = new TextEncoder().encode(ops.join("\n"));
  const space = info.components === 1 ? "/DeviceGray" : info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const put = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? latin1(b) : b;
    chunks.push(u);
    size += u.length;
  };
  const obj = (k: number, head: string, stream?: Uint8Array) => {
    offsets[k] = size;
    put(`${k} 0 obj\n${head}\n`);
    if (stream) { put("stream\n"); put(stream); put("\nendstream\n"); }
    put("endobj\n");
  };
  put("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pg.pageW * PT)} ${n(H)}] /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 4 0 R >>`);
  obj(4, `<< /Length ${content.length} >>`, content);
  obj(5, `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode${info.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""} /Length ${pg.jpeg.length} >>`, pg.jpeg);
  obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const xref = size;
  put(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  put(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

function latin1(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u;
}

/** The page a print goes on: the chosen paper if the photo and its marks fit, otherwise a page just large enough. */
export function printPage(paper: Paper, w: number, h: number): { pageW: number; pageH: number; x: number; y: number; custom: boolean } {
  // The crop marks reach 7 mm out; 12 mm keeps them clear of a printer's unprintable edge.
  const M = 12, need = (v: number) => v + 2 * M;
  const p = PAPERS[paper];
  for (const [pw, ph] of [[p.w, p.h], [p.h, p.w]]) {
    if (need(w) <= pw && need(h) + 10 <= ph) return { pageW: pw, pageH: ph, x: (pw - w) / 2, y: (ph - h - 10) / 2, custom: false };
  }
  const pw = Math.ceil(need(w)), ph = Math.ceil(need(h) + 10);
  return { pageW: pw, pageH: ph, x: M, y: M, custom: true };
}
