import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/app/editor/local`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
