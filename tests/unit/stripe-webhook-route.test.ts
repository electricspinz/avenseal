import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmPaymentFromStripe: vi.fn(),
  getServerEnv: vi.fn()
}));

vi.mock("@/lib/server/repository", () => ({
  repository: { confirmPaymentFromStripe: mocks.confirmPaymentFromStripe }
}));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));

import { POST } from "@/app/api/webhooks/stripe/route";

const webhookSecret = "whsec_webhook_test";

function signedRequest(event: Record<string, unknown>, signature = true) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: signature ? { "stripe-signature": `t=${timestamp},v1=${digest}` } : {},
    body: payload
  });
}

function checkoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_checkout_success",
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        id: "cs_trusted",
        payment_intent: "pi_trusted",
        metadata: {
          organization_id: "organization-attacker",
          appointment_id: "appointment-attacker"
        }
      }
    },
    ...overrides
  };
}

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getServerEnv.mockReturnValue({ STRIPE_WEBHOOK_SECRET: webhookSecret });
  });

  it("accepts a valid Checkout success and forwards only trusted processor identifiers", async () => {
    mocks.confirmPaymentFromStripe.mockResolvedValue({ confirmed: true });

    const response = await POST(signedRequest(checkoutEvent()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, result: { confirmed: true } });
    expect(mocks.confirmPaymentFromStripe).toHaveBeenCalledOnce();
    expect(mocks.confirmPaymentFromStripe).toHaveBeenCalledWith({
      providerEventId: "evt_checkout_success",
      eventType: "checkout.session.completed",
      checkoutSessionId: "cs_trusted",
      paymentIntentId: "pi_trusted"
    });
  });

  it("accepts a duplicate event and a replay with modified metadata without a route-level error", async () => {
    mocks.confirmPaymentFromStripe
      .mockResolvedValueOnce({ confirmed: true })
      .mockResolvedValueOnce({ duplicate: true });

    const first = await POST(signedRequest(checkoutEvent()));
    const replay = await POST(signedRequest(checkoutEvent({
      data: { object: { object: "checkout.session", id: "cs_trusted", payment_intent: "pi_trusted", metadata: { organization_id: "organization-other", appointment_id: "appointment-other" } } }
    })));

    expect(first.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({ received: true, result: { duplicate: true } });
    expect(mocks.confirmPaymentFromStripe).toHaveBeenCalledTimes(2);
    for (const call of mocks.confirmPaymentFromStripe.mock.calls) {
      expect(call[0]).not.toHaveProperty("metadata");
      expect(call[0]).not.toHaveProperty("organizationId");
      expect(call[0]).not.toHaveProperty("appointmentId");
    }
  });

  it("rejects missing and invalid signatures without reaching payment processing", async () => {
    const missing = await POST(signedRequest(checkoutEvent(), false));
    const invalid = await POST(new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=invalid" },
      body: JSON.stringify(checkoutEvent())
    }));

    for (const response of [missing, invalid]) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid signature." });
    }
    expect(mocks.confirmPaymentFromStripe).not.toHaveBeenCalled();
  });

  it("acknowledges unrelated and stale payment events without invoking the payment workflow", async () => {
    for (const type of ["customer.created", "checkout.session.expired", "payment_intent.payment_failed"]) {
      const response = await POST(signedRequest(checkoutEvent({ type })));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true, ignored: true });
    }
    expect(mocks.confirmPaymentFromStripe).not.toHaveBeenCalled();
  });

  it("allows a later authoritative success after an ignored stale event", async () => {
    mocks.confirmPaymentFromStripe.mockResolvedValue({ confirmed: true });

    await POST(signedRequest(checkoutEvent({ type: "checkout.session.expired" })));
    const success = await POST(signedRequest(checkoutEvent()));

    await expect(success.json()).resolves.toEqual({ received: true, result: { confirmed: true } });
    expect(mocks.confirmPaymentFromStripe).toHaveBeenCalledOnce();
  });

  it("safely acknowledges an unknown payment according to the repository result", async () => {
    mocks.confirmPaymentFromStripe.mockResolvedValue({ ignored: true });

    const response = await POST(signedRequest(checkoutEvent({ data: { object: { object: "checkout.session", id: "cs_unknown", payment_intent: "pi_unknown" } } })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, result: { ignored: true } });
    expect(mocks.confirmPaymentFromStripe).toHaveBeenCalledWith(expect.objectContaining({
      checkoutSessionId: "cs_unknown",
      paymentIntentId: "pi_unknown"
    }));
  });

  it("does not expose raw processor or persistence errors when processing fails", async () => {
    mocks.confirmPaymentFromStripe.mockRejectedValue(new Error("Stripe request req_secret database details"));

    const response = await POST(signedRequest(checkoutEvent()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Webhook processing failed." });
  });

  it("resolves payment-intent successes using stored payment-intent identifiers", async () => {
    mocks.confirmPaymentFromStripe.mockResolvedValue({ confirmed: true });

    const response = await POST(signedRequest({
      id: "evt_intent_success",
      type: "payment_intent.succeeded",
      data: { object: { object: "payment_intent", id: "pi_trusted", checkout_session: "cs_trusted", metadata: { organization_id: "organization-attacker" } } }
    }));

    expect(response.status).toBe(200);
    expect(mocks.confirmPaymentFromStripe).toHaveBeenCalledWith({
      providerEventId: "evt_intent_success",
      eventType: "payment_intent.succeeded",
      checkoutSessionId: "cs_trusted",
      paymentIntentId: "pi_trusted"
    });
  });
});
