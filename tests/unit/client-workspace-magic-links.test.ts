import { describe, expect, it } from "vitest";
import { clientWorkspaceExpiration, normalizeClientWorkspaceEmail } from "@/lib/server/client-workspace-magic-links";

describe("Client Workspace magic links", () => {
  const appointment = { preferredDate: "2026-08-01", preferredTime: "10:00", status: "confirmed" as const, serviceDurationMinutesSnapshot: 60 };
  it("uses appointment end plus thirty days and normalizes request email", () => {
    expect(new Date(clientWorkspaceExpiration(appointment)).getTime()).toBe(new Date("2026-08-01T10:00:00").getTime() + 60 * 60_000 + 30 * 24 * 60 * 60_000);
    expect(normalizeClientWorkspaceEmail(" Customer@Example.com ")).toBe("customer@example.com");
  });
  it("uses a seven-day cancellation window", () => {
    expect(clientWorkspaceExpiration({ ...appointment, status: "cancelled" }, new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08-08T00:00:00.000Z");
  });
});
