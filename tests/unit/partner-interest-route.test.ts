import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createPartnerInterestHandler } from "@/app/api/partners/interest/handler";
import type { RateLimitResult } from "@/lib/server/distributed-rate-limit";

const allowed: RateLimitResult = { allowed: true, retryAfterSeconds: 60 };
const validInput = { firstName: "Avery", lastName: "Stone", organization: "Stone Law", workEmail: "avery@example.com", phone: "", industry: "family-law", website: "", message: "", noCommissionAcknowledged: true };

function request(body: unknown) {
  return new NextRequest("https://www.avenseal.com/api/partners/interest", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("partner interest route", () => {
  it("uses the existing email boundary after rate limiting a valid interest request", async () => {
    const consumeRateLimit = vi.fn().mockResolvedValue(allowed);
    const deliver = vi.fn().mockResolvedValue({ status: "sent", providerMessageId: "provider-id", error: null });
    const handle = createPartnerInterestHandler({ requestIdentity: () => "203.0.113.10", consumeRateLimit, getRecipient: vi.fn().mockResolvedValue("partners@avenseal.example"), deliver });

    const response = await handle(request(validInput));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Thank you. We’ll review your information and follow up about the Avenseal Professional Partner Network." });
    expect(consumeRateLimit).toHaveBeenCalledWith("partner_interest_ip", "203.0.113.10");
    expect(consumeRateLimit).toHaveBeenCalledWith("partner_interest_email", "avery@example.com");
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("rejects malformed submissions without sending email", async () => {
    const deliver = vi.fn();
    const handle = createPartnerInterestHandler({ requestIdentity: () => "203.0.113.10", consumeRateLimit: vi.fn(), getRecipient: vi.fn(), deliver });

    const response = await handle(request({ ...validInput, noCommissionAcknowledged: false }));

    expect(response.status).toBe(400);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("fails closed before delivery when a limiter rejects the request", async () => {
    const deliver = vi.fn();
    const handle = createPartnerInterestHandler({ requestIdentity: () => "203.0.113.10", consumeRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 12 }), getRecipient: vi.fn(), deliver });

    const response = await handle(request(validInput));

    expect(response.status).toBe(429);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("does not acknowledge a request when email delivery is unavailable", async () => {
    const handle = createPartnerInterestHandler({ requestIdentity: () => "203.0.113.10", consumeRateLimit: vi.fn().mockResolvedValue(allowed), getRecipient: vi.fn().mockResolvedValue("partners@avenseal.example"), deliver: vi.fn().mockResolvedValue({ status: "skipped", providerMessageId: null, error: "Email delivery is not configured." }) });

    const response = await handle(request(validInput));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "We couldn’t submit your request right now. Please try again." });
  });
});
