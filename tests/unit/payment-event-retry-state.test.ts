import { beforeEach, describe, expect, it, vi } from "vitest";

type PaymentEvent = { id: string; provider_event_id: string; processing_status: string; payment_id?: string };

const state = vi.hoisted(() => ({
  events: [] as PaymentEvent[],
  operations: [] as string[],
  failAudit: false,
  paymentUpdates: 0,
  reservationUpdates: 0,
  auditWrites: 0
}));

function resetState(existingStatus?: string) {
  state.events = existingStatus ? [{ id: "event-1", provider_event_id: "evt-1", processing_status: existingStatus, payment_id: "payment-1" }] : [];
  state.operations = [];
  state.failAudit = false;
  state.paymentUpdates = 0;
  state.reservationUpdates = 0;
  state.auditWrites = 0;
}

function chain(table: string, mutation?: Record<string, unknown>) {
  const filters: Record<string, unknown> = {};
  const apply = () => {
    if (!mutation) return;
    if (table === "payment_events") {
      const event = state.events.find((item) => item.provider_event_id === filters.provider_event_id || item.id === filters.id);
      if (event && mutation.processing_status) {
        event.processing_status = String(mutation.processing_status);
        state.operations.push(`event:${event.processing_status}`);
      }
    }
    if (table === "appointment_payments") state.paymentUpdates += 1;
    if (table === "slot_reservations") state.reservationUpdates += 1;
  };
  const result = {
    eq(key: string, value: unknown) { filters[key] = value; apply(); return result; },
    select() { return result; },
    maybeSingle: async () => {
      if (table === "payment_events") return { data: state.events.find((item) => item.provider_event_id === filters.provider_event_id) ?? null, error: null };
      if (table === "appointment_payments") return { data: { id: "payment-1", organization_id: "org-1", appointment_request_id: "appointment-1", stripe_payment_intent_id: "pi-1" }, error: null };
      return { data: null, error: null };
    },
    single: async () => ({ data: { id: "appointment-1", organization_id: "org-1", customer_id: "customer-1", service_id: "service-1", service_name_snapshot: "Service", service_duration_minutes_snapshot: 30, service_price_cents_snapshot: 2500, service_currency_snapshot: "usd", status: "confirmed", customers: { id: "customer-1", organization_id: "org-1", full_name: "Customer", email: "customer@example.com", mobile_phone: "", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }, document_category: "other", document_count: 1, signer_count: 1, estimated_notarizations: null, notarizations_not_sure: false, has_witness_lines: null, witnesses_available: null, signer_location: "Florida", all_signers_have_government_id: true, preferred_date: "2026-08-01", preferred_time: "10:00", urgency: "standard", administrative_notes: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }, error: null }),
    update(values: Record<string, unknown>) { return chain(table, values); },
    insert: async (values: Record<string, unknown>) => {
      if (table === "payment_events") {
        state.events.push({ id: "event-1", provider_event_id: String(values.provider_event_id), processing_status: String(values.processing_status), payment_id: String(values.payment_id ?? "") });
        state.operations.push(`event:${values.processing_status}`);
      }
      if (table === "audit_logs") {
        state.auditWrites += 1;
        state.operations.push("audit");
        if (state.failAudit) throw new Error("audit unavailable");
      }
      return { data: null, error: null };
    }
  };
  return result;
}

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  hasSupabaseServiceConfig: vi.fn(),
  synchronizeAppointmentCalendar: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin, hasSupabaseServiceConfig: mocks.hasSupabaseServiceConfig }));
vi.mock("@/lib/server/google-calendar-sync", () => ({ synchronizeAppointmentCalendar: mocks.synchronizeAppointmentCalendar }));

import { repository } from "@/lib/server/repository";

describe("payment event retry state", () => {
  beforeEach(() => {
    resetState();
    mocks.hasSupabaseServiceConfig.mockReturnValue(true);
    mocks.getSupabaseAdmin.mockReturnValue({ from: (table: string) => chain(table) });
    mocks.synchronizeAppointmentCalendar.mockResolvedValue(null);
  });

  it("moves a new event from received to processed after audit completion", async () => {
    await expect(repository.confirmPaymentFromStripe({ providerEventId: "evt-1", eventType: "checkout.session.completed", checkoutSessionId: "cs-1", paymentIntentId: "pi-1" })).resolves.toEqual({ confirmed: true });
    expect(state.events[0]?.processing_status).toBe("processed");
    expect(state.operations).toEqual(expect.arrayContaining(["event:received", "audit", "event:processed"]));
    expect(state.operations.indexOf("event:received")).toBeLessThan(state.operations.indexOf("audit"));
    expect(state.operations.indexOf("audit")).toBeLessThan(state.operations.indexOf("event:processed"));
  });

  it("marks a received event failed when a downstream audit fails", async () => {
    state.failAudit = true;
    await expect(repository.confirmPaymentFromStripe({ providerEventId: "evt-1", eventType: "checkout.session.completed", checkoutSessionId: "cs-1" })).rejects.toThrow("audit unavailable");
    expect(state.events[0]?.processing_status).toBe("failed");
    expect(state.operations).toEqual(expect.arrayContaining(["event:received", "audit", "event:failed"]));
  });

  it("retries a failed event and preserves payment ownership", async () => {
    resetState("failed");
    await expect(repository.confirmPaymentFromStripe({ providerEventId: "evt-1", eventType: "checkout.session.completed", checkoutSessionId: "cs-1" })).resolves.toEqual({ confirmed: true });
    expect(state.events[0]).toMatchObject({ payment_id: "payment-1", processing_status: "processed" });
    expect(state.operations).toEqual(expect.arrayContaining(["event:received", "audit", "event:processed"]));
  });

  it.each(["processed", "received", "ignored"])("acknowledges a %s event without rerunning side effects", async (status) => {
    resetState(status);
    await expect(repository.confirmPaymentFromStripe({ providerEventId: "evt-1", eventType: "checkout.session.completed", checkoutSessionId: "cs-1" })).resolves.toEqual({ duplicate: true });
    expect(state.paymentUpdates).toBe(0);
    expect(state.reservationUpdates).toBe(0);
    expect(state.auditWrites).toBe(0);
    expect(state.events[0]?.processing_status).toBe(status);
  });
});
