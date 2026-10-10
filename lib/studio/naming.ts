/** Project names (spec §12): required, defaulting to "Untitled {Generator|Design} {n}", unique per folder. */

export function defaultProjectName(kind: string, existing: string[]): string {
  const base = `Untitled ${kind}`;
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** "Box" → "Box", or "Box (2)", "Box (3)"… when the name is taken (case-insensitive). */
export function uniqueName(name: string, existing: string[]): string {
  const clean = cleanName(name) || "Untitled";
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!taken.has(clean.toLowerCase())) return clean;
  const stem = clean.replace(/\s*\(\d+\)$/, "");
  for (let n = 2; ; n++) {
    const next = `${stem} (${n})`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

/** Trims, collapses whitespace, strips control characters and limits the length to 120. */
export function cleanName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}
