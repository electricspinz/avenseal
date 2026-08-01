import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPaymentLink: vi.fn(),
  getAppointment: vi.fn(),
  requireAdminOrganizationContext: vi.fn()
}));

vi.mock("@/lib/server/repository", () => ({
  repository: { createPaymentLink: mocks.createPaymentLink, getAppointment: mocks.getAppointment }
}));

vi.mock("@/lib/server/admin-context", () => ({
  requireAdminOrganizationContext: mocks.requireAdminOrganizationContext
}));

import { POST } from "@/app/api/admin/appointments/[id]/payment-link/route";

describe("payment-link delivery response", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdminOrganizationContext.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", organizationId: "org-1", role: "admin" });
    mocks.getAppointment.mockResolvedValue({ id: "appointment-1", organizationId: "org-1", customer: { email: "customer@example.com" } });
  });

  it("returns the payment link when email delivery fails", async () => {
    mocks.createPaymentLink.mockResolvedValue({
      payment: { checkoutUrl: "https://checkout.stripe.com/pay/test" },
      delivery: { status: "failed", providerMessageId: null, error: "SMTP rejected message" }
    });

    const response = await POST(new Request("http://localhost/api/admin/appointments/appointment-1/payment-link", { method: "POST" }), {
      params: Promise.resolve({ id: "appointment-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: {
        payment: { checkoutUrl: "https://checkout.stripe.com/pay/test" },
        delivery: { status: "failed", providerMessageId: null, error: "SMTP rejected message" },
        customerEmail: "customer@example.com"
      }
    });
  });
});
