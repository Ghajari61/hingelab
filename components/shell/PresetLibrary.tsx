"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { useGenPrefs } from "@/components/generators/useGenPrefs";
import { presetMatches } from "@/lib/generators/randomise";

type Card = { id: string; name: string; note: string; category?: string; tags?: string[] };
/** The same complete, keyboard-accessible library in every product's left rail. */
export function PresetLibrary<T extends Card>({ product, presets, onApply, getCategory }: {
  product: string; presets: T[]; getCategory?: (preset: T) => string; onApply: (preset: T, keepSetup: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("curated");
  const [keep, setKeep] = useState(false);
  const [selected, setSelected] = useState("");
  const prefs = useGenPrefs(product);
  const categoriesById = useMemo(() => new Map(presets.map(p => [p.id, p.category ?? getCategory?.(p)])), [presets, getCategory]);
  const categories = [...new Set([...categoriesById.values()].filter((v): v is string => !!v))];
  const shown = presets.filter(p => presetMatches(query, { ...p, note: [p.note, categoriesById.get(p.id), ...(p.tags ?? [])].join(" ") })
    && (filter === "all" || filter === "favourites" && prefs.favs.includes(p.id) || filter === "recent" && prefs.recent.includes(p.id) || filter === `category:${categoriesById.get(p.id)}`));
  if (sort === "name") shown.sort((a,b) => a.name.localeCompare(b.name));
  else if (filter === "recent") shown.sort((a,b) => prefs.recent.indexOf(a.id)-prefs.recent.indexOf(b.id));
  return <section className="gallery-group preset-library" aria-label={`${product} preset library`}>
    <h3>Presets <span className="preset-total">{presets.length}</span></h3>
    <input className="gsearch" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${presets.length} presets`} aria-label={`Search ${product} presets`} />
    <div className="preset-filters">
      <select aria-label="Filter presets" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">All designs</option><option value="favourites">Favourites</option><option value="recent">Recent</option>
        {categories.map(c=><option key={c} value={`category:${c}`}>{c.replaceAll("-", " ")}</option>)}
      </select>
      <select aria-label="Sort presets" value={sort} onChange={e=>setSort(e.target.value)}><option value="curated">Curated</option><option value="name">A–Z</option></select>
    </div>
    <label className="preset-keep"><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)} /> Keep material & sheet size</label>
    <p className="preset-status" role="status">{shown.length} of {presets.length} designs{keep ? " · Check joints after changing stock" : ""}</p>
    {!shown.length && <div className="gempty">No designs match. Try another word or <button type="button" onClick={()=>{setQuery("");setFilter("all");}}>show all designs</button>.</div>}
    <div className="gcards c2" role="group" aria-label={`${product} presets`}>
      {shown.map(p=><div className="gcell" key={p.id}>
        <button type="button" className="gcard" data-v={p.id} title={`${p.name}: ${p.note}`} aria-pressed={selected===p.id} onClick={()=>{onApply(p,keep);setSelected(p.id);prefs.used(p.id);}}>
          <span className="art pic" aria-hidden="true"><img src={`/presets/${product}/${p.id}.svg`} alt="" width={96} height={66} loading="lazy" decoding="async" /></span>
          <span className="lbl"><span className="t">{p.name}</span></span>
        </button>
        <button type="button" className="gfav" aria-pressed={prefs.favs.includes(p.id)} aria-label={`${prefs.favs.includes(p.id)?"Remove":"Add"} ${p.name} ${prefs.favs.includes(p.id)?"from":"to"} favourites`} onClick={()=>prefs.toggleFav(p.id)}><Star size={13} aria-hidden="true" /></button>
      </div>)}
    </div>
  </section>;
}
