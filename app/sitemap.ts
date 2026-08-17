import type { MetadataRoute } from "next";

const siteUrl = "https://www.avenseal.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/how-it-works", "/pricing", "/faq", "/about", "/partners"].map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.8
  }));
}
