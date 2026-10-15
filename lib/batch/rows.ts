/**
 * Rows for batch personalisation: a pasted list (one name per line), a spreadsheet paste (tabs) or a
 * CSV file with a header row. Each row has a name and, optionally, a date and a photo file name.
 */

export interface BatchRow { name: string; date: string; photo: string }

export const MAX_ZIP_ROWS = 200;
const MAX_CELL = 160;

/** Records of a delimited text, honouring quotes (quoted cells may hold the delimiter or newlines). */
function records(text: string, delim: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"' && !cell.trim()) { quoted = true; cell = ""; }
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

const NAME = /^(name|names|text|line|title|first line|person)$/i;
const DATE = /^(date|dates|year|when|second line|subtitle)$/i;
const PHOTO = /^(photo|photos|image|picture|file|filename|file name)$/i;

/** Rows from pasted text or a CSV/TSV file; `dropped` counts rows past the limit. */
export function parseRows(raw: string, max = MAX_ZIP_ROWS): { rows: BatchRow[]; header: boolean; dropped: number } {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const first = text.split("\n").find((l) => l.trim()) ?? "";
  const delim = first.includes("\t") ? "\t" : [",", ";"].find((d) => first.split(d).some((c) => NAME.test(c.trim().replace(/^"|"$/g, "")))) ?? "";
  const recs = delim ? records(text, delim) : text.split("\n").map((l) => [l]);
  let cols = { name: 0, date: delim === "\t" ? 1 : -1, photo: delim === "\t" ? 2 : -1 };
  let header = false;
  const head = recs.findIndex((r) => r.some((c) => c.trim()));
  if (head >= 0 && delim) {
    const h = recs[head].map((c) => c.trim());
    const at = (re: RegExp) => h.findIndex((c) => re.test(c));
    if (at(NAME) >= 0) { header = true; cols = { name: at(NAME), date: at(DATE), photo: at(PHOTO) }; }
  }
  const cell = (r: string[], k: number) => (k >= 0 ? (r[k] ?? "").trim().slice(0, MAX_CELL) : "");
  const rows: BatchRow[] = [];
  let dropped = 0;
  recs.forEach((r, i) => {
    if (header && i <= head) return;
    const name = cell(r, cols.name);
    if (!name) return;
    if (rows.length >= max) { dropped++; return; }
    rows.push({ name, date: cell(r, cols.date), photo: cell(r, cols.photo) });
  });
  return { rows, header, dropped };
}

/** A file or folder name from a row's name: letters (any script) and digits, joined by dashes. */
export function slugOf(s: string): string {
  const out = s.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return out || "row";
}

/** The text a row puts in the design: the name, and the date on a line of its own (or after it). */
export const rowText = (r: BatchRow, multiline: boolean) => (r.date ? `${r.name}${multiline ? "\n" : " "}${r.date}` : r.name);

/** Folder names for the rows: numbered so they sort in order and never clash. */
export function rowFolders(rows: BatchRow[]): string[] {
  const w = String(rows.length).length;
  return rows.map((r, i) => `${String(i + 1).padStart(Math.max(2, w), "0")}-${slugOf(r.name)}`);
}
