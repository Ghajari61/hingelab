import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { HelpArticleView } from "@/components/help/HelpArticleView";
import { ARTICLES, articleBySlug } from "@/lib/help";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => ARTICLES.map((a) => ({ slug: a.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = articleBySlug((await params).slug);
  return a ? { title: `${a.title} · Help`, description: a.summary } : {};
}

export default async function Page({ params }: Props) {
  const article = articleBySlug((await params).slug);
  if (!article) notFound();
  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main help-main">
        <Link href="/help" className="help-back">← All help</Link>
        <HelpArticleView article={article} />
      </main>
    </div>
  );
}
