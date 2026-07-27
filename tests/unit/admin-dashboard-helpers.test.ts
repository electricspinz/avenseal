import { describe, expect, it } from "vitest";
import { deriveAttentionItems, formatMinutes, getUpcomingAppointments } from "@/components/admin-dashboard/dashboard-helpers";
import type { AppointmentRequest, OrganizationSettings } from "@/lib/types";

const settings: OrganizationSettings = {
  business: { businessName: "Avenseal", supportEmail: "hello@example.com", supportPhone: "555-0100", timezone: "America/New_York", pricingHeadline: "", pricingNote: "", privacyPolicyVersion: "1", termsVersion: "1" },
  rules: { defaultDurationMinutes: 30, bufferBeforeMinutes: null, bufferAfterMinutes: null, minimumBookingNoticeMinutes: null, maximumAdvanceBookingDays: null, sameDayEnabled: false, maximumAppointmentsPerDay: null, customerReschedulingEnabled: null, customerCancellationEnabled: null, emergencyAppointmentEnabled: null, automaticApprovalEnabled: false },
  intervals: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
  exceptions: [],
  services: [{ id: "service", internalName: "remote", customerName: "Remote", description: null, basePriceCents: null, currency: "USD", defaultDurationMinutes: 30, isActive: true, displayOrder: 1, deliveryType: "remote" }],
  communications: { senderName: "Avenseal", replyToEmail: null, supportPhone: null, emailRemindersEnabled: true, smsRemindersEnabled: false, reviewRequestsEnabled: false, confirmationMessagingEnabled: true, reminder24hMinutesBefore: 1440, reminder2hMinutesBefore: 120, followupMinutesAfter: 1440, reviewRequestMinutesAfter: 2880 },
  concierge: { conciergeEnabled: true, displayName: "Ava", greeting: "Hello", tonePreset: "professional_and_warm", escalationMessage: "", humanSupportDestination: null, bookingAssistanceEnabled: true, faqAssistanceEnabled: true }
};

function appointment(id: string, date: string, time: string): AppointmentRequest {
  return { id, organizationId: "org", customerId: "customer", serviceId: "service", serviceNameSnapshot: null, serviceDurationMinutesSnapshot: null, servicePriceCentsSnapshot: null, serviceCurrencySnapshot: null, status: "awaiting_review", customer: { id: "customer", organizationId: "org", fullName: id, email: `${id}@example.com`, mobilePhone: "555-0100", createdAt: "2026-07-01", updatedAt: "2026-07-01" }, documentCategory: "other", documentCount: 1, signerCount: 1, estimatedNotarizations: null, notarizationsNotSure: false, hasWitnessLines: null, witnessesAvailable: null, signerLocation: "Florida", allSignersHaveGovernmentId: true, preferredDate: date, preferredTime: time, urgency: "specific_date", administrativeNotes: null, createdAt: "2026-07-01", updatedAt: "2026-07-01" };
}

describe("admin dashboard helpers", () => {
  it("formats reminder timing in minutes, hours, and days", () => {
    expect(formatMinutes(45)).toBe("45 minutes");
    expect(formatMinutes(120)).toBe("2 hours");
    expect(formatMinutes(1440)).toBe("1 day");
    expect(formatMinutes(90)).toBe("1 hour 30 minutes");
  });

  it("derives only actionable configuration attention items", () => {
    expect(deriveAttentionItems(settings)).toEqual([]);
    const attention = deriveAttentionItems({ ...settings, intervals: [], services: [{ ...settings.services[0], isActive: false }], communications: { ...settings.communications, emailRemindersEnabled: false, confirmationMessagingEnabled: false }, concierge: { ...settings.concierge, conciergeEnabled: false } });
    expect(attention.map((item) => item.id)).toEqual(["email-reminders", "confirmations", "concierge", "services", "availability"]);
  });

  it("filters past appointments and returns the next five in chronological order", () => {
    const now = new Date("2026-07-26T10:00:00");
    const appointments = [
      appointment("past", "2026-07-26", "09:00"), appointment("sixth", "2026-08-01", "10:00"), appointment("third", "2026-07-27", "13:00"), appointment("first", "2026-07-26", "10:00"), appointment("second", "2026-07-27", "09:00"), appointment("fourth", "2026-07-28", "10:00"), appointment("fifth", "2026-07-30", "10:00")
    ];
    expect(getUpcomingAppointments(appointments, now).map((item) => item.id)).toEqual(["first", "second", "third", "fourth", "fifth"]);
  });
});
