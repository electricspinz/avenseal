import { describe, expect, it, vi } from "vitest";
import { readAdminSession, signAdminSession } from "@/lib/server/admin-auth";

describe("admin session validation", () => {
  it("accepts a valid unexpired signed session", () => {
    expect(readAdminSession(signAdminSession("admin@example.com", "admin-1"))).toMatchObject({ email: "admin@example.com", userId: "admin-1" });
  });

  it("rejects expired, missing, malformed, future, inverted, and invalid signed payloads", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const expired = signAdminSession("admin@example.com", "admin-1");
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    expect(readAdminSession(expired)).toBeNull();
    const [payload, signature] = signAdminSession("admin@example.com", "admin-1").split(".");
    const mutate = (value: Record<string, unknown>) => `${Buffer.from(JSON.stringify(value)).toString("base64url")}.${signature}`;
    expect(readAdminSession(mutate({ email: "admin@example.com", issuedAt: Date.now() }))).toBeNull();
    expect(readAdminSession(mutate({ email: "admin@example.com", issuedAt: "bad", expiresAt: Date.now() + 1 }))).toBeNull();
    expect(readAdminSession(mutate({ email: "admin@example.com", issuedAt: Date.now() + 6 * 60 * 1000, expiresAt: Date.now() + 7 * 60 * 1000 }))).toBeNull();
    expect(readAdminSession(mutate({ email: "admin@example.com", issuedAt: Date.now() + 1, expiresAt: Date.now() }))).toBeNull();
    expect(readAdminSession(`${signAdminSession("admin@example.com", "admin-1")}tampered`)).toBeNull();
    expect(payload).toBeTruthy();
    vi.useRealTimers();
  });
});
