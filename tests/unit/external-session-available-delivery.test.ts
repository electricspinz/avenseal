import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/server/email", () => ({ sendEmailIfConfigured: vi.fn() }));

import { sendEmailIfConfigured } from "@/lib/server/email";
import { enqueueAndProcessEmail } from "@/lib/server/communications";

type Scenario = "eligible" | "payment_ineligible" | "appointment_cancelled" | "appointment_declined" | "session_hidden" | "session_removed" | "launch_missing" | "launch_http" | "recipient_changed" | "recipient_unavailable" | "workspace_unavailable" | "tenant_mismatch" | "appointment_mismatch";
type Update = { table: string; values: Record<string, unknown> };

const baseMessage = { id: "message-1", organization_id: "org-1", appointment_request_id: "appointment-1", customer_id: "customer-1", message_type: "external_session_available", recipient_email: "customer@example.com", subject: "Your BlueNotary session is ready", body_html: "<p>Safe body</p>", provider: "gmail_smtp", status: "queued", attempt_count: 0, next_attempt_at: "2026-07-31T10:00:00.000Z", processing_started_at: null };

function createSupabase(scenario: Scenario) {
  const updates: Update[] = [];
  const audits: Record<string, unknown>[] = [];
  let messageState: Record<string, unknown> | null = null;
  const appointment = { id: "appointment-1", organization_id: scenario === "tenant_mismatch" ? "org-2" : "org-1", status: scenario === "appointment_cancelled" ? "cancelled" : scenario === "appointment_declined" ? "declined" : "confirmed", customer_id: scenario === "appointment_mismatch" ? "customer-2" : "customer-1", customers: { email: scenario === "recipient_changed" ? "new@example.com" : scenario === "recipient_unavailable" ? null : "customer@example.com" } };
  const session = scenario === "session_removed" ? null : { organization_id: "org-1", appointment_request_id: "appointment-1", provider: "BlueNotary", session_name: "Handoff", launch_url: scenario === "launch_missing" ? null : scenario === "launch_http" ? "http://provider.example/session" : "https://provider.example/session", reference_number: "do-not-log", status: scenario === "session_hidden" ? "completed" : "scheduled", notes: "private", created_at: "2026-07-31T09:00:00.000Z", updated_at: "2026-07-31T09:00:00.000Z", metadata: {} };
  const response = (table: string, operation: "select" | "insert" | "update", values?: Record<string, unknown>) => {
    if (table === "communication_messages" && operation === "select") return { data: messageState, error: null };
    if (table === "communication_messages" && operation === "insert") { messageState = { ...baseMessage }; return { data: messageState, error: null }; }
    if (table === "communication_messages" && operation === "update") {
      updates.push({ table, values: values ?? {} });
      if (messageState?.status !== "queued" && values?.status === "processing") return { data: null, error: null };
      messageState = { ...messageState, ...values };
      return { data: messageState, error: null };
    }
    if (table === "appointment_requests") return { data: appointment, error: null };
    if (table === "external_sessions") return { data: session, error: null };
    if (table === "appointment_payments") return { data: { status: scenario === "payment_ineligible" ? "payment_link_created" : "paid" }, error: null };
    if (table === "appointment_access_tokens") return { data: scenario === "workspace_unavailable" ? null : { id: "token-record" }, error: null };
    if (table === "audit_logs") { audits.push(values ?? {}); return { data: null, error: null }; }
    return { data: null, error: null };
  };
  const client = {
    from(table: string) {
      let operation: "select" | "insert" | "update" = "select";
      let values: Record<string, unknown> | undefined;
      const chain = {
        select() { return chain; },
        insert(input: Record<string, unknown>) { operation = "insert"; values = input; return chain; },
        update(input: Record<string, unknown>) { operation = "update"; values = input; return chain; },
        eq() { return chain; }, in() { return chain; }, is() { return chain; }, gt() { return chain; }, lte() { return chain; }, order() { return chain; }, limit() { return chain; },
        maybeSingle: async () => response(table, operation, values),
        single: async () => response(table, operation, values),
        then<TResult1 = { data: unknown; error: null }, TResult2 = never>(onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(response(table, operation, values)).then(onfulfilled, onrejected); }
      };
      return chain;
    }
  } as unknown as SupabaseClient;
  return { client, updates, audits };
}

async function deliver(scenario: Scenario) {
  const state = createSupabase(scenario);
  const result = await enqueueAndProcessEmail(state.client, { organizationId: "org-1", appointmentId: "appointment-1", customerId: "customer-1", type: "external_session_available", recipient: "customer@example.com", subject: "Your BlueNotary session is ready", html: "<p>Safe body</p>", idempotencyDiscriminator: "visibility-cycle" });
  return { ...state, result };
}

describe("external session available pre-send eligibility", () => {
  beforeEach(() => {
    vi.mocked(sendEmailIfConfigured).mockReset();
    vi.mocked(sendEmailIfConfigured).mockResolvedValue({ status: "sent", providerMessageId: "smtp-1", error: null });
  });

  it("rechecks trusted state, then delivers eligible handoffs once with normal attempt accounting", async () => {
    const { result, updates, audits } = await deliver("eligible");
    expect(result).toEqual({ status: "sent", providerMessageId: "smtp-1", error: null });
    expect(sendEmailIfConfigured).toHaveBeenCalledTimes(1);
    expect(updates.map(({ values }) => values)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "processing" }),
      expect.objectContaining({ attempt_count: 1 }),
      expect.objectContaining({ status: "sent", provider_message_id: "smtp-1" })
    ]));
    expect(audits).toEqual([]);
  });

  it.each([
    ["payment becomes unpaid", "payment_ineligible", "payment_ineligible"],
    ["appointment becomes cancelled", "appointment_cancelled", "appointment_ineligible"],
    ["appointment becomes declined", "appointment_declined", "appointment_ineligible"],
    ["session becomes hidden", "session_hidden", "session_ineligible"],
    ["session is removed", "session_removed", "session_ineligible"],
    ["launch URL is missing", "launch_missing", "launch_unavailable"],
    ["launch URL is HTTP", "launch_http", "launch_unavailable"],
    ["customer email changes", "recipient_changed", "recipient_changed"],
    ["customer email is unavailable", "recipient_unavailable", "recipient_unavailable"],
    ["workspace access is unavailable", "workspace_unavailable", "workspace_unavailable"],
    ["appointment tenant does not match", "tenant_mismatch", "tenant_mismatch"],
    ["appointment customer does not match", "appointment_mismatch", "appointment_mismatch"]
  ] as const)("suppresses when %s without SMTP or retry consumption", async (_label, scenario, reason) => {
    const { result, updates, audits } = await deliver(scenario);
    expect(result).toMatchObject({ status: "skipped", error: `External session delivery suppressed: ${reason}.` });
    expect(sendEmailIfConfigured).not.toHaveBeenCalled();
    expect(updates.map(({ values }) => values)).toEqual(expect.arrayContaining([expect.objectContaining({ status: "cancelled", next_attempt_at: null, last_error: `External session delivery suppressed: ${reason}.` })]));
    expect(updates.some(({ values }) => "attempt_count" in values)).toBe(false);
    expect(audits).toEqual([{ organization_id: "org-1", action: "external_session.communication_suppressed", entity_type: "appointment_request", entity_id: "appointment-1", metadata: { communicationType: "external_session_available", deliveryStatus: "cancelled", reason } }]);
    expect(JSON.stringify(audits)).not.toContain("provider.example");
    expect(JSON.stringify(audits)).not.toContain("do-not-log");
  });

  it("does not re-claim or duplicate the suppression audit after a terminal decision", async () => {
    const state = createSupabase("payment_ineligible");
    const input = { organizationId: "org-1", appointmentId: "appointment-1", customerId: "customer-1", type: "external_session_available" as const, recipient: "customer@example.com", subject: "Your BlueNotary session is ready", html: "<p>Safe body</p>", idempotencyDiscriminator: "visibility-cycle" };
    await expect(enqueueAndProcessEmail(state.client, input)).resolves.toMatchObject({ status: "skipped" });
    await expect(enqueueAndProcessEmail(state.client, input)).resolves.toMatchObject({ status: "skipped", error: "Communication is already being processed." });
    expect(sendEmailIfConfigured).not.toHaveBeenCalled();
    expect(state.audits).toHaveLength(1);
    expect(state.updates.filter(({ values }) => values.status === "cancelled")).toHaveLength(1);
  });

  it("keeps genuine SMTP failures on the existing retry path after eligibility passes", async () => {
    vi.mocked(sendEmailIfConfigured).mockResolvedValue({ status: "failed", providerMessageId: null, error: "SMTP unavailable" });
    const { result, updates } = await deliver("eligible");
    expect(result).toMatchObject({ status: "failed", error: "SMTP unavailable" });
    expect(sendEmailIfConfigured).toHaveBeenCalledTimes(1);
    expect(updates.map(({ values }) => values)).toEqual(expect.arrayContaining([expect.objectContaining({ attempt_count: 1 }), expect.objectContaining({ status: "failed" })]));
    expect(updates.some(({ values }) => typeof values.next_attempt_at === "string")).toBe(true);
  });
});
