/**
 * The assembly booklet as a PDF (A4, written from the PDF 1.4 reference): a cover with the finished
 * model and the general notes, the parts list, then the steps two to a page, each with a vector
 * drawing of the model so far (new parts picked out), what to do and the parts it adds.
 *
 * The drawings are the projected SVGs of assemblyBook.ts, whose paths are only M, L and Z, so they
 * convert to PDF path operators directly. Text is Helvetica (WinAnsi, so plain Latin letters); a
 * few typographic characters are spelled out and anything else becomes "?". Page streams are
 * Flate-compressed.
 */
import { zlibSync } from "fflate";
import type { BomRow } from "./bom";

export interface BookletInput {
  title: string;
  subtitle: string;
  cover: string;
  notes: string[];
  bom: BomRow[];
  steps: { title: string; text: string; parts: string[]; svg: string }[];
}

const W = 595.28, H = 841.89, M = 42;
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const LATIN: Record<string, string> = { "×": "x", "²": "2", "³": "3", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "°": " deg", "·": "-", "₂": "2", "•": "-" };
/** Plain Latin text: typographic characters spelled out, accents dropped, anything else "?". */
const latin = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => LATIN[c] ?? (c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "") || "?"));
/** Text for a PDF string: plain Latin with its backslashes and parentheses escaped. */
const pdfText = (s: string) => latin(s).replace(/[\\()]/g, (c) => "\\" + c);

/** Helvetica advance widths, roughly, per character, in em. */
function emWidth(ch: string, bold: boolean): number {
  if (ch === " ") return 0.278;
  if ("il.,:;|!'`".includes(ch)) return 0.25;
  if ("fjrt()[]-/".includes(ch)) return 0.36;
  if ("mwMW".includes(ch)) return 0.86;
  if (/[A-Z]/.test(ch)) return bold ? 0.72 : 0.68;
  if (/[0-9]/.test(ch)) return 0.556;
  return bold ? 0.6 : 0.54;
}
const textWidth = (s: string, size: number, bold = false) => [...s].reduce((w, c) => w + emWidth(c, bold), 0) * size;

function wrap(s: string, size: number, width: number, bold = false): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) <= width || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

function rgb(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => n(parseInt(m[1].slice(i, i + 2), 16) / 255)).join(" ");
}

/** An SVG of M/L/Z paths drawn into the box (x, y from the bottom, w, h), centred and fitted. */
export function svgOps(svg: string, x: number, y: number, w: number, h: number): string {
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
  if (!vb) return "";
  const [vx, vy, vw, vh] = vb.slice(1).map(Number);
  const s = Math.min(w / vw, h / vh), ox = x + (w - vw * s) / 2, top = y + h - (h - vh * s) / 2;
  const X = (v: number) => n(ox + (v - vx) * s), Y = (v: number) => n(top - (v - vy) * s);
  const ops: string[] = ["q", "1 j 1 J"];
  for (const m of svg.matchAll(/<path d="([^"]*)"([^>]*)\/>/g)) {
    const attr = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(m[2])?.[1];
    const fill = attr("fill"), stroke = attr("stroke"), sw = Number(attr("stroke-width") ?? 0), even = attr("fill-rule") === "evenodd";
    const f = fill && fill !== "none" ? rgb(fill) : null, st = stroke && stroke !== "none" ? rgb(stroke) : null;
    if (!f && !st) continue;
    const path: string[] = [];
    for (const t of m[1].matchAll(/([MLZ])\s*(?:([-\d.]+)[ ,]([-\d.]+))?/g)) {
      if (t[1] === "Z") path.push("h");
      else path.push(`${X(Number(t[2]))} ${Y(Number(t[3]))} ${t[1] === "M" ? "m" : "l"}`);
    }
    if (!path.length) continue;
    if (f) ops.push(`${f} rg`);
    if (st) ops.push(`${st} RG`, `${n(Math.max(0.2, sw * s))} w`);
    ops.push(path.join(" "), f && st ? (even ? "B*" : "B") : f ? (even ? "f*" : "f") : "S");
  }
  ops.push("Q");
  return ops.join("\n");
}

class Page {
  ops: string[] = [];
  text(s: string, x: number, y: number, size: number, bold = false, grey = false) {
    this.ops.push(`BT ${grey ? "0.4 0.38 0.35" : "0.13 0.11 0.09"} rg /${bold ? "F2" : "F1"} ${n(size)} Tf ${n(x)} ${n(y)} Td (${pdfText(s)}) Tj ET`);
  }
  /** Wrapped text from the top line's baseline down; returns the baseline below the last line. */
  para(s: string, x: number, y: number, size: number, width: number, bold = false, grey = false): number {
    for (const line of wrap(latin(s), size, width, bold)) { this.text(line, x, y, size, bold, grey); y -= size * 1.35; }
    return y;
  }
  rule(x0: number, y: number, x1: number) { this.ops.push(`0.85 0.82 0.78 RG 0.6 w ${n(x0)} ${n(y)} m ${n(x1)} ${n(y)} l S`); }
  box(x: number, y: number, w: number, h: number) { this.ops.push(`0.975 0.965 0.95 rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`); }
}

/** The booklet as PDF bytes. */
export function assemblyPDF(b: BookletInput): { pdf: Uint8Array; pages: number } {
  const pages: Page[] = [];
  const page = () => { const p = new Page(); pages.push(p); return p; };
  const CW = W - 2 * M;

  // cover
  let p = page();
  p.text(b.title, M, H - M - 22, 24, true);
  let y = p.para(b.subtitle, M, H - M - 46, 12, CW, false, true) - 6;
  // the picture takes what the notes leave, so the cover is one page when it can be
  const notesH = b.notes.reduce((k, t) => k + wrap(latin(`- ${t}`), 10, CW).length * 13.5 + 3, 0) + 44;
  const imgH = Math.max(200, Math.min(380, y - M - 10 - notesH));
  p.box(M, y - imgH, CW, imgH);
  p.ops.push(svgOps(b.cover, M + 10, y - imgH + 10, CW - 20, imgH - 20));
  y -= imgH + 24;
  p.text("Before you start", M, y, 13, true);
  y -= 20;
  for (const note of b.notes) {
    if (y - wrap(latin(`- ${note}`), 10, CW).length * 13.5 < M + 10) { p = page(); y = H - M - 20; }
    y = p.para(`- ${note}`, M, y, 10, CW) - 3;
  }

  // parts list
  p = page();
  p.text("Parts list", M, H - M - 18, 18, true);
  y = H - M - 46;
  const cols = [M, M + 300, M + 340, M + 440];
  const head = () => { ["Part", "Qty", "Size (mm)", "Thickness"].forEach((h, i) => p.text(h, cols[i], y, 9, true, true)); y -= 6; p.rule(M, y, W - M); y -= 13; };
  head();
  for (const r of b.bom) {
    if (y < M + 30) { p = page(); y = H - M - 20; head(); }
    const name = wrap(latin(r.name), 9, 290)[0] ?? "";
    p.text(name, cols[0], y, 9); p.text(String(r.qty), cols[1], y, 9); p.text(`${r.w} x ${r.h}`, cols[2], y, 9); p.text(`${r.t} mm`, cols[3], y, 9);
    y -= 14;
  }
  y -= 4; p.rule(M, y + 10, W - M);
  p.text(`${b.bom.reduce((k, r) => k + r.qty, 0)} parts. Sizes are as drawn, before kerf.`, M, y - 4, 9, false, true);

  // steps, two to a page
  const half = (H - 2 * M) / 2;
  b.steps.forEach((s, i) => {
    if (i % 2 === 0) p = page();
    const top = H - M - (i % 2) * half;
    p.text(`Step ${i + 1} of ${b.steps.length}`, M, top - 12, 9, true, true);
    p.text(s.title, M, top - 30, 14, true);
    const imgH = half - 120;
    p.box(M, top - 40 - imgH, CW, imgH);
    p.ops.push(svgOps(s.svg, M + 8, top - 34 - imgH, CW - 16, imgH - 12));
    let ty = p.para(s.text, M, top - 56 - imgH, 10, CW);
    ty = p.para(`New parts (orange): ${s.parts.join(", ")}`, M, ty - 2, 9, CW, false, true);
    if (i % 2 === 0 && i + 1 < b.steps.length) p.rule(M, H - M - half + 4, W - M);
  });
  pages.forEach((pg, i) => pg.text(`${b.title} - page ${i + 1} of ${pages.length}`, M, M - 22, 8, false, true));

  // the file
  const objs: (string | Uint8Array)[] = [];
  const add = (o: string | Uint8Array) => { objs.push(o); return objs.length; };
  const enc = new TextEncoder();
  const catalog = add(""), pagesObj = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const pg of pages) {
    const data = zlibSync(enc.encode(pg.ops.join("\n")), { level: 6 });
    const head = enc.encode(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), tail = enc.encode("\nendstream");
    const stream = new Uint8Array(head.length + data.length + tail.length);
    stream.set(head); stream.set(data, head.length); stream.set(tail, head.length + data.length);
    const c = add(stream);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${pdfText(b.title)}) /Producer (HingeLab) >>`);
  const chunks: Uint8Array[] = [enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  let len = chunks[0].length;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(len);
    const a = enc.encode(`${i + 1} 0 obj\n`), body = typeof o === "string" ? enc.encode(o) : o, z = enc.encode("\nendobj\n");
    chunks.push(a, body, z);
    len += a.length + body.length + z.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${len}\n%%EOF\n`;
  chunks.push(enc.encode(xref));
  const pdf = new Uint8Array(chunks.reduce((k, c) => k + c.length, 0));
  let at = 0;
  for (const c of chunks) { pdf.set(c, at); at += c.length; }
  return { pdf, pages: pages.length };
}
