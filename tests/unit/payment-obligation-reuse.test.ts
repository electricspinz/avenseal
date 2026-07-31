import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("createPaymentLink payment-obligation reuse", () => {
  it("loads and updates the booking-created obligation instead of inserting a second payment row", () => {
    const source = readFileSync(resolve("lib/server/repository.ts"), "utf8");
    const method = source.slice(source.indexOf("async createPaymentLink"), source.indexOf("async confirmPaymentFromStripe"));
    expect(method).toContain("const obligation = await repository.ensureAppointmentPaymentObligation(appointment)");
    expect(method).toContain("const existingPayment = existingPayments?.[0] ?? obligation");
    expect(method).toContain(".update(checkoutUpdate).eq(\"id\", existingPayment.id)");
    expect(method).toContain("stripe_checkout_session_id: checkoutSessionId");
    expect(method).toContain("stripe_payment_intent_id: paymentIntentId");
    expect(method).toContain("checkout_url: checkoutUrl");
    expect(method).toContain("expires_at: expiresAt.toISOString()");
    expect(method).toContain("existingPayment\n      ? await supabase.from(\"appointment_payments\").update(checkoutUpdate)");
  });
});
