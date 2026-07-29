import { describe, expect, it } from "vitest";
import { formatPaymentAmount, paymentIdentity, timelineFromPayment, type PaymentRecord } from "@/lib/server/payments";

const payment: PaymentRecord = { id: "payment", organizationId: "org-a", customerId: "customer", customerName: "Jordan", appointmentId: "appointment", amountMinor: 12500, currency: "USD", purpose: "appointment_fee", status: "paid", description: "Appointment service payment.", requestedAt: "2026-07-29T10:00:00.000Z", dueAt: null, paidAt: "2026-07-29T11:00:00.000Z", refundedAt: null, createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T11:00:00.000Z", source: "appointment", correlationId: null, safeReference: null };

describe("Payments foundation", () => {
  it("uses deterministic tenant-scoped identity and minor-unit money", () => {
    expect(paymentIdentity(payment)).toBe(paymentIdentity(payment));
    expect(paymentIdentity({ ...payment, organizationId: "org-b" })).not.toBe(paymentIdentity(payment));
    expect(formatPaymentAmount(payment.amountMinor, payment.currency)).toBe("$125.00");
    expect(Number.isInteger(payment.amountMinor)).toBe(true);
  });
  it("maps safe payment lifecycle context into a timeline draft", () => {
    const event = timelineFromPayment(payment);
    expect(event).toMatchObject({ category: "payment", type: "payment_received", outcome: "succeeded", paymentId: payment.id, metadata: { amountMinor: 12500, currency: "USD" } });
    expect(JSON.stringify(event)).not.toContain("stripe");
  });
});
