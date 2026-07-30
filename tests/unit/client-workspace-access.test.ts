import { describe, expect, it } from "vitest";
import { clientWorkspaceTokenHashesEqual, generateClientWorkspaceToken, hashClientWorkspaceToken, isClientWorkspaceTokenActive } from "@/lib/server/client-workspace-access";
import { repository } from "@/lib/server/repository";

describe("Client Workspace Access", () => {
  it("generates opaque tokens, hashes them, and compares hashes in constant time", () => {
    const token = generateClientWorkspaceToken();
    expect(token.length).toBeGreaterThan(30);
    expect(clientWorkspaceTokenHashesEqual(hashClientWorkspaceToken(token), hashClientWorkspaceToken(token))).toBe(true);
    expect(clientWorkspaceTokenHashesEqual(hashClientWorkspaceToken(token), hashClientWorkspaceToken("different-token"))).toBe(false);
  });

  it("requires tokens to be unrevoked and unexpired", () => {
    const base = { identifier: "id", organizationId: "org", appointmentId: "appointment", issuedAt: "2026-07-30T10:00:00.000Z", lastAccessedAt: null, purpose: "client_workspace" as const, createdBy: null };
    expect(isClientWorkspaceTokenActive({ ...base, expiresAt: "2026-07-30T11:00:00.000Z", revokedAt: null }, new Date("2026-07-30T10:30:00.000Z"))).toBe(true);
    expect(isClientWorkspaceTokenActive({ ...base, expiresAt: "2026-07-30T09:00:00.000Z", revokedAt: null }, new Date("2026-07-30T10:30:00.000Z"))).toBe(false);
    expect(isClientWorkspaceTokenActive({ ...base, expiresAt: "2026-07-30T11:00:00.000Z", revokedAt: "2026-07-30T10:15:00.000Z" }, new Date("2026-07-30T10:30:00.000Z"))).toBe(false);
  });

  it("issues, validates, and revokes durable-boundary tokens without exposing hashes", async () => {
    const issued = await repository.issueClientWorkspaceToken({ organizationId: "org-token", appointmentId: "appointment-token", expiresAt: "2030-01-01T00:00:00.000Z" });
    expect(JSON.stringify(issued.record)).not.toContain(issued.token);
    await expect(repository.validateClientWorkspaceToken(issued.token, new Date("2029-01-01T00:00:00.000Z"))).resolves.toMatchObject({ identifier: issued.record.identifier, organizationId: "org-token" });
    expect(await repository.revokeClientWorkspaceToken("wrong-org", issued.record.identifier)).toBe(false);
    expect(await repository.revokeClientWorkspaceToken("org-token", issued.record.identifier)).toBe(true);
    await expect(repository.validateClientWorkspaceToken(issued.token, new Date("2029-01-01T00:00:00.000Z"))).resolves.toBeNull();
  });
});
