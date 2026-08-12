import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  trackPartnerInterestStarted: vi.fn(),
  trackPartnerInterestSubmitted: vi.fn(),
  trackPartnerPageView: vi.fn()
}));

vi.mock("@/lib/analytics", () => analytics);
vi.mock("@/components/public-shell", () => ({ PublicShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/button", () => ({ Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>, ButtonLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

import PartnersPage, { metadata } from "@/app/partners/page";
import { PartnerInterestForm } from "@/components/partner-interest-form";
import { currentPartnerCode, normalizePartnerCode, rememberPartnerCode } from "@/lib/partner-attribution";

describe("Professional Partner Network", () => {
  beforeEach(() => {
    analytics.trackPartnerInterestStarted.mockReset();
    analytics.trackPartnerInterestSubmitted.mockReset();
    analytics.trackPartnerPageView.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the public partner page with accurate role boundaries", () => {
    render(<PartnersPage />);

    expect(screen.getByRole("heading", { name: "Give Your Clients an Easier Way to Access Online Notary Services" })).toBeTruthy();
    expect(screen.getAllByText(/Identity verification, electronic signing, and the live audio-video session take place through BlueNotary/i)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Become an Avenseal Partner" }).getAttribute("href")).toBe("#partner-interest");
  });

  it("publishes complete partner metadata", () => {
    expect(metadata.alternates?.canonical).toBe("/partners");
    expect(metadata.openGraph).toMatchObject({ url: "/partners", images: ["/brand/avenseal-og-social.png"] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: ["/brand/avenseal-og-social.png"] });
  });

  it("validates and retains only safe partner-code slugs for the current browser session", () => {
    expect(normalizePartnerCode("Smith-Law")).toBe("smith-law");
    expect(normalizePartnerCode("smith law")).toBeNull();
    expect(normalizePartnerCode("<script>")).toBeNull();
    expect(rememberPartnerCode("smith-law")).toBe("smith-law");
    expect(currentPartnerCode()).toBe("smith-law");
    expect(rememberPartnerCode("not a partner code")).toBeNull();
    expect(currentPartnerCode()).toBeNull();
  });

  it("submits partner interest through the public boundary and keeps PII out of analytics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Thank you. We’ll review your information and follow up about the Avenseal Professional Partner Network." }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PartnerInterestForm />);

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Avery" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Stone" } });
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Stone Law" } });
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "avery@example.com" } });
    fireEvent.change(screen.getByLabelText("Industry / organization type"), { target: { value: "family-law" } });
    fireEvent.click(screen.getByLabelText(/does not provide referral commissions/i));
    fireEvent.click(screen.getByRole("button", { name: "Request Partner Information" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/partners/interest", expect.objectContaining({ method: "POST" }));
    expect(analytics.trackPartnerInterestSubmitted).toHaveBeenCalledOnce();
    expect(JSON.stringify(analytics.trackPartnerInterestSubmitted.mock.calls)).not.toContain("avery@example.com");
  });

  it("requires the commission acknowledgement before native form submission", () => {
    render(<PartnerInterestForm />);
    expect(screen.getByLabelText(/does not provide referral commissions/i)).toHaveProperty("required", true);
  });
});
