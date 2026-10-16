import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "Blog", alternates: { canonical: "/blog" } };

export default function BlogPage() {
  return (
    <PageShell title="Blog">
      <article>
        <h2>Make, Community and Learn</h2>
        <p>15 October 2026. The public menu now has three groups. Make opens the generator catalogue, templates and your saved projects. Community opens the gallery, collections, original graphics and the material list. Learn opens the help centre, the kerf tool, this site’s changelog and a note for developers.</p>
        <p><Link href="/generators">Browse generators</Link></p>
      </article>
    </PageShell>
  );
}
