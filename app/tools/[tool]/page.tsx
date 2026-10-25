import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FreeTool } from "@/components/site/FreeTool";
import { PageShell } from "@/components/site/PageShell";
import { TOOLS, toolById } from "@/lib/site/tools";
import "../../landing.css";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const t = toolById((await params).tool);
  if (!t) return { title: "Tool" };
  return { title: t.title, description: t.blurb, alternates: { canonical: `/tools/${t.id}` } };
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const t = toolById((await params).tool);
  if (!t) notFound();
  const ld = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: `HingeLab ${t.name}`, applicationCategory: "DesignApplication",
    operatingSystem: "Web browser", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: t.blurb,
  };
  return (
    <PageShell title={t.title} lede={t.blurb}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <FreeTool tool={t.id} />
      <h2>How to use it</h2>
      <ol>{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <h2>Questions</h2>
      {t.faq.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
      <h2>More free tools</h2>
      <ul>
        {TOOLS.filter((o) => o.id !== t.id).map((o) => <li key={o.id}><Link href={`/tools/${o.id}`}>{o.name}</Link></li>)}
        <li><Link href="/generators">Every generator</Link>: boxes, signs, toppers, clocks, puzzles and more, made to your size.</li>
      </ul>
    </PageShell>
  );
}
