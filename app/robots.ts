import type { MetadataRoute } from "next";

// served at /robots.txt
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: "https://ppulab.dev/sitemap.xml",
    host: "https://ppulab.dev",
  };
}
