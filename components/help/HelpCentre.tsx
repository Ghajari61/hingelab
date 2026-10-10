"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchHelp, type HelpIndexEntry } from "@/lib/help/search";
import { LEGACY_ANCHORS } from "@/lib/help/sections";
import "./help.css";

export type HelpGroup = { product: string; name: string; articles: { slug: string; title: string; summary: string }[] };

/** The /help front page: search across every article and option, or browse by product. */
export function HelpCentre({ index, groups }: { index: HelpIndexEntry[]; groups: HelpGroup[] }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const results = useMemo(() => searchHelp(index, q), [index, q]);

  useEffect(() => {
    const to = LEGACY_ANCHORS[window.location.hash.slice(1)];
    if (to) router.replace(`/help/${to}`);
  }, [router]);

  return (
    <div className="help-centre">
      <h1>Help centre</h1>
      <label className="help-search">
        <Search size={16} aria-hidden />
        <input type="search" placeholder="Search help, e.g. kerf, Auto-fix, hub radius" aria-label="Search help" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      {q.trim() ? (
        <section aria-label="Search results">
          <p className="help-count">{results.length ? `${results.length} article${results.length === 1 ? "" : "s"}` : "Nothing found. Try another word."}</p>
          <ul className="help-list">
            {results.map((r) => (
              <li key={r.slug}>
                <Link href={`/help/${r.slug}`}><strong>{r.title}</strong><span className="help-tag">{r.product}</span></Link>
                <p>{r.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="help-groups">
          {groups.map((g) => (
            <section key={g.product} aria-label={g.name}>
              <h2>{g.name}</h2>
              <ul className="help-list">
                {g.articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/help/${a.slug}`}><strong>{a.title}</strong></Link>
                    <p>{a.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
