import { afterEach, describe, expect, it, vi } from "vitest";
import { createStripeCheckoutSession } from "@/lib/milestone3/stripe";

describe("Stripe Checkout payment-method policy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates Version 1 Checkout Sessions with immediate card payments only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cs_test", url: "https://checkout.stripe.com/c/pay/cs_test" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await createStripeCheckoutSession({
      apiKey: "sk_test_redacted",
      idempotencyKey: "payment-link-test",
      successUrl: "https://avenseal.example/booking/confirmation?payment=success",
      cancelUrl: "https://avenseal.example/booking/confirmation?payment=cancelled",
      customerEmail: "customer@example.com",
      lineItem: { name: "Remote notarization", amountCents: 2500, currency: "usd", quantity: 1 },
      metadata: { appointment_id: "appointment-1" }
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = new URLSearchParams(String(request.body));
    expect(body.get("payment_method_types[0]")).toBe("card");
  });
});
