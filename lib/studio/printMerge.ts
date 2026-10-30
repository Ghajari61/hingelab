/**
 * Print Merge (as in CorelDRAW): text in the artwork holds field names in square brackets,
 * [Name] or [Table], and a table of records (pasted from a spreadsheet, or a CSV or text file)
 * fills them. Each record makes a copy of the artwork with its own values, laid out in a grid
 * under the original, ready to nest and cut. The original keeps its field names.
 */
import { newId } from "./doc";
import { isEmptyBox, translate } from "./geom";
import { duplicateNodes, findNode, selectionBox, topLevel, transformNodes, type IdFactory } from "./scene";
import type { Document, SceneNode } from "./types";

export interface MergeData { fields: string[]; records: string[][] }

/** The field names in a text, in order, without repeats. */
export const fieldsIn = (text: string): string[] => [...new Set([...text.matchAll(/\[([^\]\n]{1,40})\]/g)].map((m) => m[1].trim()).filter(Boolean))];

/** A table from pasted spreadsheet cells, CSV or semicolon text: the first row names the fields. */
export function parseMergeData(raw: string): MergeData {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = text.split("\n").find((l) => l.trim()) ?? "";
  const delim = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (!clean.length) return { fields: [], records: [] };
  const fields = clean[0].map((f, k) => f.replace(/^\[|\]$/g, "").trim() || `Field ${k + 1}`);
  return { fields, records: clean.slice(1).map((r) => fields.map((_, k) => r[k] ?? "")) };
}

/** The field names used by the text in these objects (and inside their groups). */
export function mergeFields(d: Document, ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of topLevel(d.root, ids)) {
    const n = findNode(d.root, id);
    if (n) visit(n, (t) => fieldsIn(t.text).forEach((f) => out.add(f)));
  }
  return [...out];
}

function visit(n: SceneNode, fn: (t: Extract<SceneNode, { type: "text" }>) => void) {
  if (n.type === "text") fn(n);
  if (n.type === "group") n.children.forEach((c) => visit(c, fn));
}

/** A text with its fields filled from one record (unknown fields are left as they are). */
export function fillFields(text: string, data: MergeData, record: string[]): string {
  return text.replace(/\[([^\]\n]{1,40})\]/g, (all, name: string) => {
    const k = data.fields.findIndex((f) => f.toLowerCase() === name.trim().toLowerCase());
    return k >= 0 ? record[k] ?? "" : all;
  });
}

export interface MergeLayout { columns: number; gapX: number; gapY: number }

/**
 * One copy of the selection per record, its fields filled, in rows of `columns` under the
 * original. Returns the ids of the copies (their top-level objects).
 */
export function printMerge(d: Document, ids: string[], data: MergeData, o: MergeLayout, id: IdFactory = newId): string[] {
  const top = topLevel(d.root, ids);
  const b = selectionBox(d, top);
  if (isEmptyBox(b) || !data.records.length) return [];
  const cols = Math.max(1, Math.min(50, Math.round(o.columns)));
  const px = b.maxX - b.minX + o.gapX, py = b.maxY - b.minY + o.gapY;
  const out: string[] = [];
  data.records.slice(0, 500).forEach((rec, i) => {
    const copies = duplicateNodes(d, top, { x: 0, y: 0 }, id);
    transformNodes(d, copies, translate((i % cols) * px, (Math.floor(i / cols) + 1) * py));
    for (const c of copies) {
      const n = findNode(d.root, c);
      if (!n) continue;
      visit(n, (t) => {
        const filled = fillFields(t.text, data, rec);
        // a new text: its outline is drawn again from the font
        if (filled !== t.text) { t.text = filled; delete t.outline; }
      });
    }
    out.push(...copies);
  });
  return out;
}
