import { describe, expect, it } from "vitest";
import { externalSessionInputSchema, getExternalSession, removeExternalSession, saveExternalSession } from "@/lib/server/external-sessions";

const input = { provider: "BlueNotary", sessionName: "Avery's notarization", launchUrl: "https://example.test/session", referenceNumber: "REF-1", status: "scheduled" as const, notes: "Manual session" };

describe("External Session Management", () => {
  it("creates, edits, and removes an appointment-scoped manual session", () => {
    const created = saveExternalSession("org-a", "appointment-a", input, new Date("2026-07-30T10:00:00Z"));
    const updated = saveExternalSession("org-a", "appointment-a", { ...input, provider: "Proof", status: "ready" }, new Date("2026-07-30T11:00:00Z"));
    expect(created.createdAt).toBe(updated.createdAt);
    expect(updated).toMatchObject({ provider: "Proof", status: "ready" });
    expect(removeExternalSession("org-a", "appointment-a")).toBe(true);
    expect(getExternalSession("org-a", "appointment-a")).toBeNull();
  });

  it("validates HTTP launch URLs and keeps sessions tenant-isolated", () => {
    expect(externalSessionInputSchema.safeParse({ ...input, launchUrl: "javascript:alert(1)" }).success).toBe(false);
    saveExternalSession("org-a", "appointment-shared", input);
    expect(getExternalSession("org-b", "appointment-shared")).toBeNull();
  });
});
