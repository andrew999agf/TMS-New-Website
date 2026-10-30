import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL;
  return {
    rules: [{ userAgent: "*", allow: ["/", "/share/*/manifest.json", "/share/*/file/*"], disallow: ["/admin", "/api"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
