/** The `.oclc` extension and file names: kept apart from `file.ts` so the editors load only this much up front. */

export const OCLC_EXT = ".oclc";
/** What Open… offers in a file picker: the new extension first, then the older ones. */
export const OPEN_ACCEPT = ".oclc,.hingelab,.json,application/json,application/zip";

/** "My box" → "My box.oclc", with characters Windows refuses replaced. */
export function oclcName(name: string): string {
  const base = name.replace(/\.(oclc|hingelab(\.json)?|json)$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().replace(/[. ]+$/, "") || "Untitled";
  return base.slice(0, 120) + OCLC_EXT;
}
