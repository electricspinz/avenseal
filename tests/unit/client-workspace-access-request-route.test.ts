import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createClientAccessRequestHandler } from "@/app/api/appointments/access/request/handler";
import { createStatusLinkHandler } from "@/app/api/appointments/status-link/handler";
import { InMemoryDistributedRateLimitStore, rateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";

const genericMessage = "If we found an appointment matching that email address, we sent a secure link.";
const allowed: RateLimitResult = { allowed: true, retryAfterSeconds: 60 };

function request(body: unknown, ip = "203.0.113.40") {
  return new NextRequest("http://localhost/api/appointments/access/request", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body)
  });
}

function handler(overrides: Partial<Parameters<typeof createClientAccessRequestHandler>[0]> = {}) {
  const requestClientWorkspaceLink = vi.fn<(email: string) => Promise<void>>().mockResolvedValue();
  const consumeRateLimit = vi.fn<(policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>>().mockResolvedValue(allowed);
  return {
    requestClientWorkspaceLink,
    consumeRateLimit,
    handle: createClientAccessRequestHandler({
      requestIdentity: (incoming) => incoming.headers.get("x-forwarded-for") ?? "unknown-client",
      consumeRateLimit,
      requestClientWorkspaceLink,
      ...overrides
    })
  };
}

describe("Client Workspace access-request route", () => {
  it("passes an allowed valid request to the existing access-link workflow", async () => {
    const { handle, requestClientWorkspaceLink, consumeRateLimit } = handler();

    const response = await handle(request({ email: " Customer@Example.com " }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: genericMessage });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(requestClientWorkspaceLink).toHaveBeenCalledOnce();
    expect(requestClientWorkspaceLink).toHaveBeenCalledWith("Customer@Example.com");
    expect(consumeRateLimit).toHaveBeenCalledWith("client_workspace_access_ip", "203.0.113.40");
    expect(consumeRateLimit).toHaveBeenCalledWith("client_workspace_access_email", "customer@example.com");
  });

  it("returns the shared 429 response for IP and normalized-email blocks without invoking the workflow", async () => {
    const ipLimit = vi.fn().mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 17 }).mockResolvedValueOnce(allowed);
    const ipBlocked = handler({ consumeRateLimit: ipLimit });
    const ipResponse = await ipBlocked.handle(request({ email: "customer@example.com" }));
    expect(ipResponse.status).toBe(429);
    expect(ipResponse.headers.get("Retry-After")).toBe("60");
    expect(ipResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await ipResponse.json()).toEqual({ status: "rate_limited" });
    expect(ipBlocked.requestClientWorkspaceLink).not.toHaveBeenCalled();

    const emailBlocked = handler({ consumeRateLimit: vi.fn().mockResolvedValueOnce(allowed).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 23 }) });
    const emailResponse = await emailBlocked.handle(request({ email: "customer@example.com" }));
    expect(emailResponse.status).toBe(429);
    expect(emailResponse.headers.get("Retry-After")).toBe("60");
    expect(await emailResponse.json()).toEqual({ status: "rate_limited" });
    expect(emailBlocked.requestClientWorkspaceLink).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter fails and preserves generic malformed, unknown, and workflow-error responses", async () => {
    const unavailable = handler({ consumeRateLimit: vi.fn().mockRejectedValue(new Error("unavailable")) });
    const blocked = await unavailable.handle(request({ email: "customer@example.com" }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(await blocked.json()).toEqual({ status: "rate_limited" });
    expect(unavailable.requestClientWorkspaceLink).not.toHaveBeenCalled();

    const malformed = handler();
    const malformedResponse = await malformed.handle(request({ email: "not-an-email" }));
    expect(malformedResponse.status).toBe(200);
    expect(await malformedResponse.json()).toEqual({ message: genericMessage });
    expect(malformed.consumeRateLimit).not.toHaveBeenCalled();
    expect(malformed.requestClientWorkspaceLink).not.toHaveBeenCalled();

    const unknown = handler();
    const unknownResponse = await unknown.handle(request({ email: "missing@example.com" }));
    expect(unknownResponse.status).toBe(200);
    expect(await unknownResponse.json()).toEqual({ message: genericMessage });
    expect(unknown.requestClientWorkspaceLink).toHaveBeenCalledOnce();

    const failedWorkflow = handler({ requestClientWorkspaceLink: vi.fn().mockRejectedValue(new Error("token and mail state")) });
    const failedResponse = await failedWorkflow.handle(request({ email: "customer@example.com" }));
    const failedBody = await failedResponse.text();
    expect(failedResponse.status).toBe(200);
    expect(JSON.parse(failedBody)).toEqual({ message: genericMessage });
    expect(failedBody).not.toContain("token");
    expect(failedBody).not.toContain("mail state");
  });

  it("uses hashed shared counters without exposing identities and keeps status-link limits separate", async () => {
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
      expect((await target.handle(request({ email: `customer-${count}@example.com` }, ip))).status).toBe(200);
    }
    const blocked = await second.handle(request({ email, }, ip));
    const blockedBody = await blocked.text();
    expect(blocked.status).toBe(429);
    expect(blockedBody).not.toContain(email);
    expect(blockedBody).not.toContain(ip);
    expect(storedKeys).not.toContain(email);
    expect(storedKeys).not.toContain(ip);
    expect(storedKeys.every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
    expect(first.requestClientWorkspaceLink).toHaveBeenCalledTimes(5);
    expect(second.requestClientWorkspaceLink).toHaveBeenCalledTimes(5);

    const statusHandler = createStatusLinkHandler({
      requestIdentity: () => ip,
      consumeRateLimit,
      requestStatusLink: vi.fn<(input: { email: string; reference: string }) => Promise<void>>().mockResolvedValue(undefined)
    });
    const statusResponse = await statusHandler(new NextRequest("http://localhost/api/appointments/status-link", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, reference: "ABC-123" })
    }));
    expect(statusResponse.status).toBe(200);
  });
});
