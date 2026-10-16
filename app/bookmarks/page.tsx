import type { Metadata } from "next";
import { BookmarkList } from "@/components/site/LocalLists";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "Bookmarks", alternates: { canonical: "/bookmarks" } };

export default function BookmarksPage() {
  return (
    <PageShell title="Bookmarks" lede="Saved on this browser only. They are not copied to your account.">
      <BookmarkList />
    </PageShell>
  );
}
