import { describe, expect, it } from "vitest";
import { organizationStructuredData } from "@/app/layout";
import { faqStructuredData, metadata as faqMetadata } from "@/app/faq/page";
import { metadata as homeMetadata } from "@/app/page";
import { metadata as pricingMetadata } from "@/app/pricing/page";
import { metadata as howItWorksMetadata } from "@/app/how-it-works/page";
import { metadata as aboutMetadata } from "@/app/about/page";
import { metadata as contactMetadata } from "@/app/contact/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("Customer Acquisition Sprint 1 SEO foundation", () => {
  it("publishes one linked Organization and LocalBusiness schema graph without unsupported claims", () => {
    const graph = organizationStructuredData["@graph"];
    expect(graph.map((entry) => entry["@type"])).toEqual(["Organization", "LocalBusiness"]);
    expect(graph[1]).toMatchObject({ parentOrganization: { "@id": "https://www.avenseal.com/#organization" }, areaServed: "Florida" });
    expect(graph[1]).not.toHaveProperty("address");
    expect(graph[1]).not.toHaveProperty("aggregateRating");
    expect(graph[1]).not.toHaveProperty("review");
  });

  it("derives FAQPage schema directly from the public FAQ content", () => {
    expect(faqStructuredData).toMatchObject({ "@context": "https://schema.org", "@type": "FAQPage" });
    expect(faqStructuredData.mainEntity).toHaveLength(11);
    expect(faqStructuredData.mainEntity).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "What documents can I upload?", acceptedAnswer: expect.objectContaining({ text: expect.stringMatching(/PDF, JPEG, or PNG/) }) })
    ]));
  });

  it("keeps public-page canonical, Open Graph, and Twitter metadata complete", () => {
    for (const metadata of [homeMetadata, faqMetadata, pricingMetadata, howItWorksMetadata, aboutMetadata, contactMetadata]) {
      expect(metadata.title).toBeTruthy();
      expect(metadata.description).toBeTruthy();
      expect(metadata.alternates?.canonical).toBeTruthy();
      expect(metadata.openGraph).toMatchObject({ url: expect.any(String), title: expect.any(String), description: expect.any(String) });
      expect(metadata.openGraph?.images).toBeTruthy();
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: ["/brand/avenseal-og-social.png"] });
    }
  });

  it("keeps sitemap and robots aligned with indexable public routes", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://www.avenseal.com/faq");
    expect(urls).not.toContain("https://www.avenseal.com/contact");
    expect(robots()).toMatchObject({ host: "https://www.avenseal.com", sitemap: "https://www.avenseal.com/sitemap.xml", rules: { allow: "/" } });
    expect(contactMetadata.robots).toEqual({ index: false, follow: false });
  });
});
