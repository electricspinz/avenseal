import { describe, expect, it } from "vitest";
import { communicationIdempotencyKey, renderEmailTemplate } from "@/lib/server/communications";

describe("communications templates and idempotency", () => {
  it("creates deterministic tenant-scoped idempotency keys", () => {
    const input = { organizationId: "org-a", appointmentId: "appointment-a", type: "booking_confirmation" as const, recipient: "Customer@Example.com" };
    expect(communicationIdempotencyKey(input)).toBe(communicationIdempotencyKey({ ...input, recipient: "customer@example.com" }));
    expect(communicationIdempotencyKey(input)).not.toBe(communicationIdempotencyKey({ ...input, organizationId: "org-b" }));
  });

  it("escapes user-controlled template content", () => {
    const html = renderEmailTemplate({ greetingName: "<script>", body: "<b>Unsafe</b>", actionLabel: "Open", actionUrl: "https://example.com/?q=<unsafe>", footer: "<footer>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Unsafe&lt;/b&gt;");
  });
});
