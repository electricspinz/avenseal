import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>
}));

import { ClientPaymentCard } from "@/components/client-portal/client-payment-card";
import type { ClientPortalViewModel } from "@/lib/server/client-portal";

const payment: ClientPortalViewModel["payment"] = {
  availability: "available",
  status: "payment_link_created",
  label: "Payment link created",
  amountDueCents: 2500,
  currency: "USD"
};
const fetchMock = vi.fn();
const redirectMock = vi.fn();
const originalLocation = window.location;

function renderPaymentCard(paymentOverride: ClientPortalViewModel["payment"] = payment) {
  return render(<ClientPaymentCard token="magic token/only-for-url" payment={paymentOverride} />);
}

describe("ClientPaymentCard", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    redirectMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: redirectMock }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation
    });
  });

  it("renders trusted amount and makes one token-scoped POST with no browser payment data", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");

    renderPaymentCard();

    expect(screen.getByText("Amount due: $25.00")).toBeTruthy();
    expect(document.body.textContent).not.toContain("magic token/only-for-url");
    const button = screen.getByRole("button", { name: "Pay Securely" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/appointments/access/magic%20token%2Fonly-for-url/payment",
      { method: "POST" }
    );
    expect(screen.getByRole("button", { name: "Creating secure checkout..." })).toHaveProperty("disabled", true);
    expect(storageSpy).not.toHaveBeenCalled();

    resolveFetch(new Response(JSON.stringify({ status: "unavailable" }), { headers: { "Content-Type": "application/json" } }));
    await screen.findByText("Payment is not currently available.");
  });

  it("redirects exactly once for checkout_ready without rendering checkout or processor data", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      status: "checkout_ready",
      checkoutUrl: "https://checkout.stripe.example/c/pay/cs_test_private",
      sessionId: "cs_test_private",
      paymentIntentId: "pi_private",
      processorMetadata: { secret: "private" }
    }), { headers: { "Content-Type": "application/json" } }));

    renderPaymentCard();
    expect(document.body.textContent).not.toContain("checkout.stripe.example");
    fireEvent.click(screen.getByRole("button", { name: "Pay Securely" }));

    await waitFor(() => expect(redirectMock).toHaveBeenCalledOnce());
    expect(redirectMock).toHaveBeenCalledWith("https://checkout.stripe.example/c/pay/cs_test_private");
    expect(document.body.textContent).not.toContain("checkout.stripe.example");
    expect(document.body.textContent).not.toContain("cs_test_private");
    expect(document.body.textContent).not.toContain("pi_private");
    expect(document.body.textContent).not.toContain("private");
  });

  it("shows the safe paid state without redirecting or exposing processor details", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      status: "already_paid",
      error: "Stripe payment cs_test_private pi_private"
    }), { headers: { "Content-Type": "application/json" } }));

    renderPaymentCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay Securely" }));

    await screen.findByText("Payment has already been completed.");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Pay Securely" })).toBeNull();
    expect(document.body.textContent).not.toContain("cs_test_private");
    expect(document.body.textContent).not.toContain("pi_private");
  });

  it("hides the CTA when payment is not payable", () => {
    renderPaymentCard({ ...payment, availability: "unavailable" });
    expect(screen.queryByRole("button", { name: "Pay Securely" })).toBeNull();
    expect(screen.getByText("Payment is not currently available.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides the CTA after an unavailable response without redirecting", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "unavailable" }), { headers: { "Content-Type": "application/json" } }));
    renderPaymentCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay Securely" }));
    await screen.findByText("Payment is not currently available.");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Pay Securely" })).toBeNull();
  });

  it("restores retry UI after failed or invalid responses without rendering raw errors", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("Stripe error cs_test_private pi_private"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Stripe error cs_test_private pi_private" }), { headers: { "Content-Type": "application/json" } }));

    renderPaymentCard();
    const button = screen.getByRole("button", { name: "Pay Securely" });
    fireEvent.click(button);
    await screen.findByText("We couldn't start secure checkout. Please try again.");
    expect(screen.getByRole("button", { name: "Pay Securely" })).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Pay Securely" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Pay Securely" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("cs_test_private");
    expect(document.body.textContent).not.toContain("pi_private");
  });

  it("renders the existing paid presentation without a payment request", () => {
    renderPaymentCard({ ...payment, status: "paid" });

    expect(screen.getByText("Payment has already been completed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pay Securely" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
