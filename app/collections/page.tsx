import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { COLLECTIONS } from "@/lib/generators/nav";
import "../landing.css";

export const metadata: Metadata = { title: "Collections", alternates: { canonical: "/collections" } };

export default function CollectionsPage() {
  return (
    <PageShell title="Collections" lede="Seasonal starting points. Each one opens a real preset.">
      <div className="ia-grid">
        {COLLECTIONS.map((c) => (
          <Link key={c.slug} className="ia-card" href={c.href}>
            <b>{c.name}</b>
            <p>{c.blurb}</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
