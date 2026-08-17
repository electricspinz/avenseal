import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FAQPage from "@/app/faq/page";
import HowItWorksPage from "@/app/how-it-works/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { PublicHeader } from "@/components/public-shell";

describe("Customer Experience Sprint 2 public guidance", () => {
  it("answers supported upload, access, payment, preparation, and technical readiness questions", () => {
    render(<FAQPage />);

    for (const question of ["What documents can I upload?", "What happens after I pay?", "Can I cancel or reschedule?", "What if my secure workspace link expires?", "What technology should I have ready?", "What should I prepare before my appointment?"]) {
      expect(screen.getByText(question)).toBeTruthy();
    }
    expect(screen.getByText(/Files must be 10 MB or smaller/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("BlueNotary received your document");
    expect(document.body.textContent).not.toContain("Identity verified");
  });

  it("explains only supported preparation requirements before booking", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("heading", { name: /what you['’]ll need/i })).toBeTruthy();
    expect(screen.getByText(/device with a camera and microphone/i)).toBeTruthy();
    expect(screen.getByText(/A document that has not been signed yet, unless the commissioned notary instructs you otherwise\./)).toBeTruthy();
  });

  it("keeps a useful Help path alongside Schedule in the compact public header", () => {
    render(<PublicHeader />);
    expect(screen.getByRole("link", { name: "Help" }).getAttribute("href")).toBe("/faq");
    expect(screen.getByRole("link", { name: "Schedule" }).getAttribute("href")).toBe("/book");
  });

  it("adds scan-friendly in-page navigation without changing legal policy substance", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("navigation", { name: "Privacy Policy sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "1. Introduction and Scope" }).getAttribute("href")).toBe("#privacy-1-introduction-and-scope");

    render(<TermsPage />);
    expect(screen.getByRole("navigation", { name: "Terms of Service sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "8. Fees, Payment, Taxes, Cancellation, and Refunds" }).getAttribute("href")).toBe("#terms-8-fees-payment-taxes-cancellation-and-refunds");
  });
});
