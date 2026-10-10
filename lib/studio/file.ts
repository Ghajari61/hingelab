/**
 * The `.hingelab` project file (spec §12): a ZIP with document.json, assets/, thumbnail.png and
 * manifest.json (app and schema versions). Older single-product project files (plain JSON from the
 * Hinge Box, Letters and Parametric editors) are recognised and handed back as "legacy".
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate";
import { migrateDocument, SCHEMA_VERSION } from "./doc";
import { parseProjectFile } from "@/lib/projects";
import type { ProductId } from "@/lib/supabase/types";
import type { Document } from "./types";

export const APP_VERSION = "2.0.0";
export const FILE_EXT = ".hingelab";
/** Refuse archives that would expand past this (a damaged or hostile file). */
const MAX_UNZIPPED = 300 * 1024 * 1024;

export interface Manifest {
  app: "HingeLab Studio";
  appVersion: string;
  schemaVersion: number;
  savedAt: string;
  files: string[];
}

export interface PackInput {
  doc: Document;
  assets?: Record<string, Uint8Array>;
  thumbnail?: Uint8Array;
  savedAt?: string;
}

export function packHingelab({ doc, assets = {}, thumbnail, savedAt }: PackInput): Uint8Array {
  const files: Record<string, Uint8Array> = { "document.json": strToU8(JSON.stringify(doc)) };
  for (const [id, bytes] of Object.entries(assets)) files[`assets/${safeAssetName(id)}`] = bytes;
  if (thumbnail) files["thumbnail.png"] = thumbnail;
  const manifest: Manifest = {
    app: "HingeLab Studio", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION,
    savedAt: savedAt ?? new Date().toISOString(), files: Object.keys(files).sort(),
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  // Fixed timestamps keep the archive byte-identical for the same input.
  return zipSync(files, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
}

export type OpenedFile =
  | { kind: "studio"; doc: Document; assets: Record<string, Uint8Array>; thumbnail?: Uint8Array; manifest: Manifest }
  | { kind: "legacy"; product: ProductId; params: unknown };

export function openHingelab(bytes: Uint8Array): OpenedFile {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return openZip(bytes);
  // Not a ZIP: maybe a project file from the single-product editors.
  let text: string;
  try { text = strFromU8(bytes); } catch { throw new Error("This file is not a HingeLab project."); }
  const legacy = parseProjectFile(text);
  if ("error" in legacy) throw new Error(legacy.error + ".");
  return { kind: "legacy", product: legacy.product, params: legacy.params };
}

function openZip(bytes: Uint8Array): OpenedFile {
  let total = 0;
  let files: Unzipped;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED) throw new Error("too large");
        return f.name === "document.json" || f.name === "manifest.json" || f.name === "thumbnail.png" || f.name.startsWith("assets/");
      },
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.message === "too large" ? "This project file is too large to open." : "This project file is damaged.");
  }
  if (!files["document.json"]) throw new Error("This project file has no document.");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(files["manifest.json"] ?? strToU8("{}")));
  } catch {
    throw new Error("This project file is damaged.");
  }
  let raw: unknown;
  try { raw = JSON.parse(strFromU8(files["document.json"])); } catch { throw new Error("This project file is damaged."); }
  const doc = migrateDocument(raw);
  const assets: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) if (name.startsWith("assets/") && name.length > 7) assets[name.slice(7)] = data;
  return { kind: "studio", doc, assets, thumbnail: files["thumbnail.png"], manifest };
}

function safeAssetName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "asset";
}

/** "My box" → "My box.hingelab", with characters Windows refuses replaced. */
export function projectFileName(name: string): string {
  const base = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().replace(/[. ]+$/, "") || "Untitled";
  return base + FILE_EXT;
}
