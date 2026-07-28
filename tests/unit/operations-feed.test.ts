import { describe, expect, it } from "vitest";
import { loadOperationsFeed, type OperationsFeedRepository } from "@/lib/server/operations-feed";
import type { AdminCommunication, AppointmentRequest } from "@/lib/types";

type Integrations = Awaited<ReturnType<OperationsFeedRepository["listIntegrations"]>>;

function appointment(id: string, createdAt: string, updatedAt = createdAt): AppointmentRequest {
  return { id, organizationId: "org", customerId: "customer", serviceId: null, serviceNameSnapshot: null, serviceDurationMinutesSnapshot: null, servicePriceCentsSnapshot: null, serviceCurrencySnapshot: null, status: "awaiting_review", customer: { id: "customer", organizationId: "org", fullName: `Customer ${id}`, email: "customer@example.com", mobilePhone: "555-0100", createdAt, updatedAt }, documentCategory: "other", documentCount: 1, signerCount: 1, estimatedNotarizations: null, notarizationsNotSure: false, hasWitnessLines: null, witnessesAvailable: null, signerLocation: "Florida", allSignersHaveGovernmentId: true, preferredDate: "2026-07-28", preferredTime: "10:00", urgency: "specific_date", administrativeNotes: null, createdAt, updatedAt };
}

function communication(id: string, status: AdminCommunication["status"], timestamp: string): AdminCommunication {
  return { id, source: "message", messageId: id, appointmentId: "appointment-1", customerId: "customer", customerName: "Customer One", messageType: "booking_confirmation", recipientEmail: "customer@example.com", subject: "Confirmation", bodyHtml: null, status, scheduledFor: status === "scheduled" ? timestamp : null, queuedAt: status === "queued" ? timestamp : null, sentAt: status === "sent" ? timestamp : null, attemptCount: 1, lastAttemptedAt: status === "failed" ? timestamp : null, lastError: status === "failed" ? "Provider error" : null, providerMessageId: null, createdAt: timestamp, updatedAt: timestamp };
}

function source(overrides: Partial<{ appointments: Promise<AppointmentRequest[]>; communications: Promise<{ records: AdminCommunication[]; currentPage: number; totalPages: number; totalRecords: number }>; integrations: Promise<Integrations> }> = {}): OperationsFeedRepository {
  return {
    listAppointments: () => overrides.appointments ?? Promise.resolve([]),
    listAdminCommunications: () => overrides.communications ?? Promise.resolve({ records: [], currentPage: 1, totalPages: 1, totalRecords: 0 }),
    listIntegrations: () => overrides.integrations ?? Promise.resolve([])
  };
}

describe("Operations Feed", () => {
  it("sorts events newest first and uses IDs to stabilize identical timestamps", async () => {
    const feed = await loadOperationsFeed(source({
      appointments: Promise.resolve([appointment("b", "2026-07-27T10:00:00.000Z"), appointment("a", "2026-07-27T10:00:00.000Z")]),
      communications: Promise.resolve({ records: [communication("sent", "sent", "2026-07-28T10:00:00.000Z")], currentPage: 1, totalPages: 1, totalRecords: 1 })
    }));

    expect(feed.items.map((item) => item.id)).toEqual(["communication-sent:sent:2026-07-28T10:00:00.000Z", "appointment-created:a", "appointment-created:b"]);
  });

  it("places invalid timestamps after valid timestamps", async () => {
    const feed = await loadOperationsFeed(source({ appointments: Promise.resolve([appointment("invalid", "not-a-timestamp"), appointment("valid", "2026-07-28T10:00:00.000Z")]) }));

    expect(feed.items.map((item) => item.id)).toEqual(["appointment-created:valid", "appointment-created:invalid"]);
  });

  it("maps supported appointment and communication events with evidence-backed severities and links", async () => {
    const feed = await loadOperationsFeed(source({
      appointments: Promise.resolve([appointment("updated", "2026-07-25T10:00:00.000Z", "2026-07-26T10:00:00.000Z")]),
      communications: Promise.resolve({ records: [communication("scheduled", "scheduled", "2026-07-27T10:00:00.000Z"), communication("queued", "queued", "2026-07-27T11:00:00.000Z"), communication("sent", "sent", "2026-07-27T12:00:00.000Z"), communication("failed", "failed", "2026-07-27T13:00:00.000Z")], currentPage: 1, totalPages: 1, totalRecords: 4 })
    }));

    expect(feed.items.map((item) => [item.eventType, item.severity])).toEqual(expect.arrayContaining([
      ["appointment_created", "info"], ["appointment_updated", "info"], ["communication_scheduled", "info"], ["communication_queued", "info"], ["communication_sent", "success"], ["communication_failed", "error"]
    ]));
    expect(feed.items.find((item) => item.eventType === "communication_failed")?.destinationUrl).toBe("/admin/communications/failed");
    expect(feed.items.find((item) => item.eventType === "appointment_updated")?.destinationUrl).toBe("/admin/appointments/updated");
  });

  it("maps a timestamped Google Calendar connection", async () => {
    const integrations: Integrations = [{ provider: "google_calendar", status: "connected", accountLabel: null, lastConnectedAt: "2026-07-28T10:00:00.000Z", lastSyncedAt: null, lastError: null }];
    const feed = await loadOperationsFeed(source({ integrations: Promise.resolve(integrations) }));

    expect(feed.items[0]).toMatchObject({ eventType: "calendar_integration_connected", severity: "success", destinationUrl: "/admin/settings/integrations" });
  });

  it("returns an empty feed when successful sources contain no activity", async () => {
    await expect(loadOperationsFeed(source())).resolves.toEqual({ items: [], unavailableSources: [] });
  });

  it("keeps successful sources visible when another source fails", async () => {
    const feed = await loadOperationsFeed(source({
      appointments: Promise.resolve([appointment("available", "2026-07-28T10:00:00.000Z")]),
      communications: Promise.reject(new Error("communications unavailable"))
    }));

    expect(feed.items.map((item) => item.id)).toEqual(["appointment-created:available"]);
    expect(feed.unavailableSources).toEqual(["Communications"]);
  });
});
