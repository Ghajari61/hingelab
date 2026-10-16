"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CATALOGUE, readBookmarks, readExportHistory, type ExportHistoryItem } from "@/lib/generators/nav";

export function BookmarkList() {
  const [slugs, setSlugs] = useState<string[] | null>(null);
  useEffect(() => setSlugs(readBookmarks()), []);
  if (!slugs) return <p>Loading bookmarks on this device…</p>;
  if (!slugs.length) return <p>No bookmarks on this device yet. Open a generator and choose Bookmark.</p>;
  return (
    <ul>
      {slugs.map((slug) => {
        const item = CATALOGUE.find((c) => c.slug === slug);
        return <li key={slug}><Link href={item ? `/generators/${slug}` : "/generators"}>{item?.name ?? slug}</Link></li>;
      })}
    </ul>
  );
}

export function ExportHistoryList() {
  const [items, setItems] = useState<ExportHistoryItem[] | null>(null);
  useEffect(() => setItems(readExportHistory()), []);
  if (!items) return <p>Loading export history on this device…</p>;
  if (!items.length) return <p>No exports from this browser yet. A Pro export is listed here after it downloads.</p>;
  return (
    <ul>
      {items.map((it) => <li key={it.at + it.name}><b>{it.name}</b> <span>{it.at.slice(0, 16).replace("T", " ")}</span></li>)}
    </ul>
  );
}
