import { describe, expect, it } from "vitest";
import { renderEmailSubject } from "@/lib/milestone3/email";
import { communicationIdempotencyKey, renderEmailTemplate } from "@/lib/server/communications";

describe("external session available communication", () => {
  it("uses a stable visibility-cycle key and a new key for a later cycle", () => {
    const input = { organizationId: "org", appointmentId: "appointment", type: "external_session_available" as const, recipient: "customer@example.com", idempotencyDiscriminator: "2026-07-31T10:00:00.000Z" };
    expect(communicationIdempotencyKey(input)).toBe(communicationIdempotencyKey(input));
    expect(communicationIdempotencyKey(input)).not.toBe(communicationIdempotencyKey({ ...input, idempotencyDiscriminator: "2026-07-31T11:00:00.000Z" }));
  });

  it("renders the safe Avenseal workspace handoff copy", () => {
    const workspaceUrl = "https://avenseal.example/appointments/access/opaque-token";
    const html = renderEmailTemplate({ greetingName: "Avery <Doe>", body: "Your online notarization session is ready. Avenseal coordinates scheduling, payment, preparation, and Client Workspace access. BlueNotary performs identity verification and the live online notarization.", actionLabel: "Open Your Appointment", actionUrl: workspaceUrl, footer: "Open your appointment through Avenseal to continue securely." });
    expect(renderEmailSubject("external_session_available")).toBe("Your BlueNotary session is ready");
    expect(html).toContain("Your online notarization session is ready.");
    expect(html).toContain("Open Your Appointment");
    expect(html).toContain(workspaceUrl);
    expect(html).toContain("Avery &lt;Doe&gt;");
    expect(html).not.toContain("https://bluenotary.example");
    expect(html).not.toContain("reference_number");
  });
});
