import type { MetadataRoute } from "next";

// served at /sitemap.xml
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://ppulab.dev/",
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://ppulab.dev/docs",
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
