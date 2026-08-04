import { describe, expect, it } from "vitest";
import { appointmentMetricValues, appointmentsForDate, loadMissionControlViewModel } from "@/lib/server/mission-control";
import type { AdminCommunicationMetrics, AppointmentRequest, OrganizationSettings } from "@/lib/types";

const settings: OrganizationSettings = {
  business: { organizationId: "org", businessName: "Avenseal", supportEmail: "hello@example.com", supportPhone: "555-0100", timezone: "America/New_York", pricingHeadline: "", pricingNote: "", privacyPolicyVersion: "1", termsVersion: "1" },
  rules: { defaultDurationMinutes: 30, bufferBeforeMinutes: null, bufferAfterMinutes: null, minimumBookingNoticeMinutes: null, maximumAdvanceBookingDays: null, sameDayEnabled: true, maximumAppointmentsPerDay: null, customerReschedulingEnabled: null, customerCancellationEnabled: null, emergencyAppointmentEnabled: null, automaticApprovalEnabled: false },
  intervals: [],
  exceptions: [],
  services: [],
  communications: { senderName: "Avenseal", replyToEmail: null, supportPhone: null, emailRemindersEnabled: true, smsRemindersEnabled: false, reviewRequestsEnabled: false, confirmationMessagingEnabled: true, reminder24hMinutesBefore: 1440, reminder2hMinutesBefore: 120, followupMinutesAfter: 1440, reviewRequestMinutesAfter: 2880 },
  concierge: { conciergeEnabled: true, displayName: "Ava", greeting: "Hello", tonePreset: "professional_and_warm", escalationMessage: "", humanSupportDestination: null, bookingAssistanceEnabled: true, faqAssistanceEnabled: true }
};

const metrics: AdminCommunicationMetrics = { scheduled: 2, readyToQueue: 0, queued: 1, sent: 4, failed: 0 };

function appointment(id: string, date: string, time: string, status: AppointmentRequest["status"] = "awaiting_review"): AppointmentRequest {
  return { id, organizationId: "org", customerId: "customer", serviceId: "service", serviceNameSnapshot: "Remote notarization", serviceDurationMinutesSnapshot: 30, servicePriceCentsSnapshot: null, serviceCurrencySnapshot: "USD", status, customer: { id: "customer", organizationId: "org", fullName: id, email: `${id}@example.com`, mobilePhone: "555-0100", createdAt: "2026-01-01", updatedAt: "2026-01-01" }, documentCategory: "other", documentCount: 1, signerCount: 1, estimatedNotarizations: null, notarizationsNotSure: false, hasWitnessLines: null, witnessesAvailable: null, signerLocation: "Florida", allSignersHaveGovernmentId: true, preferredDate: date, preferredTime: time, urgency: "specific_date", administrativeNotes: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}

function source(overrides: Partial<{ appointments: Promise<AppointmentRequest[]>; settings: Promise<OrganizationSettings>; integrations: Promise<Array<{ provider: string; status: string; accountLabel: string | null; lastConnectedAt: string | null; lastSyncedAt: string | null; lastError: string | null }>>; metrics: Promise<AdminCommunicationMetrics> }> = {}) {
  return {
    listAppointments: () => overrides.appointments ?? Promise.resolve([]),
    getSettings: () => overrides.settings ?? Promise.resolve(settings),
    listIntegrations: () => overrides.integrations ?? Promise.resolve([{ provider: "google_calendar", status: "connected", accountLabel: null, lastConnectedAt: "2026-07-28T12:00:00.000Z", lastSyncedAt: null, lastError: null }]),
    getCommunicationMetrics: () => overrides.metrics ?? Promise.resolve(metrics)
  };
}

describe("Mission Control view model", () => {
  it("uses the organization timezone to calculate today across a DST boundary", async () => {
    const viewModel = await loadMissionControlViewModel(source({
      appointments: Promise.resolve([appointment("today", "2026-11-01", "01:30"), appointment("tomorrow", "2026-11-02", "09:00")])
    }), new Date("2026-11-01T05:30:00.000Z"));

    expect(viewModel.dailyBrief.appointmentsToday).toBe(1);
    expect(viewModel.schedule.appointments?.map((item: AppointmentRequest) => item.id)).toEqual(["today"]);
  });

  it("marks date-derived appointment data unknown for a missing or invalid organization timezone", async () => {
    const viewModel = await loadMissionControlViewModel(source({ settings: Promise.resolve({ ...settings, business: { ...settings.business, timezone: "Not/A-Timezone" } }) }));
    const missingTimezone = await loadMissionControlViewModel(source({ settings: Promise.resolve({ ...settings, business: { ...settings.business, timezone: "" } }) }));

    expect(viewModel.schedule.appointments).toBeNull();
    expect(viewModel.snapshot.find((metric) => metric.label === "Appointments today")?.value).toBeNull();
    expect(missingTimezone.schedule.timezone).toBeNull();
  });

  it("sorts today's appointments chronologically and leaves invalid times last", () => {
    expect(appointmentsForDate([appointment("late", "2026-07-28", "15:00"), appointment("invalid", "2026-07-28", "noon"), appointment("early", "2026-07-28", "09:00")], "2026-07-28").map((item: AppointmentRequest) => item.id)).toEqual(["early", "late", "invalid"]);
  });

  it("derives upcoming, completed, and awaiting-review counts from appointments", () => {
    const values = appointmentMetricValues([
      appointment("past", "2026-07-28", "09:00"),
      appointment("upcoming-today", "2026-07-28", "11:00"),
      appointment("upcoming-future", "2026-07-29", "09:00"),
      appointment("completed", "2026-07-20", "10:00", "completed")
    ], "2026-07-28", "10:00");

    expect(values).toEqual({ upcoming: 2, completed: 1, awaitingReview: 3 });
  });

  it("uses communication metrics for communications health", async () => {
    const healthy = await loadMissionControlViewModel(source());
    const attention = await loadMissionControlViewModel(source({ metrics: Promise.resolve({ ...metrics, failed: 2 }) }));

    expect(healthy.systemHealth[0].status).toBe("healthy");
    expect(attention.systemHealth[0].status).toBe("attention");
  });

  it("uses a verified tenant-scoped connection record for calendar health", async () => {
    const connected = await loadMissionControlViewModel(source());
    const viewModel = await loadMissionControlViewModel(source({ integrations: Promise.resolve([{ provider: "google_calendar", status: "disconnected", accountLabel: null, lastConnectedAt: null, lastSyncedAt: null, lastError: null }]) }));

    expect(connected.systemHealth[2].status).toBe("connected");
    expect(viewModel.systemHealth[2].status).toBe("attention");
  });

  it("does not infer a verified calendar connection or Stripe connectivity from incomplete integration data", async () => {
    const viewModel = await loadMissionControlViewModel(source({ integrations: Promise.resolve([
      { provider: "google_calendar", status: "connected", accountLabel: null, lastConnectedAt: null, lastSyncedAt: null, lastError: null },
      { provider: "stripe", status: "connected", accountLabel: "Stripe", lastConnectedAt: null, lastSyncedAt: null, lastError: null }
    ]) }));

    expect(viewModel.systemHealth[2].status).toBe("needs_verification");
    expect(viewModel.systemHealth[3].status).toBe("needs_verification");
  });

  it("identifies the manual BlueNotary handoff and disabled document processing without exposing queue details", async () => {
    const viewModel = await loadMissionControlViewModel(source());

    expect(viewModel.systemHealth[4]).toMatchObject({ name: "BlueNotary", status: "manual" });
    expect(viewModel.systemHealth[5]).toEqual(expect.objectContaining({ name: "Document processing", status: "disabled", detail: "Awaiting vendor and legal approval." }));
  });

  it("marks calendar health unknown when its integration source fails", async () => {
    const viewModel = await loadMissionControlViewModel(source({ integrations: Promise.reject(new Error("integrations unavailable")) }));

    expect(viewModel.systemHealth[2].status).toBe("unknown");
  });

  it("keeps independent sections available when communications fail", async () => {
    const viewModel = await loadMissionControlViewModel(source({
      appointments: Promise.resolve([appointment("today", "2026-07-28", "10:00")]),
      metrics: Promise.reject(new Error("communications unavailable"))
    }), new Date("2026-07-28T14:00:00.000Z"));

    expect(viewModel.schedule.appointments?.map((item: AppointmentRequest) => item.id)).toEqual(["today"]);
    expect(viewModel.snapshot.find((metric) => metric.label === "Scheduled communications")?.value).toBeNull();
    expect(viewModel.systemHealth[0].status).toBe("unknown");
  });

  it("keeps health and communication metrics available when appointments fail", async () => {
    const viewModel = await loadMissionControlViewModel(source({ appointments: Promise.reject(new Error("appointments unavailable")) }));

    expect(viewModel.schedule.appointments).toBeNull();
    expect(viewModel.snapshot.find((metric) => metric.label === "Appointments today")?.value).toBeNull();
    expect(viewModel.snapshot.find((metric) => metric.label === "Failed communications")?.value).toBe(0);
    expect(viewModel.systemHealth[0].status).toBe("healthy");
  });
});
