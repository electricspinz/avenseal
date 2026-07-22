import { describe, expect, it } from "vitest";
import { generateSlots, isSlotAvailable, isValidTimezone, validateIntervals } from "@/lib/availability";
import { organizationSettingsSchema } from "@/lib/validation";

const rules = {
  defaultDurationMinutes: 30,
  bufferBeforeMinutes: null,
  bufferAfterMinutes: null
};

const intervals = [
  { weekday: 1, startTime: "09:30", endTime: "18:00", displayOrder: 0 },
  { weekday: 2, startTime: "09:30", endTime: "18:00", displayOrder: 0 },
  { weekday: 3, startTime: "09:30", endTime: "18:00", displayOrder: 0 },
  { weekday: 4, startTime: "09:30", endTime: "18:00", displayOrder: 0 },
  { weekday: 5, startTime: "09:30", endTime: "18:00", displayOrder: 0 }
];

describe("availability", () => {
  it("validates IANA timezones", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Florida/Orlando")).toBe(false);
  });

  it("generates weekday slots within opening and closing boundaries", () => {
    const slots = generateSlots({ date: "2026-07-20", intervals, rules });
    expect(slots[0]).toBe("09:30");
    expect(slots).toContain("17:30");
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("18:00");
  });

  it("returns no slots for closed weekend days", () => {
    expect(generateSlots({ date: "2026-07-18", intervals, rules })).toEqual([]);
    expect(generateSlots({ date: "2026-07-19", intervals, rules })).toEqual([]);
  });

  it("honors appointment duration and buffers", () => {
    const buffered = generateSlots({
      date: "2026-07-20",
      intervals,
      rules: { defaultDurationMinutes: 60, bufferBeforeMinutes: 30, bufferAfterMinutes: 30 }
    });
    expect(buffered[0]).toBe("10:00");
    expect(buffered.at(-1)).toBe("16:30");
  });

  it("checks requested slots against generated availability", () => {
    expect(isSlotAvailable({ date: "2026-07-20", time: "09:30", intervals, rules })).toBe(true);
    expect(isSlotAvailable({ date: "2026-07-20", time: "09:00", intervals, rules })).toBe(false);
  });

  it("rejects invalid and overlapping intervals", () => {
    expect(validateIntervals([{ weekday: 1, startTime: "18:00", endTime: "09:30" }])).toHaveLength(1);
    expect(validateIntervals([
      { weekday: 1, startTime: "09:30", endTime: "12:00" },
      { weekday: 1, startTime: "11:30", endTime: "13:00" }
    ])).toHaveLength(1);
  });
});

describe("organization settings validation", () => {
  const base = {
    businessName: "Avenseal",
    supportEmail: "hello@avenseal.com",
    supportPhone: "(407) 555-0100",
    website: "https://avenseal.com",
    description: "Remote online notary appointments.",
    timezone: "America/New_York",
    businessMode: "solo",
    defaultDeliveryMethod: "remote_online_notarization",
    pricingHeadline: "Clear pricing shown before confirmation.",
    pricingNote: "Pricing needs final business approval.",
    defaultDurationMinutes: 30,
    bufferBeforeMinutes: null,
    bufferAfterMinutes: null,
    minimumBookingNoticeMinutes: null,
    maximumAdvanceBookingDays: null,
    sameDayEnabled: true,
    maximumAppointmentsPerDay: null,
    customerReschedulingEnabled: false,
    customerCancellationEnabled: false,
    emergencyAppointmentEnabled: false,
    automaticApprovalEnabled: false,
    intervals,
    serviceCustomerName: "Remote online notarization appointment",
    serviceDescription: "Pricing is configurable.",
    serviceBasePriceCents: 2500,
    serviceCurrency: "USD",
    serviceActive: true,
    senderName: "Avenseal",
    replyToEmail: "hello@avenseal.com",
    communicationSupportPhone: "(407) 555-0100",
    emailRemindersEnabled: false,
    smsRemindersEnabled: false,
    reviewRequestsEnabled: false,
    confirmationMessagingEnabled: false,
    conciergeEnabled: true,
    conciergeDisplayName: "Ava",
    conciergeGreeting: "Hi, I can help you request an appointment.",
    conciergeTonePreset: "professional_and_warm",
    conciergeEscalationMessage: "A commissioned notary will review your request.",
    humanSupportDestination: "hello@avenseal.com",
    bookingAssistanceEnabled: true,
    faqAssistanceEnabled: true
  };

  it("validates business mode values", () => {
    expect(organizationSettingsSchema.safeParse(base).success).toBe(true);
    expect(organizationSettingsSchema.safeParse({ ...base, businessMode: "franchise" }).success).toBe(false);
  });

  it("stores pricing in integer minor currency units", () => {
    expect(organizationSettingsSchema.safeParse({ ...base, serviceBasePriceCents: 2500 }).success).toBe(true);
    expect(organizationSettingsSchema.safeParse({ ...base, serviceBasePriceCents: 25.5 }).success).toBe(false);
  });
});
