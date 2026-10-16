import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookmarkButton } from "@/components/site/BookmarkButton";
import { PageShell } from "@/components/site/PageShell";
import { catalogueBySlug, CATALOGUE } from "@/lib/generators/nav";
import { ARTICLES } from "@/lib/help/articles";
import "../../landing.css";

export function generateStaticParams() {
  return CATALOGUE.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = catalogueBySlug((await params).slug);
  if (!item) return { title: "Generator" };
  return { title: item.name, description: item.blurb, alternates: { canonical: `/generators/${item.slug}` } };
}

export default async function GeneratorLanding({ params }: { params: Promise<{ slug: string }> }) {
  const item = catalogueBySlug((await params).slug);
  if (!item) notFound();
  const faq = ARTICLES.filter((a) => a.product === item.helpProduct).slice(0, 4);
  const general = faq.length ? [] : ARTICLES.filter((a) => a.slug === "material-and-kerf" || a.slug === "layers-and-export" || a.slug === "checks-and-fixes");
  const articles = faq.length ? faq : general;
  return (
    <PageShell title={item.name} lede={item.blurb}>
      <p><Link className="btn-primary" href={item.href}>Open generator</Link></p>
      <p><BookmarkButton slug={item.slug} /></p>
      <p>{item.plan === "pro" ? "Pro is required to save and export this generator. Free can preview it." : "Free can preview this generator. Saving and exporting still need Pro."}</p>
      {item.presetCount != null && <p>{item.presetCount} built-in presets.</p>}
      {item.presets.length > 0 && (
        <>
          <h2>Presets</h2>
          <ul>
            {item.presets.map((p) => <li key={p.id}><Link href={p.href}>{p.name}</Link></li>)}
          </ul>
        </>
      )}
      <h2>How to use it</h2>
      <ol>
        <li>Open the generator and pick a preset, or start from the defaults.</li>
        <li>Set the size, material thickness and kerf. Run the checks before you cut.</li>
        <li>Look at the sheet and the 3D view. Export is available on Pro.</li>
      </ol>
      <h2>Questions</h2>
      {articles.map((a) => (
        <details key={a.slug}>
          <summary>{a.title}</summary>
          {a.blocks.filter((b) => b.p).slice(0, 2).map((b) => <p key={b.p}>{b.p}</p>)}
          <p><Link href={`/help/${a.slug}`}>Full guide</Link></p>
        </details>
      ))}
    </PageShell>
  );
}
