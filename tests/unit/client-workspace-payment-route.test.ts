import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCustomerAppointmentByAccessToken: vi.fn(), createPaymentLink: vi.fn() }));
vi.mock("@/lib/server/repository", () => ({ repository: mocks }));

import { POST } from "@/app/api/appointments/access/[token]/payment/route";

const payable = { appointmentId: "appointment-a", organizationId: "organization-a", paymentStatus: "payment_link_created" };
const call = (token: string, body?: unknown) => POST(new Request(`http://localhost/api/appointments/access/${token}/payment`, { method: "POST", body: body ? JSON.stringify(body) : undefined }), { params: Promise.resolve({ token }) });

describe("Client Workspace payment endpoint", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("returns only an immediate Checkout URL for the token-owned payable appointment", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(payable);
    mocks.createPaymentLink.mockResolvedValue({ payment: { checkoutUrl: "https://checkout.stripe.com/c/pay_test", stripeCheckoutSessionId: "cs_secret", stripePaymentIntentId: "pi_secret", metadata: { private: true } } });
    const response = await call("valid-token", { appointmentId: "other", organizationId: "other", amount: 1, currency: "EUR" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "checkout_ready", checkoutUrl: "https://checkout.stripe.com/c/pay_test" });
    expect(mocks.createPaymentLink).toHaveBeenCalledTimes(1);
    expect(mocks.createPaymentLink).toHaveBeenCalledWith("appointment-a");
  });

  it("rejects invalid, expired, revoked, and cross-tenant tokens with the same safe response", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(null);
    for (const token of ["invalid", "expired", "revoked", "other-tenant"]) {
      const response = await call(token);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    }
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("does not create Checkout for paid or unavailable payment states and hides internal errors", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue({ ...payable, paymentStatus: "paid" });
    await expect((await call("paid")).json()).resolves.toEqual({ status: "already_paid" });
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(payable);
    mocks.createPaymentLink.mockRejectedValue(new Error("Stripe request req_secret failed"));
    const response = await call("payable");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
