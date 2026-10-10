import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/app/editor/local"], disallow: ["/app/", "/api/", "/auth/"] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
