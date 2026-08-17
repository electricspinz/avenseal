import { describe, expect, it } from "vitest";
import { loadAttentionIssues, type AttentionEngineRepository } from "@/lib/server/attention-engine";
import type { AdminCommunication, AppointmentRequest, OrganizationSettings } from "@/lib/types";

type Integrations = Awaited<ReturnType<AttentionEngineRepository["listIntegrations"]>>;

const settings: OrganizationSettings = {
  business: { organizationId: "org", businessName: "Avenseal", supportEmail: "hello@example.com", supportPhone: "555-0100", timezone: "America/New_York", pricingHeadline: "", pricingNote: "", privacyPolicyVersion: "1", termsVersion: "1" },
  rules: { defaultDurationMinutes: 30, bufferBeforeMinutes: null, bufferAfterMinutes: null, minimumBookingNoticeMinutes: null, maximumAdvanceBookingDays: null, sameDayEnabled: true, maximumAppointmentsPerDay: null, customerReschedulingEnabled: null, customerCancellationEnabled: null, emergencyAppointmentEnabled: null, automaticApprovalEnabled: false },
  intervals: [], exceptions: [], services: [],
  communications: { senderName: "Avenseal", replyToEmail: null, supportPhone: null, emailRemindersEnabled: true, smsRemindersEnabled: false, reviewRequestsEnabled: false, confirmationMessagingEnabled: true, reminder24hMinutesBefore: 1440, reminder2hMinutesBefore: 120, followupMinutesAfter: 1440, reviewRequestMinutesAfter: 2880 },
  concierge: { conciergeEnabled: true, displayName: "Ava", greeting: "Hello", tonePreset: "professional_and_warm", escalationMessage: "", humanSupportDestination: null, bookingAssistanceEnabled: true, faqAssistanceEnabled: true }
};

function appointment(id: string, updatedAt: string, date = "2026-07-28", status: AppointmentRequest["status"] = "awaiting_review"): AppointmentRequest {
  return { id, organizationId: "org", customerId: "customer", serviceId: null, serviceNameSnapshot: null, serviceDurationMinutesSnapshot: null, servicePriceCentsSnapshot: null, serviceCurrencySnapshot: null, status, customer: { id: "customer", organizationId: "org", fullName: `Customer ${id}`, email: "customer@example.com", mobilePhone: "555-0100", createdAt: updatedAt, updatedAt }, documentCategory: "other", documentCount: 1, signerCount: 1, estimatedNotarizations: null, notarizationsNotSure: false, hasWitnessLines: null, witnessesAvailable: null, signerLocation: "Florida", allSignersHaveGovernmentId: true, preferredDate: date, preferredTime: "10:00", urgency: "specific_date", administrativeNotes: null, createdAt: updatedAt, updatedAt };
}

function failedCommunication(id: string, timestamp: string): AdminCommunication {
  return { id, source: "message", messageId: id, appointmentId: "appointment", customerId: "customer", customerName: "Customer", messageType: "booking_confirmation", recipientEmail: "customer@example.com", subject: "Confirmation", bodyHtml: null, status: "failed", scheduledFor: null, queuedAt: null, sentAt: null, attemptCount: 1, lastAttemptedAt: timestamp, lastError: "Provider error", providerMessageId: null, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
}

function source(overrides: Partial<{ appointments: Promise<AppointmentRequest[]>; communications: Promise<{ records: AdminCommunication[]; currentPage: number; totalPages: number; totalRecords: number }>; integrations: Promise<Integrations>; settings: Promise<OrganizationSettings> }> = {}): AttentionEngineRepository {
  return {
    listAppointments: () => overrides.appointments ?? Promise.resolve([]),
    listAdminCommunications: () => overrides.communications ?? Promise.resolve({ records: [], currentPage: 1, totalPages: 1, totalRecords: 0 }),
    listIntegrations: () => overrides.integrations ?? Promise.resolve([{ provider: "google_calendar", status: "connected", accountLabel: null, lastConnectedAt: null, lastSyncedAt: null, lastError: null }]),
    getSettings: () => overrides.settings ?? Promise.resolve(settings)
  };
}

describe("Attention Engine", () => {
  it("creates critical actionable issues for failed communications", async () => {
    const issues = await loadAttentionIssues(source({ communications: Promise.resolve({ records: [failedCommunication("failed", "2026-07-28T12:00:00.000Z")], currentPage: 1, totalPages: 1, totalRecords: 1 }) }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues[0]).toMatchObject({ priority: "critical", category: "communications", href: "/admin/communications/failed", actionLabel: "Open communication" });
  });

  it("creates a high-priority issue for a disconnected calendar integration", async () => {
    const issues = await loadAttentionIssues(source({ integrations: Promise.resolve([{ provider: "google_calendar", status: "disconnected", accountLabel: null, lastConnectedAt: null, lastSyncedAt: null, lastError: null }]) }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ priority: "high", category: "calendar", id: "calendar-integration-disconnected" })]));
  });

  it("creates medium-priority issues for appointments awaiting review", async () => {
    const issues = await loadAttentionIssues(source({ appointments: Promise.resolve([appointment("review", "2026-07-28T10:00:00.000Z")]) }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ priority: "medium", href: "/admin/appointments/review" })]));
  });

  it("creates a low-priority issue when there are no appointments for the organization day", async () => {
    const issues = await loadAttentionIssues(source({ appointments: Promise.resolve([]) }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ priority: "low", id: "no-appointments-today:2026-07-28" })]));
  });

  it("creates a low-priority unknown issue only for an unverified source", async () => {
    const issues = await loadAttentionIssues(source({ communications: Promise.reject(new Error("communications unavailable")) }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ id: "unknown-communications", priority: "low", category: "system" })]));
  });

  it("orders simultaneous issues by priority and newest timestamp", async () => {
    const issues = await loadAttentionIssues(source({
      appointments: Promise.resolve([appointment("older", "2026-07-28T10:00:00.000Z"), appointment("newer", "2026-07-28T11:00:00.000Z")]),
      communications: Promise.resolve({ records: [failedCommunication("older-failure", "2026-07-28T12:00:00.000Z"), failedCommunication("newer-failure", "2026-07-28T13:00:00.000Z")], currentPage: 1, totalPages: 1, totalRecords: 2 }),
      integrations: Promise.resolve([{ provider: "google_calendar", status: "disconnected", accountLabel: null, lastConnectedAt: null, lastSyncedAt: null, lastError: null }])
    }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues.map((issue) => issue.id)).toEqual(["communication-failed:newer-failure", "communication-failed:older-failure", "calendar-integration-disconnected", "appointment-awaiting-review:newer", "appointment-awaiting-review:older"]);
  });

  it("uses IDs for stable ordering when timestamps are identical", async () => {
    const issues = await loadAttentionIssues(source({ communications: Promise.resolve({ records: [failedCommunication("b", "2026-07-28T12:00:00.000Z"), failedCommunication("a", "2026-07-28T12:00:00.000Z")], currentPage: 1, totalPages: 1, totalRecords: 2 }) }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues.slice(0, 2).map((issue) => issue.id)).toEqual(["communication-failed:a", "communication-failed:b"]);
  });

  it("returns an empty list when sources are healthy and today has appointments", async () => {
    await expect(loadAttentionIssues(source({ appointments: Promise.resolve([appointment("today", "2026-07-28T10:00:00.000Z", "2026-07-28", "confirmed")]) }), new Date("2026-07-28T14:00:00.000Z"))).resolves.toEqual([]);
  });

  it("retains successful issues when another source fails", async () => {
    const issues = await loadAttentionIssues(source({ appointments: Promise.resolve([appointment("review", "2026-07-28T10:00:00.000Z")]), integrations: Promise.reject(new Error("integrations unavailable")) }), new Date("2026-07-28T14:00:00.000Z"));

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ id: "unknown-integrations" }), expect.objectContaining({ id: "appointment-awaiting-review:review" })]));
  });
});
