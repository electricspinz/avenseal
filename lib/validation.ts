import { z } from "zod";
import { isValidTimezone, validateIntervals } from "@/lib/availability";
import { sanitizeText } from "@/lib/utils";

export const documentCategories = [
  "affidavit",
  "power_of_attorney",
  "estate_planning",
  "business_document",
  "consent_or_authorization",
  "real_estate_related",
  "school_or_travel",
  "other",
  "not_sure"
] as const;

export const appointmentStatuses = [
  "awaiting_review",
  "awaiting_payment",
  "clarification_needed",
  "approved_pending_payment",
  "payment_processing",
  "confirmed",
  "ready",
  "completed",
  "cancelled",
  "declined",
  "follow_up_required",
  "no_show"
] as const;

export const businessModes = ["solo", "team", "enterprise"] as const;
export const tonePresets = ["professional_and_warm", "formal", "friendly", "concise"] as const;
export const deliveryMethods = ["remote_online_notarization"] as const;

const optionalText = (max = 200) =>
  z.string().optional().nullable().transform((value) => (value ? sanitizeText(value, max) : null));

const boolish = z.union([z.boolean(), z.literal("on")]).optional().transform((value) => value === true || value === "on");
const nullableNumber = (min: number, max: number) =>
  z
    .union([z.coerce.number().int().min(min).max(max), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value === "" || value === null || value === undefined ? null : value));

const text = (max = 200) => z.string().transform((value) => sanitizeText(value, max));

export const bookingSchema = z
  .object({
    serviceId: z.string().uuid("Select a valid service."),
    fullName: text(120).pipe(z.string().min(2, "Enter your full name.")),
    email: z.string().trim().email("Enter a valid email address.").max(180),
    mobilePhone: z.string().trim().min(10, "Enter a mobile phone number.").max(30),
    documentCategory: z.enum(documentCategories),
    documentCount: z.coerce.number().int().min(1).max(20),
    signerCount: z.coerce.number().int().min(1).max(10),
    estimatedNotarizations: z.coerce.number().int().min(1).max(40).nullable().optional(),
    notarizationsNotSure: z.boolean(),
    hasWitnessLines: z.boolean().nullable(),
    witnessesAvailable: z.boolean().nullable(),
    signerLocation: text(120).pipe(z.string().min(2, "Enter the signer location.")),
    allSignersHaveGovernmentId: z.boolean(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
    urgency: z.enum(["same_day", "next_available", "specific_date", "not_urgent"]),
    administrativeNotes: text(1000).nullable().optional(),
    consentAccepted: z.literal(true, {
      errorMap: () => ({ message: "Consent is required before submitting." })
    }),
    privacyPolicyVersion: z.string().default("legal-review-placeholder-2026-07"),
    termsVersion: z.string().default("legal-review-placeholder-2026-07")
  })
  .refine((data) => data.notarizationsNotSure || !!data.estimatedNotarizations, {
    path: ["estimatedNotarizations"],
    message: "Enter an estimate or choose I'm not sure."
  });

export type BookingInput = z.infer<typeof bookingSchema>;

export const adminUpdateSchema = z.object({
  status: z.enum(appointmentStatuses).optional(),
  serviceId: z.string().uuid().optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  note: text(1000).optional()
});

export const paymentLinkSchema = z.object({
  appointmentId: z.string().uuid()
});

export const statusLinkRequestSchema = z.object({
  email: z.string().trim().email("Enter the email used for booking.").max(180),
  reference: text(40).pipe(z.string().min(6, "Enter your appointment reference."))
});

export const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amountCents: z.coerce.number().int().positive(),
  reason: text(300).pipe(z.string().min(3))
});

export const settingsSchema = z.object({
  businessName: text(120).pipe(z.string().min(2)),
  supportEmail: z.string().email(),
  supportPhone: z.string().min(7).max(30),
  timezone: text(80).pipe(z.string().min(3)),
  pricingHeadline: text(140).pipe(z.string().min(5)),
  pricingNote: text(300).pipe(z.string().min(5))
});

export const availabilityIntervalSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  displayOrder: z.coerce.number().int().min(0).default(0)
});

export const organizationSettingsSchema = z
  .object({
    businessName: text(120).pipe(z.string().min(2)),
    supportEmail: z.string().trim().email("Enter a valid business email."),
    supportPhone: text(30).pipe(z.string().min(7)),
    website: optionalText(180).refine((value) => !value || /^https?:\/\//.test(value), "Website must start with http:// or https://."),
    description: optionalText(400),
    timezone: text(80).refine(isValidTimezone, "Enter a valid IANA timezone."),
    businessMode: z.enum(businessModes),
    defaultDeliveryMethod: z.enum(deliveryMethods),
    pricingHeadline: text(140).pipe(z.string().min(5)),
    pricingNote: text(300).pipe(z.string().min(5)),
    defaultDurationMinutes: z.coerce.number().int().min(5).max(240),
    bufferBeforeMinutes: nullableNumber(0, 240),
    bufferAfterMinutes: nullableNumber(0, 240),
    minimumBookingNoticeMinutes: nullableNumber(0, 43200),
    maximumAdvanceBookingDays: nullableNumber(1, 730),
    sameDayEnabled: boolish,
    maximumAppointmentsPerDay: nullableNumber(1, 200),
    customerReschedulingEnabled: z.union([boolish, z.null()]).default(null),
    customerCancellationEnabled: z.union([boolish, z.null()]).default(null),
    emergencyAppointmentEnabled: z.union([boolish, z.null()]).default(null),
    automaticApprovalEnabled: boolish,
    intervals: z.array(availabilityIntervalSchema),
    serviceCustomerName: text(120).pipe(z.string().min(2)),
    serviceDescription: optionalText(400),
    serviceBasePriceCents: nullableNumber(0, 1000000),
    serviceCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    serviceActive: boolish,
    senderName: text(120).pipe(z.string().min(2)),
    replyToEmail: z.union([z.string().trim().email(), z.literal(""), z.null(), z.undefined()]).transform((value) => value || null),
    communicationSupportPhone: optionalText(30),
    emailRemindersEnabled: boolish,
    smsRemindersEnabled: boolish,
    reviewRequestsEnabled: boolish,
    confirmationMessagingEnabled: boolish,
    conciergeEnabled: boolish,
    conciergeDisplayName: text(80).pipe(z.string().min(2)),
    conciergeGreeting: text(400).pipe(z.string().min(10)),
    conciergeTonePreset: z.enum(tonePresets),
    conciergeEscalationMessage: text(400).pipe(z.string().min(10)),
    humanSupportDestination: optionalText(180),
    bookingAssistanceEnabled: boolish,
    faqAssistanceEnabled: boolish
  })
  .superRefine((data, context) => {
    for (const message of validateIntervals(data.intervals)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message, path: ["intervals"] });
    }
  });

export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
