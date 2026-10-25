import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/site/PageShell";
import { GENERATOR_INFO, isGeneratorId } from "@/lib/generators/ids";
import { allCollections, collectionBySlug } from "@/lib/site/collections";
import "../../landing.css";

export function generateStaticParams() {
  return allCollections().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = collectionBySlug((await params).slug);
  if (!c) return { title: "Collection" };
  return { title: c.title, description: c.intro, alternates: { canonical: `/collections/${c.slug}` } };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const c = collectionBySlug((await params).slug);
  if (!c) notFound();
  const others = allCollections().filter((o) => o.slug !== c.slug);
  return (
    <PageShell title={c.title} lede={c.intro}>
      <div className="ia-grid gen-presets coll-grid">
        {c.items.map((it) => (
          <Link key={`${it.product}/${it.id}`} className="ia-card" href={it.href}>
            <span className="ia-pic"><img src={it.picture} alt="" width={300} height={200} loading="lazy" /></span>
            <span className="ia-chip">{isGeneratorId(it.product) ? GENERATOR_INFO[it.product].name.toUpperCase() : it.product.toUpperCase()}</span>
            <b>{it.name}</b>
            {it.note && <p>{it.note}</p>}
          </Link>
        ))}
      </div>
      <h2>How it works</h2>
      <ol>
        <li>Open a design. Change the name, the size, the font and the material.</li>
        <li>Run the checks: thin parts, loose slots and parts larger than your bed come with a fix.</li>
        <li>Export SVG, DXF, PDF or a LightBurn file, laid out on your sheet with your kerf.</li>
      </ol>
      <h2>More collections</h2>
      <p className="coll-more">{others.map((o, i) => <span key={o.slug}>{i ? " · " : ""}<Link href={`/collections/${o.slug}`}>{o.name}</Link></span>)}</p>
    </PageShell>
  );
}
