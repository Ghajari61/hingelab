import type { TemplateCategory, TemplateMeta } from "./types";

const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Templates whose title, category, tags or description contain every word of the query (as a word
 * prefix), best first: title hits, then tag hits, then featured, then catalogue order.
 */
export function searchTemplates<T extends TemplateMeta>(list: T[], query: string, category?: TemplateCategory): T[] {
  const q = words(query);
  const scored: { t: T; score: number; i: number }[] = [];
  list.forEach((t, i) => {
    if (category && t.category !== category) return;
    const title = words(t.title), tags = t.tags.flatMap(words), rest = [...words(t.category), ...words(t.description)];
    let score = t.featured ? 1 : 0;
    for (const w of q) {
      const hit = (ws: string[]) => ws.some((x) => x.startsWith(w));
      if (hit(title)) score += 6;
      else if (hit(tags)) score += 4;
      else if (hit(rest)) score += 1;
      else return;
    }
    scored.push({ t, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.t);
}
