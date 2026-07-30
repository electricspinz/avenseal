import { describe, expect, it } from "vitest";
import { externalSessionInputSchema } from "@/lib/server/external-sessions";
import { repository } from "@/lib/server/repository";

const input = { provider: "BlueNotary", sessionName: "Avery's notarization", launchUrl: "https://example.test/session", referenceNumber: "REF-1", status: "scheduled" as const, notes: "Manual session" };

describe("External Session Management", () => {
  it("creates, edits, and removes an appointment-scoped manual session", async () => {
    const created = await repository.saveExternalSession("org-a", "appointment-a", input);
    const updated = await repository.saveExternalSession("org-a", "appointment-a", { ...input, provider: "Proof", status: "ready" });
    expect(created.createdAt).toBe(updated.createdAt);
    expect(updated).toMatchObject({ provider: "Proof", status: "ready" });
    expect(await repository.removeExternalSession("org-a", "appointment-a")).toBe(true);
    expect(await repository.getExternalSession("org-a", "appointment-a")).toBeNull();
  });

  it("validates HTTP launch URLs and keeps sessions tenant-isolated", async () => {
    expect(externalSessionInputSchema.safeParse({ ...input, launchUrl: "javascript:alert(1)" }).success).toBe(false);
    await repository.saveExternalSession("org-a", "appointment-shared", input);
    expect(await repository.getExternalSession("org-b", "appointment-shared")).toBeNull();
  });
});
