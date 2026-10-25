import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { CATALOGUE, type CatalogueProcess } from "@/lib/generators/nav";
import "../landing.css";

export const metadata: Metadata = { title: "Generators", alternates: { canonical: "/generators" } };

const TABS: { id: "" | CatalogueProcess; label: string }[] = [
  { id: "", label: "All" },
  { id: "laser", label: "Laser cut" },
  { id: "engrave", label: "Engrave" },
  { id: "paper", label: "Paper" },
];

export default async function GeneratorsPage({ searchParams }: { searchParams: Promise<{ q?: string; process?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const process = sp.process === "laser" || sp.process === "engrave" || sp.process === "paper" ? sp.process : "";
  const items = CATALOGUE.filter((c) => {
    if (process && c.process !== process) return false;
    if (!q) return true;
    return `${c.name} ${c.blurb} ${c.category}`.toLowerCase().includes(q);
  });
  return (
    <PageShell title="Generators" lede="Every HingeLab generator. Open one to change it. Saving and exporting need Pro.">
      <div className="ia-filters">
        {TABS.map((t) => (
          <Link key={t.label} href={t.id ? `/generators?process=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ""}` : `/generators${q ? `?q=${encodeURIComponent(q)}` : ""}`} aria-current={!process && !t.id || process === t.id ? "page" : undefined}>{t.label}</Link>
        ))}
      </div>
      {q && <p>Showing matches for “{sp.q}”.</p>}
      <div className="ia-grid">
        {items.map((c) => (
          <Link key={c.slug} className="ia-card" href={`/generators/${c.slug}`}>
            {c.picture ? <span className="ia-pic"><img src={c.picture} alt="" width={300} height={200} loading="lazy" /></span> : <span className="ia-pic ia-pic-none" aria-hidden="true" />}
            <span className="ia-chip">{c.plan === "pro" ? "PRO" : "FREE PREVIEW"}{c.presetCount != null ? ` · ${c.presetCount} presets` : ""}</span>
            <b>{c.name}</b>
            <p>{c.blurb}</p>
          </Link>
        ))}
      </div>
      {items.length === 0 && <p>No generator matches that search.</p>}
    </PageShell>
  );
}
