/**
 * Fuzzy matching for the command palette and the start-screen search: every query character must
 * appear in order, and each scattered piece must begin a word or stay inside the previous piece's
 * word; consecutive runs, word starts and an early first match score higher.
 */
export interface FuzzyMatch { score: number; ranges: [number, number][] }

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, ranges: [] };
  const t = text.toLowerCase();
  const sub = t.indexOf(q);
  if (sub >= 0) {
    const wordStart = sub === 0 || /[\s\-_/(▸]/.test(t[sub - 1]);
    return { score: 1000 - sub + (wordStart ? 200 : 0) + q.length * 10, ranges: [[sub, sub + q.length]] };
  }
  let score = 0, ti = 0, run = 0;
  const ranges: [number, number][] = [];
  for (const ch of q) {
    if (ch === " ") continue;
    const at = t.indexOf(ch, ti);
    if (at < 0) return null;
    const wordStart = at === 0 || /[\s\-_/(▸]/.test(t[at - 1]);
    const sameWord = ranges.length > 0 && !/[\s\-_/(▸]/.test(t.slice(ti, at));
    if (!(at === ti && ranges.length) && !wordStart && !sameWord) return null;
    run = at === ti && ranges.length ? run + 1 : 0;
    score += 10 + run * 15 + (wordStart ? 25 : 0) - Math.min(at - ti, 10);
    const last = ranges[ranges.length - 1];
    if (last && last[1] === at) last[1] = at + 1; else ranges.push([at, at + 1]);
    ti = at + 1;
  }
  return { score, ranges };
}

/** Items sorted by best match; `boost` adds to the score (recently used first). */
export function fuzzyFilter<T>(items: T[], query: string, text: (t: T) => string, boost?: (t: T) => number): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch; i: number }[] = [];
  items.forEach((item, i) => {
    const m = fuzzyMatch(query, text(item));
    if (m) out.push({ item, match: { ...m, score: m.score + (boost?.(item) ?? 0) }, i });
  });
  return out.sort((a, b) => b.match.score - a.match.score || a.i - b.i).map(({ item, match }) => ({ item, match }));
}
