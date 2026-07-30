import { describe, expect, it } from "vitest";
import { BlueNotaryProvider, type BlueNotaryTransport } from "@/lib/server/connected-services/bluenotary/provider";

class FakeTransport implements BlueNotaryTransport {
  calls = 0;
  async request() { this.calls++; return { status: 200, body: {} }; }
}

const context = { organizationId: "organization-a" };

describe("BlueNotaryProvider verified-contract scaffold", () => {
  it("advertises only capabilities verified by public BlueNotary information", () => {
    const provider = new BlueNotaryProvider({ configured: false, transport: new FakeTransport() });
    expect(provider.capabilities).toEqual(["ron.create_session", "ron.upload_document", "ron.invite_participant", "ron.session_status", "ron.completed_documents", "ron.webhook_events", "ron.signed_webhook_payloads"]);
    expect(provider.capabilities).not.toContain("ron.cancel_session");
    expect(provider.capabilities).not.toContain("ron.join_url");
    expect(provider.capabilities).not.toContain("ron.recording_metadata");
  });

  it("does not invoke transport before an official contract fixture is configured", async () => {
    const transport = new FakeTransport();
    const provider = new BlueNotaryProvider({ configured: true, transport });
    await expect(provider.createSession(context, { appointmentReference: "AVEN-1", scheduledAt: "2026-08-01T14:00:00.000Z", timezone: "America/New_York", participantDisplayName: "Avery Doe" })).resolves.toMatchObject({ ok: false, error: { code: "configuration", retryable: false } });
    await expect(provider.retrieveCompletionStatus(context, "session-1")).resolves.toMatchObject({ ok: false, error: { code: "configuration" } });
    await expect(provider.retrieveSignedDocumentMetadata(context, "session-1")).resolves.toMatchObject({ ok: false, error: { code: "configuration" } });
    expect(transport.calls).toBe(0);
  });

  it("fails unverified operations closed as unsupported capabilities", async () => {
    const provider = new BlueNotaryProvider({ configured: true, transport: new FakeTransport() });
    await expect(provider.cancelSession(context, "session-1")).resolves.toMatchObject({ ok: false, error: { code: "unsupported_capability", retryable: false } });
    await expect(provider.retrieveJoinUrl(context, "session-1")).resolves.toMatchObject({ ok: false, error: { code: "unsupported_capability" } });
    await expect(provider.retrieveRecordingMetadata(context, "session-1")).resolves.toMatchObject({ ok: false, error: { code: "unsupported_capability" } });
  });

  it("keeps the fixture seam provider-specific and does not leak raw responses", async () => {
    const transport = new FakeTransport();
    const provider = new BlueNotaryProvider({ configured: true, transport, contract: { version: "official-contract-pending" } });
    const status = await provider.getStatus(context);
    expect(status).toMatchObject({ status: "unknown" });
    expect(JSON.stringify(status)).not.toContain("organization-a");
  });
});
