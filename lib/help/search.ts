/** Help search over a flat index; light enough for the client. */
export interface HelpIndexEntry {
  slug: string;
  product: string;
  title: string;
  summary: string;
  keywords: string;
  /** Field labels and help, block text. */
  body: string;
}

const words = (q: string) => q.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}%°²\s-]/gu, " ").split(/\s+/).filter((w) => w.length > 1);

/** Articles that contain every word of the query, best first. */
export function searchHelp(index: HelpIndexEntry[], query: string): HelpIndexEntry[] {
  const q = words(query);
  if (!q.length) return [];
  const scored: { e: HelpIndexEntry; s: number }[] = [];
  for (const e of index) {
    const title = e.title.toLowerCase(), kw = e.keywords.toLowerCase(), sum = e.summary.toLowerCase(), body = e.body.toLowerCase();
    let s = 0;
    let all = true;
    for (const w of q) {
      const hit = (title.includes(w) ? 6 : 0) + (kw.includes(w) ? 4 : 0) + (sum.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0);
      if (!hit) { all = false; break; }
      s += hit;
    }
    if (all) scored.push({ e, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title)).map((x) => x.e);
}
