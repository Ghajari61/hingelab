import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { allCollections } from "@/lib/site/collections";
import "../landing.css";

export const metadata: Metadata = {
  title: "Collections",
  description: "Laser cut designs for Christmas, weddings, birthdays, baby showers, Valentine's Day and more: ready-made, made to your size.",
  alternates: { canonical: "/collections" },
};

export default function CollectionsPage() {
  return (
    <PageShell title="Collections" lede="Designs for every occasion, from every generator. Each one opens ready to change and export.">
      <div className="ia-grid">
        {allCollections().map((c) => (
          <Link key={c.slug} className="ia-card" href={`/collections/${c.slug}`}>
            <span className="ia-pic"><img src={c.items[0].picture} alt="" width={300} height={200} loading="lazy" /></span>
            <span className="ia-chip">{c.items.length} DESIGNS</span>
            <b>{c.name}</b>
            <p>{c.intro.split(". ")[0]}.</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
