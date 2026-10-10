import type { Metadata } from "next";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { HelpCentre } from "@/components/help/HelpCentre";
import { articlesByProduct, helpIndex } from "@/lib/help";

export const metadata: Metadata = { title: "Help" };

export default function Page() {
  const groups = articlesByProduct().map((g) => ({
    product: g.product, name: g.name,
    articles: g.articles.map((a) => ({ slug: a.slug, title: a.title, summary: a.summary })),
  }));
  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main help-main">
        <HelpCentre index={helpIndex()} groups={groups} />
      </main>
    </div>
  );
}
