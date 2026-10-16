"use client";

import { useEffect, useState } from "react";
import { readBookmarks, toggleBookmark } from "@/lib/generators/nav";

export function BookmarkButton({ slug }: { slug: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(readBookmarks().includes(slug)), [slug]);
  return (
    <button type="button" className="btn-ghost" aria-pressed={on} onClick={() => setOn(toggleBookmark(slug).includes(slug))}>
      {on ? "Bookmarked on this device" : "Bookmark on this device"}
    </button>
  );
}
