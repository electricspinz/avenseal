import type React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a> }));

import { PublicMobileNavigation } from "@/components/public-mobile-navigation";
import { metadata as layoutMetadata } from "@/app/layout";
import { metadata as homeMetadata } from "@/app/page";
import { metadata as howItWorksMetadata } from "@/app/how-it-works/page";
import { metadata as pricingMetadata } from "@/app/pricing/page";
import { metadata as faqMetadata } from "@/app/faq/page";
import { metadata as aboutMetadata } from "@/app/about/page";
import { metadata as contactMetadata } from "@/app/contact/page";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import { metadata as termsMetadata } from "@/app/terms/page";
import { metadata as bookMetadata } from "@/app/book/page";
import { metadata as confirmationMetadata } from "@/app/booking/confirmation/page";
import { metadata as portalMetadata } from "@/app/portal/page";
import { metadata as statusMetadata } from "@/app/appointments/status/page";
import { metadata as accessRequestMetadata } from "@/app/appointments/access/request/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("public launch readiness", () => {
  it("provides an accessible mobile menu with the approved public routes", () => {
    render(<PublicMobileNavigation />);

    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);

    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    for (const label of ["Home", "How It Works", "Pricing", "FAQ", "About", "Contact", "Request Appointment"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }

    fireEvent.keyDown(window, { key: "Escape" });
    expect(navigation.isConnected).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("indexes only finalized marketing routes through the sitemap and allows crawler access", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://www.avenseal.com/",
      "https://www.avenseal.com/how-it-works",
      "https://www.avenseal.com/pricing",
      "https://www.avenseal.com/faq",
      "https://www.avenseal.com/about"
    ]);
    expect(robots()).toMatchObject({ host: "https://www.avenseal.com", sitemap: "https://www.avenseal.com/sitemap.xml", rules: { allow: "/" } });
  });

  it("keeps utility, contact, and draft legal routes out of indexing", () => {
    for (const metadata of [contactMetadata, privacyMetadata, termsMetadata, bookMetadata, confirmationMetadata, portalMetadata, statusMetadata, accessRequestMetadata]) {
      expect(metadata.robots).toEqual({ index: false, follow: false });
    }
  });

  it("sets canonical www-host metadata and Twitter summaries for marketing routes", () => {
    expect(layoutMetadata.metadataBase?.toString()).toBe("https://www.avenseal.com/");
    for (const metadata of [homeMetadata, howItWorksMetadata, pricingMetadata, faqMetadata, aboutMetadata]) {
      expect(metadata.alternates?.canonical).toBeTruthy();
      expect(metadata.openGraph?.title).toBeTruthy();
      expect(metadata.openGraph?.description).toBeTruthy();
      expect(metadata.openGraph?.url).toBeTruthy();
      expect(metadata.twitter).toMatchObject({ card: "summary" });
    }
  });
});
