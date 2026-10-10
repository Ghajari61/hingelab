import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticleView } from "@/components/help/HelpArticleView";
import { ARTICLES, articleBySlug } from "@/lib/help";

/** The article without the site header, for the help panel inside the editors. */
type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => ARTICLES.map((a) => ({ slug: a.slug }));
export const metadata: Metadata = { robots: { index: false } };

export default async function Page({ params }: Props) {
  const article = articleBySlug((await params).slug);
  if (!article) notFound();
  return (
    <div className="studio-page help-embed">
      <HelpArticleView article={article} linkBase="/help/embed/" />
    </div>
  );
}
