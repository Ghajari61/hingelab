import type { MetadataRoute } from "next";
import { CATALOGUE } from "@/lib/generators/nav";
import { ARTICLES } from "@/lib/help/articles";
import { siteOrigin } from "@/lib/site/config";
import { allCollections } from "@/lib/site/collections";
import { TOOLS } from "@/lib/site/tools";

/** Every public page: the landing page, generators, free tools, collections and guides. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly" = "monthly") => ({ url: `${base}${path}`, changeFrequency, priority });
  return [
    page("/", 1, "weekly"),
    page("/app/editor/local", 0.8),
    page("/generators", 0.9, "weekly"),
    ...CATALOGUE.map((c) => page(`/generators/${c.slug}`, 0.8)),
    page("/miniature-studio", 0.8, "weekly"),
    page("/tools", 0.8),
    ...TOOLS.map((t) => page(`/tools/${t.id}`, 0.8)),
    page("/collections", 0.7, "weekly"),
    ...allCollections().map((c) => page(`/collections/${c.slug}`, 0.7, "weekly")),
    page("/templates", 0.7, "weekly"),
    page("/help", 0.6),
    ...ARTICLES.map((a) => page(`/help/${a.slug}`, 0.5)),
    page("/learn/kerf", 0.6),
    page("/about", 0.3, "yearly"),
    page("/terms", 0.2, "yearly"),
    page("/privacy", 0.2, "yearly"),
  ];
}
