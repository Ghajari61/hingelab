/**
 * Bookmarks and export history kept in this browser. On their own so the editor and the bookmark
 * button do not pull in the generator catalogue.
 */
export const BOOKMARKS_KEY = "hingelab-bookmarks";
export const EXPORT_HISTORY_KEY = "hingelab-export-history";

export interface ExportHistoryItem { name: string; at: string }

export function readBookmarks(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function toggleBookmark(slug: string): string[] {
  const cur = readBookmarks();
  const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next)); } catch { /* storage blocked: kept for this view only */ }
  return next;
}

export function readExportHistory(): ExportHistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => x && typeof x.name === "string" && typeof x.at === "string").slice(0, 30);
  } catch {
    return [];
  }
}

export function recordExport(name: string): void {
  try {
    const next = [{ name, at: new Date().toISOString() }, ...readExportHistory()].slice(0, 30);
    localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(next));
  } catch { /* storage blocked */ }
}
