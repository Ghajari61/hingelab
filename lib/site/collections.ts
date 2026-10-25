/**
 * Seasonal and occasion pages (/collections/<slug>): every ready-made design that fits, from every
 * generator, with its picture. A design joins by a word in its id or name, or by being listed.
 */
import { ALL_GENERATORS } from "@/lib/generators/all";

export interface CollectionItem { product: string; id: string; name: string; note: string; href: string; picture: string }
export interface Collection { slug: string; name: string; title: string; intro: string; words: RegExp; also?: string[]; items: CollectionItem[] }

const DEFS: Omit<Collection, "items">[] = [
  {
    slug: "christmas", name: "Christmas", title: "Christmas laser cut designs: ornaments, toppers and decorations",
    intro: "Name ornaments, a bird house for the tree, stocking holders, table numbers for Christmas dinner, pop-up trees and cake toppers. Every design changes size, name and material, and exports a file your laser cuts right the first time.",
    words: /christmas|xmas|ornament|snowflake|stocking|bauble|santa|winter|noel/i,
    also: ["sign/name-ornament", "sign/star-ornament", "sign/tree-of-life-ornament", "boxes/birdhouse-ornament"],
  },
  { slug: "wedding", name: "Wedding", title: "Wedding laser cut designs: toppers, table numbers and signs", intro: "Mr & Mrs toppers, table numbers in matching styles, welcome signs and keepsake boxes, all made to your names and sizes.", words: /wedding|mr-mrs|bride|groom|engag|she-said-yes|anniversary/i },
  { slug: "birthday", name: "Birthday", title: "Birthday laser cut designs: cake toppers and party signs", intro: "Happy Birthday toppers, number and age toppers, party sets with cupcake picks, and gift boxes.", words: /birthday|party|cupcake|age-|milestone/i },
  { slug: "baby", name: "Baby", title: "Baby shower laser cut designs", intro: "Oh baby toppers, name signs for the nursery and keepsake boxes.", words: /baby|nursery|stroller|newborn|shower/i },
  { slug: "halloween", name: "Halloween", title: "Halloween laser cut designs", intro: "Layered shadow box scenes and spooky signs.", words: /halloween|pumpkin|spooky|rabbit-hole|haunt/i },
  { slug: "eid", name: "Eid and Ramadan", title: "Eid and Ramadan laser cut designs", intro: "Eid Mubarak toppers, lanterns and crescent designs, with layered art for the table.", words: /eid|ramadan|crescent|lantern|mosque/i },
  { slug: "valentines", name: "Valentine's Day", title: "Valentine's Day laser cut designs", intro: "Love toppers, heart boxes and signs for someone special.", words: /valentine|love|heart/i },
  { slug: "graduation", name: "Graduation", title: "Graduation laser cut designs", intro: "Class of toppers, awards and signs for the big day.", words: /graduat|class-of|grad-/i },
];

function collect(def: Omit<Collection, "items">): Collection {
  const items: CollectionItem[] = [];
  const seen = new Set<string>();
  for (const g of ALL_GENERATORS) for (const pr of g.presets) {
    const key = `${g.id}/${pr.id}`;
    const hit = def.also?.includes(key) || def.words.test(pr.id) || def.words.test(pr.name);
    if (!hit || seen.has(key)) continue;
    seen.add(key);
    items.push({ product: g.id, id: pr.id, name: pr.name, note: pr.note ?? "", href: `/app/editor/local?p=${g.id}&preset=${encodeURIComponent(pr.id)}`, picture: `/presets/${g.id}/${pr.id}.svg` });
  }
  // listed designs first, then by product so a page reads in groups
  const rank = (it: CollectionItem) => (def.also?.indexOf(`${it.product}/${it.id}`) ?? -1) >= 0 ? def.also!.indexOf(`${it.product}/${it.id}`) : 100;
  items.sort((a, b) => rank(a) - rank(b) || a.product.localeCompare(b.product));
  return { ...def, items };
}

let cache: Collection[] | null = null;
export function allCollections(): Collection[] {
  cache ??= DEFS.map(collect).filter((c) => c.items.length >= 3);
  return cache;
}
export const collectionBySlug = (slug: string) => allCollections().find((c) => c.slug === slug);
