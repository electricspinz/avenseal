import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createStatusLinkHandler } from "@/app/api/appointments/status-link/handler";
import { InMemoryDistributedRateLimitStore, rateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";

const genericMessage = "If we find a matching appointment, we will send a secure status link.";
const allowed: RateLimitResult = { allowed: true, retryAfterSeconds: 60 };

function request(body: unknown, ip = "203.0.113.40") {
  return new NextRequest("http://localhost/api/appointments/status-link", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body)
  });
}

function handler(overrides: Partial<Parameters<typeof createStatusLinkHandler>[0]> = {}) {
  const requestStatusLink = vi.fn<(input: { email: string; reference: string }) => Promise<void>>().mockResolvedValue();
  const consumeRateLimit = vi.fn<(policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>>().mockResolvedValue(allowed);
  return {
    requestStatusLink,
    consumeRateLimit,
    handle: createStatusLinkHandler({
      requestIdentity: (incoming) => incoming.headers.get("x-forwarded-for") ?? "unknown-client",
      consumeRateLimit,
      requestStatusLink,
      ...overrides
    })
  };
}

describe("status-link route", () => {
  it("passes an allowed valid request to the existing status-link workflow", async () => {
    const { handle, requestStatusLink, consumeRateLimit } = handler();

    const response = await handle(request({ email: " customer@example.com ", reference: "ABC-123" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: genericMessage });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(requestStatusLink).toHaveBeenCalledOnce();
    expect(requestStatusLink).toHaveBeenCalledWith({ email: "customer@example.com", reference: "ABC-123" });
    expect(consumeRateLimit).toHaveBeenCalledTimes(2);
  });

  it("returns the shared generic 429 response for an IP block without invoking the workflow", async () => {
    const consumeRateLimit = vi.fn().mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 17 }).mockResolvedValueOnce(allowed);
    const { handle, requestStatusLink } = handler({ consumeRateLimit });

    const response = await handle(request({ email: "customer@example.com", reference: "ABC-123" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "rate_limited" });
    expect(requestStatusLink).not.toHaveBeenCalled();
    expect(consumeRateLimit).toHaveBeenCalledTimes(2);
  });

  it("returns the shared generic 429 response for an email block without invoking the workflow", async () => {
    const { handle, requestStatusLink } = handler({
      consumeRateLimit: vi.fn().mockResolvedValueOnce(allowed).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 19 })
    });

    const response = await handle(request({ email: "customer@example.com", reference: "ABC-123" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ status: "rate_limited" });
    expect(requestStatusLink).not.toHaveBeenCalled();
  });

  it("fails closed when rate limiting is unavailable and prevents the workflow", async () => {
    const { handle, requestStatusLink } = handler({ consumeRateLimit: vi.fn().mockRejectedValue(new Error("unavailable")) });

    const response = await handle(request({ email: "customer@example.com", reference: "ABC-123" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "rate_limited" });
    expect(requestStatusLink).not.toHaveBeenCalled();
  });

  it("keeps malformed and unknown appointment requests non-enumerating", async () => {
    const malformed = handler();
    const malformedResponse = await malformed.handle(request({ email: "not-an-email", reference: "short" }, "198.51.100.11"));
    expect(malformedResponse.status).toBe(200);
    expect(await malformedResponse.json()).toEqual({ message: genericMessage });
    expect(malformedResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(malformed.consumeRateLimit).not.toHaveBeenCalled();
    expect(malformed.requestStatusLink).not.toHaveBeenCalled();

    const unknown = handler();
    const unknownResponse = await unknown.handle(request({ email: "missing@example.com", reference: "UNKNOWN" }, "198.51.100.12"));
    expect(unknownResponse.status).toBe(200);
    expect(await unknownResponse.json()).toEqual({ message: genericMessage });
    expect(unknown.requestStatusLink).toHaveBeenCalledOnce();
  });

  it("does not expose raw identities and shares hashed counters between independently created handlers", async () => {
    const store = new InMemoryDistributedRateLimitStore(() => 0);
    const storedKeys: string[] = [];
    const consumeRateLimit = async (policy: RateLimitPolicy, identity: string) => {
      const key = rateLimitIdentity(policy, identity);
      storedKeys.push(key);
      return store.consume(policy, key);
    };
    const first = handler({ consumeRateLimit });
    const second = handler({ consumeRateLimit });
    const email = "secret.customer@example.com";
    const ip = "203.0.113.77";

    for (let count = 0; count < 10; count++) {
      const target = count % 2 === 0 ? first : second;
      expect((await target.handle(request({ email: `customer-${count}@example.com`, reference: "ABC-123" }, ip))).status).toBe(200);
    }
    const blocked = await second.handle(request({ email, reference: "ABC-123" }, ip));
    const responseBody = await blocked.text();

    expect(blocked.status).toBe(429);
    expect(responseBody).not.toContain(email);
    expect(responseBody).not.toContain(ip);
    expect(storedKeys).not.toContain(email);
    expect(storedKeys).not.toContain(ip);
    expect(storedKeys.every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
    expect(first.requestStatusLink).toHaveBeenCalledTimes(5);
    expect(second.requestStatusLink).toHaveBeenCalledTimes(5);
  });
});
