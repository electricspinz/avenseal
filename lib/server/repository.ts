import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { normalizeTime, weekdays } from "@/lib/availability";
import { getServerEnv } from "@/lib/env";
import { renderEmailSubject } from "@/lib/milestone3/email";
import { calculatePaymentExpiration } from "@/lib/milestone3/policies";
import { createStripeCheckoutSession } from "@/lib/milestone3/stripe";
import {
  getAvailableAppointmentSlots,
  localTimeForAppointmentSlot
} from "@/lib/server/appointment-availability";
import { getGoogleConnectionStatus } from "@/lib/server/google-oauth";
import {
  appointmentDateTimeRange,
  retryPendingCalendarSyncs,
  synchronizeAppointmentCalendar
} from "@/lib/server/google-calendar-sync";
import {
  buildAppointmentServiceSnapshot,
  calculateAppointmentCheckoutLineItem,
  loadBookableAppointmentService,
  resolveAppointmentDuration
} from "@/lib/server/appointment-services";
import { devStore } from "@/lib/server/dev-store";
import { enqueueAndProcessEmail, renderEmailTemplate } from "@/lib/server/communications";
import { cancelAppointmentReminders, scheduleAppointmentReminders } from "@/lib/server/appointment-reminders";
import { clientWorkspaceExpiration, normalizeClientWorkspaceEmail } from "@/lib/server/client-workspace-magic-links";
import { isCustomerVisibleExternalSession, type ExternalSession, type ExternalSessionInput, type ExternalSessionStatus } from "@/lib/server/external-sessions";
import { mapFloridaRonPreparedAttempt, type AssistantStopReason, type FloridaRonModule, type FloridaRonPreparedAttempt, type FloridaRonPrepareInput } from "@/lib/server/florida-ron-session-assistant";
import type { FloridaRonProductionAttempt, FloridaRonProductionEvidence, ProductionAttemptState } from "@/lib/server/florida-ron-production";
import type { ClientWorkspaceAccessToken } from "@/lib/server/client-workspace-access";
import type { EmailDeliveryResult } from "@/lib/server/email";
import { resolvePublicOrganization, resolvePublicOrganizationId } from "@/lib/server/organization";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";
import type {
  AiConciergeSettings,
  AdminCommunication,
  AdminCommunicationMetrics,
  AdminCommunicationPage,
  AppointmentPayment,
  AppointmentRequest,
  AppointmentRules,
  AppointmentStatus,
  AvailabilityException,
  AvailabilityInterval,
  BusinessSettings,
  CalendarEventMapping,
  CommunicationMessage,
  CommunicationSettings,
  CustomerAppointmentStatus,
  DocumentCategory,
  OrganizationService,
  OrganizationSettings,
  PaymentStatus
} from "@/lib/types";
import type { BookingInput, OrganizationSettingsInput } from "@/lib/validation";

type SupabaseRow = Record<string, unknown>;
function mapFloridaRonProductionAttempt(row: Record<string, unknown>): FloridaRonProductionAttempt { return { id: String(row.id), organizationId: String(row.organization_id), appointmentId: String(row.appointment_request_id), preparedSessionId: String(row.prepared_session_id), workflowVersion: String(row.workflow_version), preparedParameters: row.prepared_parameters as FloridaRonPrepareInput, modules: row.module_versions as FloridaRonModule[], state: row.state as ProductionAttemptState, currentModuleIndex: Number(row.current_module_index), stopReason: row.stop_reason as AssistantStopReason | null, createdBy: String(row.created_by), createdAt: String(row.created_at), startedAt: String(row.started_at), terminalAt: row.terminal_at ? String(row.terminal_at) : null }; }
function mapFloridaRonProductionEvidence(row: Record<string, unknown>): FloridaRonProductionEvidence { return { id: String(row.id), attemptId: String(row.attempt_id), moduleId: String(row.module_id), moduleVersion: String(row.module_version), requirementId: String(row.requirement_id), principalIndex: typeof row.principal_index === "number" ? row.principal_index : null, value: Boolean(row.value), source: row.source as FloridaRonProductionEvidence["source"], actorId: String(row.actor_id), createdAt: String(row.created_at) }; }
type CommunicationArchiveRpcRow = Readonly<{ id: string; archived_at: string | null }>;

const communicationMessageStatuses = [
  "queued",
  "processing",
  "sent",
  "delivered",
  "failed",
  "skipped",
  "cancelled",
] as const satisfies readonly CommunicationMessage["status"][];

function isCommunicationMessageStatus(value: unknown): value is CommunicationMessage["status"] {
  return typeof value === "string" && communicationMessageStatuses.some((status) => status === value);
}

function communicationMessageStatus(value: unknown): CommunicationMessage["status"] {
  if (!isCommunicationMessageStatus(value)) {
    throw new Error("Invalid communication message status.");
  }
  return value;
}

export type AdminAppointmentRescheduleDiagnosticCategory =
  | "availability_preflight_failed"
  | "rpc_invalid_schedule_input"
  | "rpc_inactive_or_unconfigured_organization"
  | "rpc_availability_schedule_missing"
  | "rpc_invalid_dst_local_time"
  | "rpc_minimum_notice_violation"
  | "rpc_same_day_booking_disallowed"
  | "rpc_beyond_booking_horizon"
  | "rpc_blocked_exception"
  | "rpc_outside_availability_interval"
  | "rpc_daily_limit_reached"
  | "rpc_appointment_overlap"
  | "rpc_reservation_overlap"
  | "rpc_tenant_or_appointment_mismatch"
  | "rpc_reservation_transition_failed"
  | "rpc_audit_insert_failed"
  | "rpc_function_or_signature_missing"
  | "rpc_undefined_column"
  | "rpc_undefined_table"
  | "rpc_permission_denied"
  | "rpc_ambiguous_column"
  | "rpc_not_null_violation"
  | "rpc_foreign_key_violation"
  | "rpc_unique_violation"
  | "rpc_check_violation"
  | "rpc_invalid_input"
  | "rpc_datetime_failure"
  | "rpc_cardinality_violation"
  | "rpc_uncategorized_raise"
  | "unknown_rpc_validation_failure"
  | "rpc_not_found"
  | "communication_failed"
  | "unexpected_database_error";

const rescheduleRpcDiagnosticCategories = {
  AVENSEAL_RESCHEDULE_INVALID_SCHEDULE_INPUT: "rpc_invalid_schedule_input",
  AVENSEAL_RESCHEDULE_INACTIVE_OR_UNCONFIGURED_ORGANIZATION: "rpc_inactive_or_unconfigured_organization",
  AVENSEAL_RESCHEDULE_AVAILABILITY_SCHEDULE_MISSING: "rpc_availability_schedule_missing",
  AVENSEAL_RESCHEDULE_INVALID_DST_LOCAL_TIME: "rpc_invalid_dst_local_time",
  AVENSEAL_RESCHEDULE_MINIMUM_NOTICE: "rpc_minimum_notice_violation",
  AVENSEAL_RESCHEDULE_SAME_DAY_DISALLOWED: "rpc_same_day_booking_disallowed",
  AVENSEAL_RESCHEDULE_BEYOND_BOOKING_HORIZON: "rpc_beyond_booking_horizon",
  AVENSEAL_RESCHEDULE_BLOCKED_EXCEPTION: "rpc_blocked_exception",
  AVENSEAL_RESCHEDULE_OUTSIDE_AVAILABILITY_INTERVAL: "rpc_outside_availability_interval",
  AVENSEAL_RESCHEDULE_DAILY_LIMIT_REACHED: "rpc_daily_limit_reached",
  AVENSEAL_RESCHEDULE_APPOINTMENT_OVERLAP: "rpc_appointment_overlap",
  AVENSEAL_RESCHEDULE_RESERVATION_OVERLAP: "rpc_reservation_overlap",
  AVENSEAL_RESCHEDULE_TENANT_OR_APPOINTMENT_MISMATCH: "rpc_tenant_or_appointment_mismatch",
  AVENSEAL_RESCHEDULE_RESERVATION_TRANSITION_FAILED: "rpc_reservation_transition_failed",
  AVENSEAL_RESCHEDULE_AUDIT_INSERT_FAILED: "rpc_audit_insert_failed"
} as const satisfies Record<string, AdminAppointmentRescheduleDiagnosticCategory>;

const rescheduleRpcDiagnosticFields = ["message", "details", "hint", "code"] as const;

// Temporary, non-sensitive production diagnostics. This deliberately classifies
// only exact PostgreSQL/PostgREST codes after approved SQL tokens are checked.
const rescheduleRpcDiagnosticCodeCategories = {
  "42883": "rpc_function_or_signature_missing",
  PGRST202: "rpc_function_or_signature_missing",
  "42703": "rpc_undefined_column",
  "42P01": "rpc_undefined_table",
  "42501": "rpc_permission_denied",
  "42702": "rpc_ambiguous_column",
  "23502": "rpc_not_null_violation",
  "23503": "rpc_foreign_key_violation",
  "23505": "rpc_unique_violation",
  "23514": "rpc_check_violation",
  "22P02": "rpc_invalid_input",
  "22007": "rpc_datetime_failure",
  "22008": "rpc_datetime_failure",
  "21000": "rpc_cardinality_violation",
  P0001: "rpc_uncategorized_raise"
} as const satisfies Record<string, AdminAppointmentRescheduleDiagnosticCategory>;

export function mapAdminAppointmentRescheduleRpcDiagnostic(error: unknown): AdminAppointmentRescheduleDiagnosticCategory {
  if (typeof error !== "object" || error === null) return "unknown_rpc_validation_failure";
  const fields = error as Record<string, unknown>;
  for (const field of rescheduleRpcDiagnosticFields) {
    const value = typeof fields[field] === "string" ? fields[field] : null;
    if (!value) continue;
    for (const [token, category] of Object.entries(rescheduleRpcDiagnosticCategories)) {
      const exactToken = new RegExp(`(?:^|[^A-Za-z0-9_])${token}(?:$|[^A-Za-z0-9_])`);
      if (exactToken.test(value)) return category;
    }
  }
  const code = typeof fields.code === "string" ? fields.code : null;
  if (code && Object.prototype.hasOwnProperty.call(rescheduleRpcDiagnosticCodeCategories, code)) {
    return rescheduleRpcDiagnosticCodeCategories[code as keyof typeof rescheduleRpcDiagnosticCodeCategories];
  }
  return "unknown_rpc_validation_failure";
}

export class AdminAppointmentRescheduleDiagnosticError extends Error {
  constructor(
    readonly category: AdminAppointmentRescheduleDiagnosticCategory,
    message: string
  ) {
    super(message);
    this.name = "AdminAppointmentRescheduleDiagnosticError";
  }
}

type SupabaseAppointmentRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  service_id: string | null;
  service_name_snapshot: string | null;
  service_duration_minutes_snapshot: number | null;
  service_price_cents_snapshot: number | null;
  service_currency_snapshot: string | null;
  status: AppointmentStatus;
  customers: {
    id: string;
    organization_id: string;
    full_name: string;
    email: string;
    mobile_phone: string;
    created_at: string;
    updated_at: string;
  };
  document_category: DocumentCategory;
  document_count: number;
  signer_count: number;
  estimated_notarizations: number | null;
  notarizations_not_sure: boolean;
  has_witness_lines: boolean | null;
  witnesses_available: boolean | null;
  signer_location: string;
  all_signers_have_government_id: boolean;
  preferred_date: string;
  preferred_time: string;
  urgency: AppointmentRequest["urgency"];
  administrative_notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapAppointment(row: SupabaseAppointmentRow): AppointmentRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    serviceId: row.service_id,
    serviceNameSnapshot: row.service_name_snapshot,
    serviceDurationMinutesSnapshot: row.service_duration_minutes_snapshot,
    servicePriceCentsSnapshot: row.service_price_cents_snapshot,
    serviceCurrencySnapshot: row.service_currency_snapshot,
    status: row.status,
    customer: {
      id: row.customers.id,
      organizationId: row.customers.organization_id,
      fullName: row.customers.full_name,
      email: row.customers.email,
      mobilePhone: row.customers.mobile_phone,
      createdAt: row.customers.created_at,
      updatedAt: row.customers.updated_at
    },
    documentCategory: row.document_category,
    documentCount: row.document_count,
    signerCount: row.signer_count,
    estimatedNotarizations: row.estimated_notarizations,
    notarizationsNotSure: row.notarizations_not_sure,
    hasWitnessLines: row.has_witness_lines,
    witnessesAvailable: row.witnesses_available,
    signerLocation: row.signer_location,
    allSignersHaveGovernmentId: row.all_signers_have_government_id,
    preferredDate: row.preferred_date,
    preferredTime: normalizeTime(row.preferred_time),
    urgency: row.urgency,
    administrativeNotes: row.administrative_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRules(row: SupabaseRow | null): AppointmentRules {
  return {
    defaultDurationMinutes: Number(row?.default_duration_minutes ?? 30),
    bufferBeforeMinutes: nullableNumber(row?.buffer_before_minutes),
    bufferAfterMinutes: nullableNumber(row?.buffer_after_minutes),
    minimumBookingNoticeMinutes: nullableNumber(row?.minimum_booking_notice_minutes),
    maximumAdvanceBookingDays: nullableNumber(row?.maximum_advance_booking_days),
    sameDayEnabled: Boolean(row?.same_day_enabled ?? true),
    maximumAppointmentsPerDay: nullableNumber(row?.maximum_appointments_per_day),
    customerReschedulingEnabled: nullableBoolean(row?.customer_rescheduling_enabled),
    customerCancellationEnabled: nullableBoolean(row?.customer_cancellation_enabled),
    emergencyAppointmentEnabled: nullableBoolean(row?.emergency_appointment_enabled),
    automaticApprovalEnabled: Boolean(row?.automatic_approval_enabled ?? false),
    sameDayPaymentWindowMinutes: Number(row?.same_day_payment_window_minutes ?? 30),
    futurePaymentWindowMinutes: Number(row?.future_payment_window_minutes ?? 720),
    complimentaryRescheduleCount: Number(row?.complimentary_reschedule_count ?? 1),
    rescheduleNoticeMinutes: Number(row?.reschedule_notice_minutes ?? 120),
    lateCancellationCutoffMinutes: Number(row?.late_cancellation_cutoff_minutes ?? 120),
    lateCancellationRetainedCents: Number(row?.late_cancellation_retained_cents ?? 1500),
    noShowGraceMinutes: Number(row?.no_show_grace_minutes ?? 10)
  };
}

function nullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseCommunicationArchiveRpcRow(value: unknown): CommunicationArchiveRpcRow | null {
  if (!isSupabaseRow(value) || typeof value.id !== "string" || (value.archived_at !== null && typeof value.archived_at !== "string")) return null;
  return { id: value.id, archived_at: value.archived_at };
}

function isSupabaseRow(value: unknown): value is SupabaseRow {
  return typeof value === "object" && value !== null;
}

function mapBusiness(org: SupabaseRow, settings: SupabaseRow): BusinessSettings {
  return {
    organizationId: String(settings.organization_id ?? org.id),
    businessName: String(settings.business_name ?? "Avenseal"),
    supportEmail: String(settings.support_email ?? ""),
    supportPhone: String(settings.support_phone ?? ""),
    website: stringOrNull(settings.website),
    description: stringOrNull(settings.description),
    timezone: String(settings.timezone ?? org.timezone ?? "America/New_York"),
    businessMode: String(org.business_mode ?? "solo") as BusinessSettings["businessMode"],
    defaultDeliveryMethod: String(settings.default_delivery_method ?? org.default_delivery_method ?? "remote_online_notarization") as BusinessSettings["defaultDeliveryMethod"],
    pricingHeadline: String(settings.pricing_headline ?? "Clear pricing shown before your appointment is confirmed."),
    pricingNote: String(settings.pricing_note ?? "Pricing content is awaiting business approval."),
    privacyPolicyVersion: String(settings.privacy_policy_version ?? "privacy-policy-2026-08-09"),
    termsVersion: String(settings.terms_version ?? "terms-of-service-2026-08-09")
  };
}

function mapIntervals(rows: SupabaseRow[]): AvailabilityInterval[] {
  return rows.map((row) => ({
    id: String(row.id),
    weekday: Number(row.weekday),
    startTime: normalizeTime(String(row.start_time)),
    endTime: normalizeTime(String(row.end_time)),
    displayOrder: Number(row.display_order ?? 0)
  }));
}

function mapExceptions(rows: SupabaseRow[]): AvailabilityException[] {
  return rows.map((row) => ({
    exceptionDate: String(row.exception_date),
    closedAllDay: Boolean(row.closed_all_day ?? !row.is_available),
    startTime: row.start_time ? normalizeTime(String(row.start_time)) : null,
    endTime: row.end_time ? normalizeTime(String(row.end_time)) : null,
    reason: stringOrNull(row.reason),
    customerMessage: stringOrNull(row.customer_message)
  }));
}

function mapServices(rows: SupabaseRow[]): OrganizationService[] {
  return rows.map((row) => ({
    id: String(row.id),
    internalName: String(row.internal_name),
    customerName: String(row.customer_name),
    description: stringOrNull(row.description),
    basePriceCents: nullableNumber(row.base_price_cents),
    currency: String(row.currency ?? "USD"),
    defaultDurationMinutes: Number(row.default_duration_minutes ?? 30),
    isActive: Boolean(row.is_active ?? true),
    displayOrder: Number(row.display_order ?? 0),
    deliveryType: String(row.delivery_type ?? "remote") as OrganizationService["deliveryType"]
  }));
}

function mapPayment(row: SupabaseRow): AppointmentPayment {
  return {
    id: String(row.id),
    appointmentRequestId: String(row.appointment_request_id),
    serviceId: String(row.service_id),
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    status: String(row.status) as AppointmentPayment["status"],
    checkoutUrl: stringOrNull(row.checkout_url),
    stripeCheckoutSessionId: stringOrNull(row.stripe_checkout_session_id),
    stripePaymentIntentId: stringOrNull(row.stripe_payment_intent_id),
    expiresAt: stringOrNull(row.expires_at),
    paidAt: stringOrNull(row.paid_at),
    refundedAmountCents: Number(row.refunded_amount_cents ?? 0),
    refundReason: stringOrNull(row.refund_reason),
    refundedAt: stringOrNull(row.refunded_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapCalendarEvent(row: SupabaseRow): CalendarEventMapping {
  return {
    id: String(row.id),
    appointmentRequestId: String(row.appointment_request_id),
    calendarId: String(row.calendar_id ?? "primary"),
    providerEventId: stringOrNull(row.provider_event_id),
    status: String(row.status) as CalendarEventMapping["status"],
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    timezone: String(row.timezone),
    meetUrl: stringOrNull(row.meet_url),
    providerEtag: stringOrNull(row.provider_etag),
    retryCount: Number(row.retry_count ?? 0),
    lastSyncedAt: stringOrNull(row.last_synced_at),
    lastAttemptedAt: stringOrNull(row.last_attempted_at),
    lastError: stringOrNull(row.last_error),
    lastErrorAt: stringOrNull(row.last_error_at)
  };
}

function mapCommunication(row: SupabaseRow): CommunicationMessage {
  return {
    id: String(row.id),
    appointmentRequestId: stringOrNull(row.appointment_request_id),
    messageType: String(row.message_type),
    recipientEmail: String(row.recipient_email),
    subject: String(row.subject),
    status: String(row.status) as CommunicationMessage["status"],
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptedAt: stringOrNull(row.last_attempted_at),
    sentAt: stringOrNull(row.sent_at),
    lastError: stringOrNull(row.last_error)
  };
}

function mapAdminCommunication(row: SupabaseRow): AdminCommunication {
  return {
    id: String(row.id),
    source: String(row.source) === "reminder" ? "reminder" : "message",
    messageId: stringOrNull(row.message_id),
    appointmentId: stringOrNull(row.appointment_id),
    customerId: stringOrNull(row.customer_id),
    customerName: stringOrNull(row.customer_name),
    messageType: String(row.message_type),
    recipientEmail: String(row.recipient_email),
    subject: stringOrNull(row.subject),
    bodyHtml: stringOrNull(row.body_html),
    status: String(row.status) as AdminCommunication["status"],
    scheduledFor: stringOrNull(row.scheduled_for),
    queuedAt: stringOrNull(row.queued_at),
    sentAt: stringOrNull(row.sent_at),
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptedAt: stringOrNull(row.last_attempted_at),
    lastError: stringOrNull(row.last_error),
    providerMessageId: stringOrNull(row.provider_message_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: stringOrNull(row.archived_at)
  };
}

function mapCommunications(row: SupabaseRow | null): CommunicationSettings {
  return {
    senderName: String(row?.sender_name ?? "Avenseal"),
    replyToEmail: stringOrNull(row?.reply_to_email),
    supportPhone: stringOrNull(row?.support_phone),
    emailRemindersEnabled: Boolean(row?.email_reminders_enabled ?? false),
    smsRemindersEnabled: Boolean(row?.sms_reminders_enabled ?? false),
    reviewRequestsEnabled: Boolean(row?.review_requests_enabled ?? false),
    confirmationMessagingEnabled: Boolean(row?.confirmation_messaging_enabled ?? false),
    reminder24hMinutesBefore: Number(row?.reminder_24h_minutes_before ?? 1440),
    reminder2hMinutesBefore: Number(row?.reminder_2h_minutes_before ?? 120),
    followupMinutesAfter: Number(row?.followup_minutes_after ?? 1440),
    reviewRequestMinutesAfter: Number(row?.review_request_minutes_after ?? 2880)
  };
}

function mapConcierge(row: SupabaseRow | null): AiConciergeSettings {
  return {
    conciergeEnabled: Boolean(row?.concierge_enabled ?? true),
    displayName: String(row?.display_name ?? "Ava"),
    greeting: String(
      row?.greeting ??
      "Hi, I'm Ava, Avenseal's virtual booking assistant. I'll help you prepare and request a remote online notary appointment."
    ),
    tonePreset: String(row?.tone_preset ?? "professional_and_warm") as AiConciergeSettings["tonePreset"],
    escalationMessage:
      String(row?.escalation_message ??
      "A commissioned notary will review your request and make all notarial determinations during the session."),
    humanSupportDestination: stringOrNull(row?.human_support_destination),
    bookingAssistanceEnabled: Boolean(row?.booking_assistance_enabled ?? true),
    faqAssistanceEnabled: Boolean(row?.faq_assistance_enabled ?? true)
  };
}

async function loadOrganizationSettings(): Promise<OrganizationSettings> {
  if (!hasSupabaseServiceConfig()) return devStore.getOrganizationSettings();
  const supabase = getSupabaseAdmin();
  const organization = await resolvePublicOrganization();
  const organizationId = organization.id;
  const [
    orgResult,
    settingsResult,
    rulesResult,
    intervalsResult,
    exceptionsResult,
    servicesResult,
    communicationsResult,
    conciergeResult
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", organizationId).single(),
    supabase.from("business_settings").select("*").eq("organization_id", organizationId).single(),
    supabase.from("appointment_rule_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
    supabase
      .from("organization_availability_intervals")
      .select("*")
      .eq("organization_id", organizationId)
      .order("weekday")
      .order("display_order"),
    supabase.from("availability_exceptions").select("*").eq("organization_id", organizationId),
    supabase.from("organization_services").select("*").eq("organization_id", organizationId).order("display_order"),
    supabase.from("communication_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("ai_concierge_settings").select("*").eq("organization_id", organizationId).maybeSingle()
  ]);

  if (orgResult.error) throw orgResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (rulesResult.error) throw rulesResult.error;
  if (intervalsResult.error) throw intervalsResult.error;
  if (exceptionsResult.error) throw exceptionsResult.error;
  if (servicesResult.error) throw servicesResult.error;
  if (communicationsResult.error) throw communicationsResult.error;
  if (conciergeResult.error) throw conciergeResult.error;

  return {
    business: mapBusiness(orgResult.data, settingsResult.data),
    rules: mapRules(rulesResult.data),
    intervals: mapIntervals(intervalsResult.data ?? []),
    exceptions: mapExceptions(exceptionsResult.data ?? []),
    services: mapServices(servicesResult.data ?? []),
    communications: mapCommunications(communicationsResult.data),
    concierge: mapConcierge(conciergeResult.data)
  };
}

export function hashAppointmentAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function appointmentAccessTokenHashesEqual(left: string, right: string) { const leftBytes = Buffer.from(left, "hex"); const rightBytes = Buffer.from(right, "hex"); return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes); }

const developmentExternalSessions = new Map<string, ExternalSession>();
const developmentClientWorkspaceTokens = new Map<string, ClientWorkspaceAccessToken & { tokenHash: string }>();
function externalSessionKey(organizationId: string, appointmentId: string) { return `${organizationId}:${appointmentId}`; }
function mapExternalSession(row: { organization_id: string; appointment_request_id: string; provider: string; session_name: string; launch_url: string | null; reference_number: string | null; status: string; notes: string | null; created_at: string; updated_at: string; metadata: Record<string, string | number | boolean | null> | null }): ExternalSession { return { organizationId: row.organization_id, appointmentId: row.appointment_request_id, provider: row.provider, sessionName: row.session_name, launchUrl: row.launch_url, referenceNumber: row.reference_number, status: row.status as ExternalSessionStatus, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at, metadata: row.metadata ?? {} }; }
function mapClientWorkspaceToken(row: { id: string; organization_id: string; appointment_request_id: string; expires_at: string; issued_at: string; revoked_at: string | null; last_used_at: string | null; purpose: string; created_by: string | null }): ClientWorkspaceAccessToken { return { identifier: row.id, organizationId: row.organization_id, appointmentId: row.appointment_request_id, expiresAt: row.expires_at, issuedAt: row.issued_at, revokedAt: row.revoked_at, lastAccessedAt: row.last_used_at, purpose: "client_workspace", createdBy: row.created_by }; }

function generateAppointmentAccessToken() {
  return randomBytes(32).toString("base64url");
}

function customerStatusLabel(status: AppointmentStatus) {
  const labels: Partial<Record<AppointmentStatus, string>> = {
    awaiting_review: "Request received",
    clarification_needed: "More information needed",
    approved_pending_payment: "Approved - payment required",
    confirmed: "Appointment confirmed",
    completed: "Appointment completed",
    cancelled: "Appointment cancelled"
  };
  return labels[status] ?? "Request received";
}

function referenceCode(appointmentId: string) {
  return appointmentId.replaceAll("-", "").slice(0, 10).toUpperCase();
}

function paymentEmailHtml(input: {
  customerName: string;
  appointmentReference: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  amount: string;
  checkoutUrl: string;
  statusUrl: string | null;
  expiresAt: string | null;
  supportEmail: string;
  supportPhone: string;
}) {
  return `
    <p>Hi ${input.customerName},</p>
    <p>Your Avenseal appointment request has been approved for payment.</p>
    <p><strong>Appointment reference:</strong> ${input.appointmentReference}</p>
    <p><strong>Service:</strong> ${input.serviceName}</p>
    <p><strong>Appointment:</strong> ${input.appointmentDate} at ${input.appointmentTime}</p>
    <p><strong>Amount due:</strong> ${input.amount}</p>
    ${input.expiresAt ? `<p><strong>Payment link expires:</strong> ${input.expiresAt}</p>` : ""}
    <p><a href="${input.checkoutUrl}" style="display:inline-block;padding:12px 20px;background:#123B5D;color:#ffffff;font-weight:700;text-decoration:none;border-radius:6px;">Pay and Confirm Appointment</a></p>
    ${input.statusUrl ? `<p><a href="${input.statusUrl}">Open your secure appointment portal</a></p>` : ""}
    <p>Questions? Contact ${input.supportEmail}${input.supportPhone ? ` or ${input.supportPhone}` : ""}.</p>
  `;
}

export async function createAppointmentAccessLink(appointment: AppointmentRequest, reason: string) {
  if (!hasSupabaseServiceConfig()) return null;
  const organizationId = appointment.organizationId;
  const token = generateAppointmentAccessToken();
  const tokenHash = hashAppointmentAccessToken(token);
  const expiresAt = new Date(clientWorkspaceExpiration(appointment));
  await getSupabaseAdmin().from("appointment_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("appointment_request_id", appointment.id).eq("purpose", "client_workspace").is("revoked_at", null);
  const { error } = await getSupabaseAdmin()
    .from("appointment_access_tokens")
    .insert({
      organization_id: organizationId,
      appointment_request_id: appointment.id,
      token_hash: tokenHash,
      purpose: "client_workspace",
      expires_at: expiresAt.toISOString()
    });
  if (error?.code === "PGRST205") return null;
  if (error) throw error;
  const siteUrl = getServerEnv().NEXT_PUBLIC_SITE_URL;
  return {
    url: `${siteUrl}/appointments/access/${encodeURIComponent(token)}`,
    expiresAt,
    reason
  };
}

async function sendStatusLink(appointment: AppointmentRequest, messageType: "appointment_request_received" | "payment_required" | "payment_confirmed") {
  const settings = await loadOrganizationSettings();
  const access = await createAppointmentAccessLink(appointment, messageType);
  if (!access) return null;
  const subject = renderEmailSubject(messageType, settings.business.businessName);
  return enqueueAndProcessEmail(getSupabaseAdmin(), {
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    customerId: appointment.customerId,
    type: messageType === "appointment_request_received" ? "booking_confirmation" : messageType,
    recipient: appointment.customer.email,
    subject,
    html: renderEmailTemplate({
      greetingName: appointment.customer.fullName,
      body: "View your appointment details and prepare for your online notarization. Avenseal helps customers schedule, prepare, and pay; the notarization itself is conducted through an independent remote online notarization provider.",
      actionLabel: "View My Appointment",
      actionUrl: access.url,
      footer: `Questions? Contact ${settings.business.supportEmail}${settings.business.supportPhone ? ` or ${settings.business.supportPhone}` : ""}.`
    })
  });
}

async function deliverPaymentRequestEmail(input: {
  appointment: AppointmentRequest;
  payment: AppointmentPayment;
  settings: OrganizationSettings;
  serviceName: string;
}): Promise<EmailDeliveryResult> {
  try {
    const statusAccess = await createAppointmentAccessLink(input.appointment, "payment_required");
    const subject = renderEmailSubject("payment_required", input.settings.business.businessName);
    const delivery = await enqueueAndProcessEmail(getSupabaseAdmin(), {
      organizationId: input.appointment.organizationId,
      appointmentId: input.appointment.id,
      customerId: input.appointment.customerId,
      type: "payment_required",
      recipient: input.appointment.customer.email,
      subject,
      html: paymentEmailHtml({
        customerName: input.appointment.customer.fullName,
        appointmentReference: referenceCode(input.appointment.id),
        serviceName: input.serviceName,
        appointmentDate: input.appointment.preferredDate,
        appointmentTime: input.appointment.preferredTime,
        amount: new Intl.NumberFormat("en-US", { style: "currency", currency: input.payment.currency.toUpperCase() }).format(input.payment.amountCents / 100),
        checkoutUrl: input.payment.checkoutUrl ?? "",
        statusUrl: statusAccess?.url ?? null,
        expiresAt: input.payment.expiresAt ? new Date(input.payment.expiresAt).toLocaleString("en-US", { timeZone: input.settings.business.timezone }) : null,
        supportEmail: input.settings.business.supportEmail,
        supportPhone: input.settings.business.supportPhone
      })
    });
    return delivery;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment email delivery failed.";
    console.error("[email] Payment email workflow failed.", { appointmentId: input.appointment.id, error: message });
    return { status: "failed", providerMessageId: null, error: message };
  }
}

async function synchronizeCalendarAfterSave(organizationId: string, appointmentId: string) {
  try {
    return await synchronizeAppointmentCalendar({ organizationId, appointmentId });
  } catch {
    console.error("[google-calendar-sync]", {
      component: "google_calendar_sync",
      action: "workflow_error",
      organizationId,
      appointmentId
    });
    return null;
  }
}

export const repository = {
  async createAppointment(input: BookingInput) {
    const settings = await loadOrganizationSettings();
    const organizationId = settings.business.organizationId;
    if (!organizationId) throw new Error("Organization is not configured.");
    const service = await loadBookableAppointmentService(organizationId, input.serviceId);
    const snapshot = buildAppointmentServiceSnapshot(service, organizationId);
    const availability = await getAvailableAppointmentSlots({
      organizationId,
      serviceId: service.id,
      date: input.preferredDate
    });
    const requestedTime = normalizeTime(input.preferredTime);
    if (!availability.slots.some((slot) =>
      localTimeForAppointmentSlot(slot.startAt, availability.timezone) === requestedTime
    )) {
      throw new Error("Selected appointment time is outside current availability.");
    }

    if (!hasSupabaseServiceConfig()) return devStore.createAppointment(input, snapshot);
    const supabase = getSupabaseAdmin();
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        organization_id: organizationId,
        full_name: input.fullName,
        email: input.email,
        mobile_phone: input.mobilePhone
      })
      .select()
      .single();
    if (customerError) throw customerError;

    const { data: appointment, error: appointmentError } = await supabase
      .from("appointment_requests")
      .insert({
        organization_id: organizationId,
        customer_id: customer.id,
        service_id: snapshot.serviceId,
        service_name_snapshot: snapshot.serviceNameSnapshot,
        service_duration_minutes_snapshot: snapshot.serviceDurationMinutesSnapshot,
        service_price_cents_snapshot: snapshot.servicePriceCentsSnapshot,
        service_currency_snapshot: snapshot.serviceCurrencySnapshot,
        status: "awaiting_review",
        document_category: input.documentCategory,
        document_count: input.documentCount,
        signer_count: input.signerCount,
        estimated_notarizations: input.notarizationsNotSure ? null : input.estimatedNotarizations,
        notarizations_not_sure: input.notarizationsNotSure,
        has_witness_lines: input.hasWitnessLines,
        witnesses_available: input.witnessesAvailable,
        signer_location: input.signerLocation,
        all_signers_have_government_id: input.allSignersHaveGovernmentId,
        preferred_date: input.preferredDate,
        preferred_time: input.preferredTime,
        urgency: input.urgency,
        administrative_notes: input.administrativeNotes ?? null
      })
      .select("*, customers(*)")
      .single();
    if (appointmentError) throw appointmentError;

    await supabase.from("status_history").insert({
      organization_id: organizationId,
      appointment_request_id: appointment.id,
      from_status: null,
      to_status: "awaiting_review",
      reason: "Public booking request submitted."
    });
    await supabase.from("consent_records").insert({
      organization_id: organizationId,
      appointment_request_id: appointment.id,
      customer_id: customer.id,
      privacy_policy_version: input.privacyPolicyVersion,
      terms_version: input.termsVersion,
      consented_at: new Date().toISOString()
    });
    const mappedAppointment = mapAppointment(appointment);
    await repository.ensureAppointmentPaymentObligation(mappedAppointment);
    await scheduleAppointmentReminders(supabase, {
      organizationId,
      appointmentId: mappedAppointment.id,
      startsAt: new Date(`${mappedAppointment.preferredDate}T${mappedAppointment.preferredTime}:00-04:00`),
      settings: settings.communications
    });
    await sendStatusLink(mappedAppointment, "appointment_request_received");
    return mappedAppointment;
  },
  async listAppointments() {
    if (!hasSupabaseServiceConfig()) return devStore.listAppointments();
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("appointment_requests")
      .select("*, customers(*)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(mapAppointment);
  },
  async listPaymentReadinessSources(appointmentIds: readonly string[]) {
    if (!hasSupabaseServiceConfig() || appointmentIds.length === 0) return [];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("appointment_payments")
      .select("organization_id,appointment_request_id,status,created_at")
      .eq("organization_id", organizationId)
      .in("appointment_request_id", [...appointmentIds])
      .order("created_at", { ascending: false });
    if (error && error.code !== "PGRST205") throw error;
    return (data ?? []).map((row) => ({
      organizationId: row.organization_id,
      appointmentId: row.appointment_request_id,
      status: row.status as PaymentStatus
    }));
  },
  async listExternalSessionReadinessSources(appointmentIds: readonly string[]) {
    if (!hasSupabaseServiceConfig() || appointmentIds.length === 0) return [];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("external_sessions")
      .select("organization_id,appointment_request_id,status")
      .eq("organization_id", organizationId)
      .in("appointment_request_id", [...appointmentIds]);
    if (error?.code === "PGRST205") return [];
    if (error) throw error;
    return (data ?? []).map((row) => ({
      organizationId: row.organization_id,
      appointmentId: row.appointment_request_id,
      status: row.status as ExternalSessionStatus
    }));
  },
  async listExternalSessionNextActionSources(appointmentIds: readonly string[]) {
    if (!hasSupabaseServiceConfig() || appointmentIds.length === 0) return [];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("external_sessions")
      .select("organization_id,appointment_request_id,status,launch_url")
      .eq("organization_id", organizationId)
      .in("appointment_request_id", [...appointmentIds]);
    if (error?.code === "PGRST205") return [];
    if (error) throw error;
    return (data ?? []).map((row) => ({
      organizationId: String(row.organization_id),
      appointmentId: String(row.appointment_request_id),
      status: String(row.status),
      launchUrl: stringOrNull(row.launch_url),
    }));
  },
  async listExternalSessionAvailableCommunicationSources(appointmentIds: readonly string[]): Promise<Array<{
    organizationId: string;
    appointmentId: string;
    messageType: CommunicationMessage["messageType"];
    status: CommunicationMessage["status"];
  }>> {
    if (!hasSupabaseServiceConfig() || appointmentIds.length === 0) return [];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("communication_messages")
      .select("organization_id,appointment_request_id,message_type,status,created_at")
      .eq("organization_id", organizationId)
      .eq("message_type", "external_session_available")
      .in("appointment_request_id", [...appointmentIds])
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      organizationId: String(row.organization_id),
      appointmentId: String(row.appointment_request_id),
      messageType: String(row.message_type),
      status: communicationMessageStatus(row.status),
    }));
  },
  async listReadinessTransitionAlertSources() {
    if (!hasSupabaseServiceConfig()) return [];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("audit_logs")
      .select("id,organization_id,entity_id,metadata,created_at")
      .eq("organization_id", organizationId)
      .eq("action", "appointment.readiness_changed")
      .eq("entity_type", "appointment_request")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      appointmentId: row.entity_id,
      createdAt: row.created_at,
      metadata: row.metadata
    }));
  },
  async ensureAppointmentPaymentObligation(appointment: AppointmentRequest) {
    if (!hasSupabaseServiceConfig()) return null;
    if (!appointment.serviceId || appointment.servicePriceCentsSnapshot === null || !appointment.serviceCurrencySnapshot) {
      throw new Error("Appointment service pricing snapshot is required for payment obligation creation.");
    }
    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase.from("appointment_payments").select("*").eq("organization_id", appointment.organizationId).eq("appointment_request_id", appointment.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return mapPayment(existing);
    const { data, error } = await supabase.from("appointment_payments").insert({ organization_id: appointment.organizationId, appointment_request_id: appointment.id, service_id: appointment.serviceId, amount_cents: appointment.servicePriceCentsSnapshot, currency: appointment.serviceCurrencySnapshot.toLowerCase(), status: "payment_link_created", idempotency_key: `booking-payment-obligation-${appointment.id}` }).select().single();
    if (error?.code === "23505") {
      const { data: concurrent, error: concurrentError } = await supabase.from("appointment_payments").select("*").eq("organization_id", appointment.organizationId).eq("appointment_request_id", appointment.id).limit(1).single();
      if (concurrentError) throw concurrentError;
      return mapPayment(concurrent);
    }
    if (error) throw error;
    return mapPayment(data);
  },
  async getAppointment(id: string) {
    if (!hasSupabaseServiceConfig()) return devStore.getAppointment(id);
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("appointment_requests")
      .select("*, customers(*)")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .single();
    if (error) return null;
    return mapAppointment(data);
  },
  async getFloridaRonPreparedAttempt(organizationId: string, appointmentId: string): Promise<FloridaRonPreparedAttempt | null> {
    if (!hasSupabaseServiceConfig()) {
      const session = await devStore.getFloridaRonPreparedSession(organizationId, appointmentId);
      return session ? mapFloridaRonPreparedAttempt(session) : null;
    }
    const { data, error } = await getSupabaseAdmin()
      .from("florida_ron_session_assistant_sessions")
      .select("id,workflow_version,specification_status,state,stop_reason,parameters,module_versions")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointmentId)
      .eq("state", "prepared")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapFloridaRonPreparedAttempt(data) : null;
  },
  async createFloridaRonPreparedAttempt(input: { organizationId: string; appointmentId: string; actorId: string; workflowVersion: string; parameters: FloridaRonPrepareInput; modules: FloridaRonModule[]; stopReason: AssistantStopReason | null }) {
    const eventPayload = { previousParameters: null, nextParameters: input.parameters, workflowVersion: input.workflowVersion, specificationStatus: "candidate", moduleVersions: input.modules, stopReason: input.stopReason };
    if (!hasSupabaseServiceConfig()) return devStore.createFloridaRonSession({ organization_id: input.organizationId, appointment_request_id: input.appointmentId, workflow_version: input.workflowVersion, specification_status: "candidate", state: "prepared", stop_reason: input.stopReason, parameters: input.parameters, module_versions: input.modules, created_by: input.actorId }, { organization_id: input.organizationId, actor_id: input.actorId, event_type: "prepared", payload: eventPayload });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("florida_ron_session_assistant_sessions").insert({ organization_id: input.organizationId, appointment_request_id: input.appointmentId, workflow_version: input.workflowVersion, specification_status: "candidate", state: "prepared", stop_reason: input.stopReason, parameters: input.parameters, module_versions: input.modules, created_by: input.actorId }).select("id").single();
    if (error || !data) throw new Error("Session preparation is unavailable.");
    const { error: eventError } = await supabase.from("florida_ron_session_assistant_events").insert({ session_id: data.id, organization_id: input.organizationId, actor_id: input.actorId, event_type: "prepared", payload: eventPayload });
    if (eventError) throw new Error("Session preparation is unavailable.");
    return { id: String(data.id) };
  },
  async updateFloridaRonPreparedAttempt(input: { organizationId: string; appointmentId: string; actorId: string; parameters: FloridaRonPrepareInput; modules: FloridaRonModule[]; stopReason: AssistantStopReason | null }) {
    const current = !hasSupabaseServiceConfig() ? await devStore.getFloridaRonPreparedSession(input.organizationId, input.appointmentId) : await getSupabaseAdmin().from("florida_ron_session_assistant_sessions").select("id,parameters,module_versions,workflow_version").eq("organization_id", input.organizationId).eq("appointment_request_id", input.appointmentId).eq("state", "prepared").order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data, error }) => { if (error) throw error; return data; });
    if (!current) return null;
    const payload = { previousParameters: current.parameters, nextParameters: input.parameters, workflowVersion: current.workflow_version, previousModuleVersions: current.module_versions, nextModuleVersions: input.modules, stopReason: input.stopReason };
    if (!hasSupabaseServiceConfig()) return devStore.updateFloridaRonPreparedSession(current.id, input.organizationId, input.parameters, input.modules, input.stopReason, { organization_id: input.organizationId, actor_id: input.actorId, event_type: "parameters_changed", payload });
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("florida_ron_session_assistant_sessions").update({ parameters: input.parameters, stop_reason: input.stopReason, module_versions: input.modules }).eq("id", current.id).eq("organization_id", input.organizationId).eq("state", "prepared");
    if (error) throw error;
    const { error: eventError } = await supabase.from("florida_ron_session_assistant_events").insert({ session_id: current.id, organization_id: input.organizationId, actor_id: input.actorId, event_type: "parameters_changed", payload });
    if (eventError) throw eventError;
    return { id: String(current.id) };
  },
  async getFloridaRonHistory(organizationId: string, appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return devStore.getFloridaRonHistory(organizationId, appointmentId);
    const supabase = getSupabaseAdmin();
    const { data: sessions, error } = await supabase.from("florida_ron_session_assistant_sessions").select("id,workflow_version,specification_status,state,outcome,stop_reason,parameters,module_versions,provider_reference,created_at,started_at,completed_or_stopped_at").eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).order("created_at", { ascending: false });
    if (error) throw error;
    return Promise.all((sessions ?? []).map(async (session) => { const { data: events, error: eventError } = await supabase.from("florida_ron_session_assistant_events").select("id,event_type,payload,actor_id,created_at").eq("organization_id", organizationId).eq("session_id", session.id).order("created_at", { ascending: true }); if (eventError) throw eventError; return { ...session, events: events ?? [] }; }));
  },
  async transitionFloridaRonPreparedAttempt(input: { organizationId: string; appointmentId: string; actorId: string; state: "stopped" | "preview_completed"; outcome: string; stopReason: AssistantStopReason | null; eventType: "preview_stopped" | "preview_completed"; payload: Record<string, unknown> }) {
    if (!hasSupabaseServiceConfig()) { const current = await devStore.getFloridaRonPreparedSession(input.organizationId, input.appointmentId); return current ? devStore.transitionFloridaRonPreparedSession(current.id, input.organizationId, input.state, input.outcome, input.stopReason, { organization_id: input.organizationId, actor_id: input.actorId, event_type: input.eventType, payload: input.payload }) : null; }
    const supabase = getSupabaseAdmin(); const { data: current, error } = await supabase.from("florida_ron_session_assistant_sessions").select("id").eq("organization_id", input.organizationId).eq("appointment_request_id", input.appointmentId).eq("state", "prepared").order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) throw error; if (!current) return null;
    const { error: updateError } = await supabase.from("florida_ron_session_assistant_sessions").update({ state: input.state, outcome: input.outcome, stop_reason: input.stopReason, completed_or_stopped_at: new Date().toISOString() }).eq("id", current.id).eq("organization_id", input.organizationId).eq("state", "prepared"); if (updateError) throw updateError;
    const { error: eventError } = await supabase.from("florida_ron_session_assistant_events").insert({ session_id: current.id, organization_id: input.organizationId, actor_id: input.actorId, event_type: input.eventType, payload: input.payload }); if (eventError) throw eventError;
    return { id: String(current.id) };
  },
  async createFloridaRonProductionAttempt(input: Omit<FloridaRonProductionAttempt, "id" | "createdAt" | "startedAt" | "terminalAt">) {
    if (!hasSupabaseServiceConfig()) return devStore.createFloridaRonProductionAttempt(input);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("florida_ron_production_attempts").insert({ organization_id: input.organizationId, appointment_request_id: input.appointmentId, prepared_session_id: input.preparedSessionId, workflow_version: input.workflowVersion, prepared_parameters: input.preparedParameters, module_versions: input.modules, state: input.state, current_module_index: input.currentModuleIndex, stop_reason: null, created_by: input.createdBy }).select("*").single();
    if (error || !data) throw new Error("Production attempt creation is unavailable.");
    await supabase.from("florida_ron_production_events").insert([{ attempt_id: data.id, organization_id: input.organizationId, actor_id: input.createdBy, event_type: "attempt_created", payload: { workflowVersion: input.workflowVersion, preparedSessionId: input.preparedSessionId, moduleVersions: input.modules } }, { attempt_id: data.id, organization_id: input.organizationId, actor_id: input.createdBy, event_type: "attempt_started", payload: { currentModuleIndex: 0, module: input.modules[0] ?? null } }]);
    return mapFloridaRonProductionAttempt(data);
  },
  async getFloridaRonProductionAttempt(organizationId: string, appointmentId: string): Promise<FloridaRonProductionAttempt | null> {
    if (!hasSupabaseServiceConfig()) return devStore.getFloridaRonProductionAttempt(organizationId, appointmentId);
    const { data, error } = await getSupabaseAdmin().from("florida_ron_production_attempts").select("*").eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).eq("state", "in_progress").order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data ? mapFloridaRonProductionAttempt(data) : null;
  },
  async getFloridaRonProductionEvidence(organizationId: string, attemptId: string): Promise<FloridaRonProductionEvidence[]> {
    if (!hasSupabaseServiceConfig()) return devStore.getFloridaRonProductionEvidence(organizationId, attemptId);
    const { data, error } = await getSupabaseAdmin().from("florida_ron_production_evidence").select("*").eq("organization_id", organizationId).eq("attempt_id", attemptId).order("created_at", { ascending: true }); if (error) throw error; return (data ?? []).map(mapFloridaRonProductionEvidence);
  },
  async addFloridaRonProductionEvidence(organizationId: string, item: FloridaRonProductionEvidence) {
    if (!hasSupabaseServiceConfig()) return devStore.addFloridaRonProductionEvidence(item);
    const { error } = await getSupabaseAdmin().from("florida_ron_production_evidence").insert({ id: item.id, attempt_id: item.attemptId, organization_id: organizationId, module_id: item.moduleId, module_version: item.moduleVersion, requirement_id: item.requirementId, principal_index: item.principalIndex, value: item.value, source: item.source, actor_id: item.actorId, created_at: item.createdAt }); if (error) throw error; return item;
  },
  async getFloridaRonProductionAttemptById(attemptId: string): Promise<FloridaRonProductionAttempt | null> {
    if (!hasSupabaseServiceConfig()) return null;
    const { data, error } = await getSupabaseAdmin().from("florida_ron_production_attempts").select("*").eq("id", attemptId).maybeSingle(); if (error) throw error; return data ? mapFloridaRonProductionAttempt(data) : null;
  },
  async transitionFloridaRonProductionAttempt(input: { attemptId: string; organizationId: string; state: ProductionAttemptState; currentModuleIndex: number; stopReason: AssistantStopReason | null; actorId: string; eventType: string; payload: Record<string, unknown> }) {
    if (!hasSupabaseServiceConfig()) return devStore.transitionFloridaRonProductionAttempt(input.attemptId, input.organizationId, input.state, input.currentModuleIndex, input.stopReason, input.actorId, input.eventType, input.payload);
    const update: Record<string, unknown> = { current_module_index: input.currentModuleIndex, state: input.state, stop_reason: input.stopReason }; if (input.state === "stopped") update.terminal_at = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin().from("florida_ron_production_attempts").update(update).eq("id", input.attemptId).eq("organization_id", input.organizationId).eq("state", "in_progress").select("*").maybeSingle(); if (error) throw error; if (!data) return null;
    const { error: eventError } = await getSupabaseAdmin().from("florida_ron_production_events").insert({ attempt_id: input.attemptId, organization_id: input.organizationId, actor_id: input.actorId, event_type: input.eventType, payload: input.payload }); if (eventError) throw eventError; return mapFloridaRonProductionAttempt(data);
  },
  async getExternalSession(organizationId: string, appointmentId: string): Promise<ExternalSession | null> {
    if (!hasSupabaseServiceConfig()) return developmentExternalSessions.get(externalSessionKey(organizationId, appointmentId)) ?? null;
    const { data, error } = await getSupabaseAdmin().from("external_sessions").select("*").eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).maybeSingle();
    if (error?.code === "PGRST205") return null;
    if (error) throw error;
    return data ? mapExternalSession(data) : null;
  },
  async saveExternalSession(organizationId: string, appointmentId: string, input: ExternalSessionInput): Promise<ExternalSession> {
    if (!hasSupabaseServiceConfig()) {
      const existing = developmentExternalSessions.get(externalSessionKey(organizationId, appointmentId));
      const timestamp = new Date().toISOString();
      const session: ExternalSession = { organizationId, appointmentId, provider: input.provider, sessionName: input.sessionName, launchUrl: input.launchUrl ?? null, referenceNumber: input.referenceNumber ?? null, status: input.status, notes: input.notes ?? null, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, metadata: {} };
      developmentExternalSessions.set(externalSessionKey(organizationId, appointmentId), session);
      return session;
    }
    const existing = await this.getExternalSession(organizationId, appointmentId);
    const { data, error } = await getSupabaseAdmin().from("external_sessions").upsert({ organization_id: organizationId, appointment_request_id: appointmentId, provider: input.provider, session_name: input.sessionName, launch_url: input.launchUrl ?? null, reference_number: input.referenceNumber ?? null, status: input.status, notes: input.notes ?? null, metadata: {}, updated_at: new Date().toISOString() }, { onConflict: "organization_id,appointment_request_id" }).select().single();
    if (error) throw error;
    const saved = mapExternalSession(data);
    const previousVisible = existing ? ["scheduled", "ready", "in_progress"].includes(existing.status) : false;
    const visible = ["scheduled", "ready", "in_progress"].includes(saved.status);
    const audit = getSupabaseAdmin();
    await audit.from("audit_logs").insert({ organization_id: organizationId, action: existing ? "external_session.updated" : "external_session.created", entity_type: "appointment_request", entity_id: appointmentId, metadata: { provider: saved.provider, previousStatus: existing?.status ?? null, status: saved.status, actorType: "staff", hasLaunchUrl: Boolean(saved.launchUrl) } });
    if (visible !== previousVisible) await audit.from("audit_logs").insert({ organization_id: organizationId, action: visible ? "external_session.customer_visible" : "external_session.customer_hidden", entity_type: "appointment_request", entity_id: appointmentId, metadata: { provider: saved.provider, previousStatus: existing?.status ?? null, status: saved.status, actorType: "staff", previousVisible, visible, hasLaunchUrl: Boolean(saved.launchUrl) } });
    if (visible && !previousVisible) {
      const { data: row } = await audit.from("appointment_requests").select("*, customers(*)").eq("organization_id", organizationId).eq("id", appointmentId).maybeSingle();
      if (row) {
        const appointment = mapAppointment(row);
        const { data: payment } = await audit.from("appointment_payments").select("status").eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (isCustomerVisibleExternalSession({ paymentStatus: payment?.status ?? null, appointmentStatus: appointment.status, organizationId, appointmentId, session: saved }) && appointment.customer.email) {
          const access = await createAppointmentAccessLink(appointment, "external_session_available");
          // `updated_at` is the persisted result of this hidden→visible mutation. The trigger
          // boundary prevents visible→visible edits from using it to enqueue another message.
          if (access) await enqueueAndProcessEmail(audit, { organizationId, appointmentId, customerId: appointment.customerId, type: "external_session_available", recipient: appointment.customer.email, subject: renderEmailSubject("external_session_available", (await loadOrganizationSettings()).business.businessName), html: renderEmailTemplate({ greetingName: appointment.customer.fullName, body: "Your online notarization session is ready. Avenseal coordinates scheduling, payment, preparation, and Client Workspace access. BlueNotary performs identity verification and the live online notarization.", actionLabel: "Open Your Appointment", actionUrl: access.url, footer: "Open your appointment through Avenseal to continue securely." }), idempotencyDiscriminator: saved.updatedAt });
        }
      }
    }
    return saved;
  },
  async removeExternalSession(organizationId: string, appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return developmentExternalSessions.delete(externalSessionKey(organizationId, appointmentId));
    const existing = await this.getExternalSession(organizationId, appointmentId);
    const { error } = await getSupabaseAdmin().from("external_sessions").delete().eq("organization_id", organizationId).eq("appointment_request_id", appointmentId);
    if (error) throw error;
    if (existing) await getSupabaseAdmin().from("audit_logs").insert({ organization_id: organizationId, action: "external_session.removed", entity_type: "appointment_request", entity_id: appointmentId, metadata: { provider: existing.provider, previousStatus: existing.status, actorType: "staff", hasLaunchUrl: Boolean(existing.launchUrl) } });
    return true;
  },
  async recordExternalSessionOpened(organizationId: string, appointmentId: string, provider: string) {
    if (!hasSupabaseServiceConfig()) return;
    const { error } = await getSupabaseAdmin().from("audit_logs").insert({ organization_id: organizationId, action: "external_session.customer_opened", entity_type: "appointment_request", entity_id: appointmentId, metadata: { provider, actorType: "customer" } });
    if (error) throw error;
  },
  async issueClientWorkspaceToken(input: { organizationId: string; appointmentId: string; expiresAt: string; createdBy?: string | null }) {
    const token = generateAppointmentAccessToken();
    const tokenHash = hashAppointmentAccessToken(token);
    const issuedAt = new Date().toISOString();
    if (!hasSupabaseServiceConfig()) {
      const record: ClientWorkspaceAccessToken & { tokenHash: string } = { identifier: randomUUID(), organizationId: input.organizationId, appointmentId: input.appointmentId, expiresAt: input.expiresAt, issuedAt, revokedAt: null, lastAccessedAt: null, purpose: "client_workspace", createdBy: input.createdBy ?? null, tokenHash };
      developmentClientWorkspaceTokens.set(record.identifier, record);
      return { token, record: mapClientWorkspaceToken({ id: record.identifier, organization_id: record.organizationId, appointment_request_id: record.appointmentId, expires_at: record.expiresAt, issued_at: record.issuedAt, revoked_at: null, last_used_at: null, purpose: record.purpose, created_by: record.createdBy }) };
    }
    const { data, error } = await getSupabaseAdmin().from("appointment_access_tokens").insert({ organization_id: input.organizationId, appointment_request_id: input.appointmentId, token_hash: tokenHash, expires_at: input.expiresAt, issued_at: issuedAt, purpose: "client_workspace", created_by: input.createdBy ?? null }).select("id,organization_id,appointment_request_id,expires_at,issued_at,revoked_at,last_used_at,purpose,created_by").single();
    if (error) throw error;
    return { token, record: mapClientWorkspaceToken(data) };
  },
  async validateClientWorkspaceToken(token: string, now = new Date()): Promise<ClientWorkspaceAccessToken | null> {
    const tokenHash = hashAppointmentAccessToken(token);
    if (!hasSupabaseServiceConfig()) {
      const record = [...developmentClientWorkspaceTokens.values()].find((item) => appointmentAccessTokenHashesEqual(tokenHash, item.tokenHash) && !item.revokedAt && Date.parse(item.expiresAt) > now.getTime()) ?? null;
      if (!record) return null;
      const updated = { ...record, lastAccessedAt: now.toISOString() };
      developmentClientWorkspaceTokens.set(updated.identifier, updated);
      return mapClientWorkspaceToken({ id: updated.identifier, organization_id: updated.organizationId, appointment_request_id: updated.appointmentId, expires_at: updated.expiresAt, issued_at: updated.issuedAt, revoked_at: updated.revokedAt, last_used_at: updated.lastAccessedAt, purpose: updated.purpose, created_by: updated.createdBy });
    }
    const { data, error } = await getSupabaseAdmin().from("appointment_access_tokens").select("id,organization_id,appointment_request_id,token_hash,expires_at,issued_at,revoked_at,last_used_at,purpose,created_by").eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", now.toISOString()).maybeSingle();
    if (error) throw error;
    if (!data || !appointmentAccessTokenHashesEqual(tokenHash, data.token_hash)) return null;
    await getSupabaseAdmin().from("appointment_access_tokens").update({ last_used_at: now.toISOString() }).eq("id", data.id).eq("organization_id", data.organization_id);
    return mapClientWorkspaceToken({ ...data, last_used_at: now.toISOString() });
  },
  async revokeClientWorkspaceToken(organizationId: string, tokenIdentifier: string, now = new Date()) {
    if (!hasSupabaseServiceConfig()) { const record = developmentClientWorkspaceTokens.get(tokenIdentifier); if (!record || record.organizationId !== organizationId) return false; developmentClientWorkspaceTokens.set(tokenIdentifier, { ...record, revokedAt: now.toISOString() }); return true; }
    const { data, error } = await getSupabaseAdmin().from("appointment_access_tokens").update({ revoked_at: now.toISOString() }).eq("id", tokenIdentifier).eq("organization_id", organizationId).is("revoked_at", null).select("id").maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },
  async revokeClientWorkspaceTokensForAppointment(organizationId: string, appointmentId: string, now = new Date()) {
    if (!hasSupabaseServiceConfig()) {
      let revoked = 0;
      for (const record of developmentClientWorkspaceTokens.values()) if (record.organizationId === organizationId && record.appointmentId === appointmentId && !record.revokedAt) { developmentClientWorkspaceTokens.set(record.identifier, { ...record, revokedAt: now.toISOString() }); revoked++; }
      return revoked;
    }
    const { data, error } = await getSupabaseAdmin().from("appointment_access_tokens").update({ revoked_at: now.toISOString() }).eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).eq("purpose", "client_workspace").is("revoked_at", null).select("id");
    if (error) throw error;
    return data.length;
  },
  async getClientWorkspaceAccessMetadata(organizationId: string, appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return [...developmentClientWorkspaceTokens.values()].filter((item) => item.organizationId === organizationId && item.appointmentId === appointmentId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0] ?? null;
    const { data, error } = await getSupabaseAdmin().from("appointment_access_tokens").select("id,organization_id,appointment_request_id,expires_at,issued_at,revoked_at,last_used_at,purpose,created_by").eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).eq("purpose", "client_workspace").order("issued_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapClientWorkspaceToken(data) : null;
  },
  async rotateClientWorkspaceToken(appointment: AppointmentRequest, reason: string, createdBy?: string | null) {
    await repository.revokeClientWorkspaceTokensForAppointment(appointment.organizationId, appointment.id);
    const issued = await repository.issueClientWorkspaceToken({ organizationId: appointment.organizationId, appointmentId: appointment.id, expiresAt: clientWorkspaceExpiration(appointment), createdBy });
    if (hasSupabaseServiceConfig()) await getSupabaseAdmin().from("audit_logs").insert({ organization_id: appointment.organizationId, action: "client_workspace.access_rotated", entity_type: "appointment_request", entity_id: appointment.id, metadata: { tokenId: issued.record.identifier, reason, expiresAt: issued.record.expiresAt } });
    return issued;
  },
  async sendClientWorkspaceAccess(appointment: AppointmentRequest, reason: string, createdBy?: string | null) {
    const access = await repository.rotateClientWorkspaceToken(appointment, reason, createdBy);
    const settings = await loadOrganizationSettings();
    let delivery: EmailDeliveryResult;
    try {
      delivery = await enqueueAndProcessEmail(getSupabaseAdmin(), { organizationId: appointment.organizationId, appointmentId: appointment.id, customerId: appointment.customerId, type: "booking_confirmation", recipient: appointment.customer.email, subject: "Your new Avenseal appointment link", html: renderEmailTemplate({ greetingName: appointment.customer.fullName, body: "Your previous appointment links are no longer active. View your appointment and prepare for your online notarization.", actionLabel: "View My Appointment", actionUrl: `${getServerEnv().NEXT_PUBLIC_SITE_URL}/appointments/access/${encodeURIComponent(access.token)}`, footer: `Questions? Contact ${settings.business.supportEmail}.` }) });
    } catch {
      delivery = { status: "failed", providerMessageId: null, error: "Email delivery could not be completed." };
    }
    await getSupabaseAdmin().from("audit_logs").insert({ organization_id: appointment.organizationId, action: delivery.status === "sent" ? "client_workspace.email_sent" : "client_workspace.email_failed", entity_type: "appointment_request", entity_id: appointment.id, metadata: { tokenId: access.record.identifier, reason, delivery: delivery.status } });
    return { record: access.record, delivery };
  },
  async requestClientWorkspaceLink(email: string) {
    if (!hasSupabaseServiceConfig()) return;
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin().from("appointment_requests").select("*, customers!inner(*)").eq("organization_id", organizationId).ilike("customers.email", normalizeClientWorkspaceEmail(email)).in("status", ["awaiting_review", "awaiting_payment", "approved_pending_payment", "confirmed", "ready"]).order("preferred_date", { ascending: true }).order("preferred_time", { ascending: true }).limit(1);
    if (error) throw error;
    const match = data?.[0] ? mapAppointment(data[0]) : null;
    if (!match) return;
    const access = await repository.rotateClientWorkspaceToken(match, "customer_request");
    const settings = await loadOrganizationSettings();
    await enqueueAndProcessEmail(getSupabaseAdmin(), { organizationId, appointmentId: match.id, customerId: match.customerId, type: "booking_confirmation", recipient: match.customer.email, subject: "Your new Avenseal appointment link", html: renderEmailTemplate({ greetingName: match.customer.fullName, body: "Your previous appointment links are no longer active.", actionLabel: "View My Appointment", actionUrl: `${getServerEnv().NEXT_PUBLIC_SITE_URL}/appointments/access/${encodeURIComponent(access.token)}`, footer: `Questions? Contact ${settings.business.supportEmail}.` }) });
  },
  async updateAppointment(id: string, update: { status?: AppointmentStatus; serviceId?: string; preferredDate?: string; preferredTime?: string; note?: string }) {
    if (!hasSupabaseServiceConfig()) {
      const previous = await devStore.getAppointment(id);
      if (!previous) throw new Error("Appointment not found.");
      if (update.serviceId && update.serviceId !== previous.serviceId) {
        if (!["awaiting_review", "clarification_needed"].includes(previous.status)) {
          throw new Error("The service cannot be changed after payment approval.");
        }
        const service = await loadBookableAppointmentService(previous.organizationId, update.serviceId);
        const requestedDate = update.preferredDate ?? previous.preferredDate;
        const requestedTime = normalizeTime(update.preferredTime ?? previous.preferredTime);
        const availability = await getAvailableAppointmentSlots({
          organizationId: previous.organizationId,
          serviceId: service.id,
          date: requestedDate,
          excludeAppointmentId: previous.id
        });
        if (!availability.slots.some((slot) =>
          localTimeForAppointmentSlot(slot.startAt, availability.timezone) === requestedTime
        )) {
          throw new Error("Selected appointment time is outside current availability.");
        }
      }
      return devStore.updateAppointment(id, update);
    }
    const supabase = getSupabaseAdmin();
    const previous = await repository.getAppointment(id);
    if (!previous) throw new Error("Appointment not found.");
    const organizationId = previous.organizationId;
    const patch: Record<string, unknown> = {};
    const serviceChanged = Boolean(update.serviceId && update.serviceId !== previous.serviceId);
    if (serviceChanged) {
      if (!["awaiting_review", "clarification_needed"].includes(previous.status)) {
        throw new Error("The service cannot be changed after payment approval.");
      }
      const service = await loadBookableAppointmentService(organizationId, update.serviceId!);
      const snapshot = buildAppointmentServiceSnapshot(service, organizationId);
      const requestedDate = update.preferredDate ?? previous.preferredDate;
      const requestedTime = normalizeTime(update.preferredTime ?? previous.preferredTime);
      const availability = await getAvailableAppointmentSlots({
        organizationId,
        serviceId: service.id,
        date: requestedDate,
        excludeAppointmentId: previous.id
      });
      if (!availability.slots.some((slot) =>
        localTimeForAppointmentSlot(slot.startAt, availability.timezone) === requestedTime
      )) {
        throw new Error("Selected appointment time is outside current availability.");
      }
      Object.assign(patch, {
        service_id: snapshot.serviceId,
        service_name_snapshot: snapshot.serviceNameSnapshot,
        service_duration_minutes_snapshot: snapshot.serviceDurationMinutesSnapshot,
        service_price_cents_snapshot: snapshot.servicePriceCentsSnapshot,
        service_currency_snapshot: snapshot.serviceCurrencySnapshot
      });
    }
    if (update.status) patch.status = update.status;
    if (update.preferredDate) patch.preferred_date = update.preferredDate;
    if (update.preferredTime) patch.preferred_time = update.preferredTime;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("appointment_requests")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", id)
      .select("*, customers(*)")
      .single();
    if (error) throw error;
    if (update.status && previous?.status !== update.status) {
      await supabase.from("status_history").insert({
        organization_id: organizationId,
        appointment_request_id: id,
        from_status: previous?.status ?? null,
        to_status: update.status,
        reason: "Admin status update."
      });
      await supabase.from("audit_logs").insert({
        organization_id: organizationId,
        action: "appointment.status_changed",
        entity_type: "appointment_request",
        entity_id: id,
        metadata: { from: previous?.status, to: update.status }
      });
    }
    if (update.note) {
      await supabase.from("internal_notes").insert({
        organization_id: organizationId,
        appointment_request_id: id,
        body: update.note
      });
    }
    if (serviceChanged) {
      await supabase.from("audit_logs").insert({
        organization_id: organizationId,
        action: "appointment.service_changed",
        entity_type: "appointment_request",
        entity_id: id,
        metadata: {
          fromServiceId: previous.serviceId,
          toServiceId: update.serviceId
        }
      });
    }
    const mapped = mapAppointment(data);
    if (update.status === "cancelled") await cancelAppointmentReminders(supabase, id);
    if (update.preferredDate || update.preferredTime) {
      await cancelAppointmentReminders(supabase, id);
      const settings = await loadOrganizationSettings();
      await scheduleAppointmentReminders(supabase, {
        organizationId,
        appointmentId: id,
        startsAt: new Date(`${mapped.preferredDate}T${mapped.preferredTime}:00-04:00`),
        settings: settings.communications
      });
    }
    const calendarRelevantUpdate =
      (update.status !== undefined && ["confirmed", "ready", "cancelled"].includes(update.status)) ||
      (["confirmed", "ready"].includes(previous.status) &&
        Boolean(update.preferredDate || update.preferredTime || serviceChanged));
    if (calendarRelevantUpdate) {
      await synchronizeCalendarAfterSave(organizationId, id);
    }
    return mapped;
  },
  async rescheduleAppointment(input: { appointmentId: string; organizationId: string; actorUserId: string; preferredDate: string; preferredTime: string }) {
    const previous = await repository.getAppointment(input.appointmentId);
    if (!previous || previous.organizationId !== input.organizationId) throw new Error("Appointment not found.");
    if (!previous.serviceId) throw new Error("This legacy appointment cannot be safely rescheduled.");

    const requestedTime = normalizeTime(input.preferredTime);
    let availability: Awaited<ReturnType<typeof getAvailableAppointmentSlots>>;
    try {
      availability = await getAvailableAppointmentSlots({
        organizationId: input.organizationId,
        serviceId: previous.serviceId,
        date: input.preferredDate,
        excludeAppointmentId: previous.id
      });
    } catch {
      throw new AdminAppointmentRescheduleDiagnosticError("availability_preflight_failed", "Selected appointment time is outside current availability.");
    }
    if (!availability.slots.some((slot) => localTimeForAppointmentSlot(slot.startAt, availability.timezone) === requestedTime)) {
      throw new AdminAppointmentRescheduleDiagnosticError("availability_preflight_failed", "Selected appointment time is outside current availability.");
    }

    if (!hasSupabaseServiceConfig()) {
      const appointment = await devStore.updateAppointment(previous.id, { preferredDate: input.preferredDate, preferredTime: requestedTime });
      return { appointment, calendarSyncStatus: "skipped" as const };
    }

    let data: unknown;
    try {
      const result = await getSupabaseAdmin().rpc("reschedule_admin_appointment", {
        p_organization_id: input.organizationId,
        p_appointment_id: previous.id,
        p_preferred_date: input.preferredDate,
        p_preferred_time: requestedTime,
        p_actor_user_id: input.actorUserId
      });
      if (result.error) throw result.error;
      data = result.data;
    } catch (error) {
      throw new AdminAppointmentRescheduleDiagnosticError(mapAdminAppointmentRescheduleRpcDiagnostic(error), "The appointment could not be rescheduled.");
    }
    const appointment = await repository.getAppointment(previous.id);
    if (!appointment) throw new AdminAppointmentRescheduleDiagnosticError("rpc_not_found", "The appointment could not be rescheduled.");

    let settings: OrganizationSettings;
    try {
      settings = await loadOrganizationSettings();
      const range = appointmentDateTimeRange({
        preferredDate: appointment.preferredDate,
        preferredTime: appointment.preferredTime,
        timezone: settings.business.timezone,
        serviceDurationMinutesSnapshot: appointment.serviceDurationMinutesSnapshot,
        defaultDurationMinutes: settings.rules.defaultDurationMinutes
      });
      await cancelAppointmentReminders(getSupabaseAdmin(), appointment.id);
      await scheduleAppointmentReminders(getSupabaseAdmin(), {
        organizationId: appointment.organizationId,
        appointmentId: appointment.id,
        startsAt: new Date(range.startsAt),
        settings: settings.communications
      });
    } catch {
      throw new AdminAppointmentRescheduleDiagnosticError("unexpected_database_error", "The appointment could not be rescheduled.");
    }

    const rescheduleCount = Number((data as Array<{ reschedule_count?: unknown }> | null)?.[0]?.reschedule_count ?? 0);
    try {
      await enqueueAndProcessEmail(getSupabaseAdmin(), {
        organizationId: appointment.organizationId,
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        type: "appointment_rescheduled",
        recipient: appointment.customer.email,
        subject: renderEmailSubject("appointment_rescheduled", settings.business.businessName),
        html: renderEmailTemplate({
          greetingName: appointment.customer.fullName,
          body: `Your appointment has been rescheduled to ${appointment.preferredDate} at ${appointment.preferredTime} (${settings.business.timezone}).`,
          footer: `Questions? Contact ${settings.business.supportEmail}${settings.business.supportPhone ? ` or ${settings.business.supportPhone}` : ""}.`
        }),
        idempotencyDiscriminator: `reschedule:${rescheduleCount}`
      });
    } catch {
      throw new AdminAppointmentRescheduleDiagnosticError("communication_failed", "The appointment could not be rescheduled.");
    }

    const calendar = await synchronizeCalendarAfterSave(appointment.organizationId, appointment.id);
    return { appointment, calendarSyncStatus: calendar?.status ?? "skipped" as const };
  },
  async listAppointmentRescheduleHistory(organizationId: string, appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return [] as Array<{ id: string; actorUserId: string | null; createdAt: string; previousDate: string; previousTime: string; preferredDate: string; preferredTime: string; timezone: string }>;
    const { data, error } = await getSupabaseAdmin().from("audit_logs")
      .select("id,actor_user_id,created_at,metadata")
      .eq("organization_id", organizationId)
      .eq("entity_type", "appointment_request")
      .eq("entity_id", appointmentId)
      .eq("action", "appointment.rescheduled")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const metadata = row.metadata as Record<string, unknown>;
      return {
        id: String(row.id), actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null, createdAt: String(row.created_at),
        previousDate: String(metadata.previousDate ?? ""), previousTime: String(metadata.previousTime ?? ""),
        preferredDate: String(metadata.preferredDate ?? ""), preferredTime: String(metadata.preferredTime ?? ""), timezone: String(metadata.timezone ?? "")
      };
    });
  },
  async listCustomers() {
    if (!hasSupabaseServiceConfig()) return devStore.listCustomers();
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("customers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      fullName: row.full_name,
      email: row.email,
      mobilePhone: row.mobile_phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },
  async getCustomer(id: string) {
    if (!hasSupabaseServiceConfig()) return devStore.getCustomer(id);
    const customers = await repository.listCustomers();
    return customers.find((customer) => customer.id === id) ?? null;
  },
  async getHistory(appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return devStore.getHistory(appointmentId);
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("status_history")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointmentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      appointmentRequestId: row.appointment_request_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      createdAt: row.created_at
    }));
  },
  async getNotes(appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return devStore.getNotes(appointmentId);
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("internal_notes")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointmentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      appointmentRequestId: row.appointment_request_id,
      body: row.body,
      createdAt: row.created_at
    }));
  },
  async listPayments(appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return [] as AppointmentPayment[];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("appointment_payments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointmentId)
      .order("created_at", { ascending: false });
    if (error && error.code !== "PGRST205") throw error;
    return (data ?? []).map(mapPayment);
  },
  async listCalendarEvents(appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return [] as CalendarEventMapping[];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_event_mappings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointmentId)
      .order("created_at", { ascending: false });
    if (error && error.code !== "PGRST205") throw error;
    return (data ?? []).map(mapCalendarEvent);
  },
  async listCommunications(appointmentId: string) {
    if (!hasSupabaseServiceConfig()) return [] as CommunicationMessage[];
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("communication_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointmentId)
      .order("created_at", { ascending: false });
    if (error && error.code !== "PGRST205") throw error;
    return (data ?? []).map(mapCommunication);
  },
  async listAdminCommunications(filters: { page?: number; status?: string; type?: string; includeArchived?: boolean } = {}): Promise<AdminCommunicationPage> {
    const pageSize = 25;
    const currentPage = Math.max(filters.page ?? 1, 1);
    if (!hasSupabaseServiceConfig()) return { records: [], currentPage, totalPages: 1, totalRecords: 0 };
    const organizationId = await resolvePublicOrganizationId();
    let query = getSupabaseAdmin()
      .from("admin_communications")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.type) query = query.eq("message_type", filters.type);
    if (!filters.includeArchived) query = query.is("archived_at", null);
    const { data, error, count } = await query
      .order("scheduled_for", { ascending: false, nullsFirst: false })
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
    if (error && error.code !== "PGRST205") throw error;
    const totalRecords = count ?? 0;
    return {
      records: (data ?? []).map(mapAdminCommunication),
      currentPage,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      totalRecords
    };
  },
  async getAdminCommunication(id: string): Promise<AdminCommunication | null> {
    if (!hasSupabaseServiceConfig()) return null;
    const organizationId = await resolvePublicOrganizationId();
    const { data, error } = await getSupabaseAdmin()
      .from("admin_communications")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error && error.code !== "PGRST205") throw error;
    return data ? mapAdminCommunication(data) : null;
  },
  async getCommunicationMetrics(): Promise<AdminCommunicationMetrics> {
    if (!hasSupabaseServiceConfig()) return { scheduled: 0, readyToQueue: 0, queued: 0, sent: 0, failed: 0 };
    const organizationId = await resolvePublicOrganizationId();
    const statuses = ["scheduled", "ready_to_queue", "queued", "sent", "failed"] as const;
    const counts = await Promise.all(statuses.map(async (status) => {
      const { count, error } = await getSupabaseAdmin()
        .from("admin_communications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .eq("status", status);
      if (error && error.code !== "PGRST205") throw error;
      return count ?? 0;
    }));
    return { scheduled: counts[0], readyToQueue: counts[1], queued: counts[2], sent: counts[3], failed: counts[4] };
  },
  async retryFailedCommunication(id: string, organizationId: string) {
    if (!hasSupabaseServiceConfig()) throw new Error("Communication retry requires Supabase-backed storage.");
    const { data, error } = await getSupabaseAdmin()
      .from("communication_messages")
      .update({ status: "queued", next_attempt_at: new Date().toISOString(), last_error: null })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Only failed communications can be retried.");
    return data;
  },
  async getCommunicationRetryTarget(input: { organizationId: string; communicationId: string }) {
    if (!hasSupabaseServiceConfig()) return null;
    const { data, error } = await getSupabaseAdmin()
      .from("communication_messages")
      .select("id,status")
      .eq("id", input.communicationId)
      .eq("organization_id", input.organizationId)
      .eq("status", "failed")
      .maybeSingle();
    if (error) throw error;
    return data ? { id: String(data.id), retryEligible: String(data.status) === "failed" } : null;
  },
  async setCommunicationArchived(input: { organizationId: string; communicationId: string; actorUserId: string; archived: boolean }) {
    if (!hasSupabaseServiceConfig()) throw new Error("Communication archiving requires Supabase-backed storage.");
    const { data, error } = await getSupabaseAdmin().rpc("set_communication_message_archived", {
      p_organization_id: input.organizationId,
      p_communication_id: input.communicationId,
      p_actor_user_id: input.actorUserId,
      p_archived: input.archived
    }).maybeSingle();
    if (error) throw error;
    const row = parseCommunicationArchiveRpcRow(data);
    return row ? { id: row.id, archivedAt: row.archived_at } : null;
  },
  async createPaymentLink(appointmentId: string, dependencies: { createCheckoutSession?: typeof createStripeCheckoutSession; now?: () => Date } = {}) {
    const createCheckoutSession = dependencies.createCheckoutSession ?? createStripeCheckoutSession;
    const now = dependencies.now ?? (() => new Date());
    const appointment = await repository.getAppointment(appointmentId);
    if (!appointment) throw new Error("Appointment not found.");
    if (appointment.status === "confirmed" || appointment.status === "completed") {
      throw new Error("Appointment is already paid or confirmed.");
    }
    if (!["awaiting_review", "clarification_needed", "approved_pending_payment"].includes(appointment.status)) {
      throw new Error("Appointment is not eligible for payment approval.");
    }
    if (!hasSupabaseServiceConfig()) throw new Error("Payment links require Supabase-backed storage.");

    const supabase = getSupabaseAdmin();
    const organizationId = appointment.organizationId;
    const { data: paidPayments, error: paidPaymentError } = await supabase
      .from("appointment_payments")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointment.id)
      .in("status", ["paid", "refunded", "partially_refunded"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (paidPaymentError && paidPaymentError.code !== "PGRST205") throw paidPaymentError;
    if ((paidPayments ?? []).length > 0) {
      throw new Error("Appointment already has a paid payment record.");
    }

    const obligation = await repository.ensureAppointmentPaymentObligation(appointment);
    const { data: existingPayments, error: existingPaymentError } = await supabase
      .from("appointment_payments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointment.id)
      .eq("status", "payment_link_created")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingPaymentError && existingPaymentError.code !== "PGRST205") throw existingPaymentError;

    const existingPayment = existingPayments?.[0] ?? obligation;
    const settings = await loadOrganizationSettings();
    if (!appointment.serviceId || !appointment.serviceNameSnapshot) {
      throw new Error("Appointment service must be assigned before payment approval.");
    }
    if (
      existingPayment?.checkout_url &&
      existingPayment.expires_at &&
      new Date(String(existingPayment.expires_at)).getTime() > Date.now()
    ) {
      const payment = mapPayment(existingPayment);
      const delivery = await deliverPaymentRequestEmail({
        appointment,
        payment,
        settings,
        serviceName: appointment.serviceNameSnapshot
      });
      return { payment, delivery };
    }

    const lineItem = calculateAppointmentCheckoutLineItem(appointment);
    const expiresAt = calculatePaymentExpiration(now(), appointment.preferredDate, settings.rules);
    const idempotencyKey = `payment-link-${appointment.id}-${randomUUID()}`;
    const env = getServerEnv();
    const siteUrl = env.NEXT_PUBLIC_SITE_URL;
    let checkoutSessionId: string | null = null;
    let checkoutUrl = `${siteUrl}/booking/confirmation?payment=pending`;
    let paymentIntentId: string | null = null;

    if (env.STRIPE_SECRET_KEY) {
      const session = await createCheckoutSession({
        apiKey: env.STRIPE_SECRET_KEY,
        idempotencyKey,
        successUrl: `${siteUrl}/booking/confirmation?payment=success`,
        cancelUrl: `${siteUrl}/booking/confirmation?payment=cancelled`,
        customerEmail: appointment.customer.email,
        lineItem,
        metadata: { appointment_id: appointment.id, organization_id: organizationId, service_id: appointment.serviceId },
        expiresAt: Math.floor(expiresAt.getTime() / 1000)
      });
      checkoutSessionId = session.id;
      checkoutUrl = session.url;
      paymentIntentId = session.payment_intent ?? null;
    }

    const checkoutUpdate = {
        organization_id: organizationId,
        appointment_request_id: appointment.id,
        service_id: appointment.serviceId,
        amount_cents: lineItem.amountCents,
        currency: lineItem.currency,
        status: "payment_link_created",
        stripe_checkout_session_id: checkoutSessionId,
        stripe_payment_intent_id: paymentIntentId,
        checkout_url: checkoutUrl,
        expires_at: expiresAt.toISOString(),
        idempotency_key: idempotencyKey
      };
    const { data: payment, error: paymentError } = existingPayment
      ? await supabase.from("appointment_payments").update(checkoutUpdate).eq("id", existingPayment.id).eq("organization_id", organizationId).select().single()
      : await supabase.from("appointment_payments").insert(checkoutUpdate).select().single();
    if (paymentError) throw paymentError;

    await supabase.from("slot_reservations").insert({
      organization_id: organizationId,
      appointment_request_id: appointment.id,
      reserved_date: appointment.preferredDate,
      reserved_time: appointment.preferredTime,
      duration_minutes: resolveAppointmentDuration(
        appointment.serviceDurationMinutesSnapshot,
        settings.rules.defaultDurationMinutes
      ),
      status: "active",
      expires_at: expiresAt.toISOString()
    });

    const previousStatus = appointment.status;
    await supabase
      .from("appointment_requests")
      .update({ status: "approved_pending_payment", approved_for_payment_at: new Date().toISOString(), payment_due_at: expiresAt.toISOString(), updated_at: new Date().toISOString() })
      .eq("id", appointment.id);
    await supabase.from("status_history").insert({
      organization_id: organizationId,
      appointment_request_id: appointment.id,
      from_status: previousStatus,
      to_status: "approved_pending_payment",
      reason: "Approved for payment. Payment link created."
    });
    const mappedPayment = mapPayment(payment);
    const delivery = await deliverPaymentRequestEmail({
      appointment,
      payment: mappedPayment,
      settings,
      serviceName: appointment.serviceNameSnapshot
    });
    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      action: "payment.link_created",
      entity_type: "appointment_request",
      entity_id: appointment.id,
      metadata: { amountCents: lineItem.amountCents, currency: lineItem.currency, noAdditionalFees: true }
    });
    return { payment: mappedPayment, delivery };
  },
  async confirmPaymentFromStripe(input: { providerEventId: string; eventType: string; checkoutSessionId?: string; paymentIntentId?: string }) {
    if (!hasSupabaseServiceConfig()) throw new Error("Stripe webhooks require Supabase-backed storage.");
    const supabase = getSupabaseAdmin();
    const existing = await supabase.from("payment_events").select("id,processing_status").eq("provider", "stripe").eq("provider_event_id", input.providerEventId).maybeSingle();
    if (existing.data && existing.data.processing_status !== "failed") return { duplicate: true };

    const paymentQuery = input.checkoutSessionId
      ? supabase.from("appointment_payments").select("*").eq("stripe_checkout_session_id", input.checkoutSessionId).maybeSingle()
      : supabase.from("appointment_payments").select("*").eq("stripe_payment_intent_id", input.paymentIntentId).maybeSingle();
    const { data: payment, error: paymentError } = await paymentQuery;
    if (paymentError) throw paymentError;
    if (!payment) {
      const organizationId = await resolvePublicOrganizationId();
      await supabase.from("payment_events").insert({
        organization_id: organizationId,
        provider: "stripe",
        provider_event_id: input.providerEventId,
        event_type: input.eventType,
        processing_status: "ignored",
        safe_summary: "No matching payment record."
      });
      return { ignored: true };
    }

    // A PaymentIntent event is proof only for the payment record that already
    // owns that processor identifier. A session match alone must not let a
    // different PaymentIntent confirm the appointment.
    if (
      input.paymentIntentId &&
      payment.stripe_payment_intent_id &&
      input.paymentIntentId !== payment.stripe_payment_intent_id
    ) {
      await supabase.from("payment_events").insert({
        organization_id: payment.organization_id,
        payment_id: payment.id,
        provider: "stripe",
        provider_event_id: input.providerEventId,
        event_type: input.eventType,
        processing_status: "ignored",
        safe_summary: "Payment identifiers did not match."
      });
      return { ignored: true };
    }

    const organizationId = String(payment.organization_id);
    if (existing.data) {
      await supabase.from("payment_events").update({ processing_status: "received", processed_at: null, safe_summary: "Payment event retrying." }).eq("id", existing.data.id);
    } else {
      await supabase.from("payment_events").insert({
        organization_id: organizationId,
        payment_id: payment.id,
        provider: "stripe",
        provider_event_id: input.providerEventId,
        event_type: input.eventType,
        processing_status: "received",
        safe_summary: "Payment event received."
      });
    }

    try {
    const { data: appointmentRow, error: appointmentError } = await supabase
      .from("appointment_requests")
      .select("*, customers(*)")
      .eq("organization_id", organizationId)
      .eq("id", payment.appointment_request_id)
      .single();
    if (appointmentError) throw appointmentError;
    const appointment = mapAppointment(appointmentRow);
    // This is the payment-level idempotency boundary. PostgreSQL applies the
    // status predicate and update atomically, so only one Stripe success event
    // can win the local paid transition and execute its downstream workflow.
    const { data: finalizedPayment, error: finalizeError } = await supabase
      .from("appointment_payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: input.paymentIntentId ?? payment.stripe_payment_intent_id })
      .eq("id", payment.id)
      .eq("organization_id", organizationId)
      .in("status", ["payment_link_created", "payment_processing"])
      .select("id")
      .maybeSingle();
    if (finalizeError) throw finalizeError;
    if (!finalizedPayment) {
      await supabase.from("payment_events").update({ processing_status: "processed", processed_at: new Date().toISOString(), safe_summary: "Payment was already finalized." }).eq("provider", "stripe").eq("provider_event_id", input.providerEventId);
      return { duplicate: true };
    }
    if (appointment.status !== "confirmed") {
      await supabase
        .from("appointment_requests")
        .update({ status: "confirmed", paid_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("id", appointment.id);
      await supabase.from("status_history").insert({
        organization_id: organizationId,
        appointment_request_id: appointment.id,
        from_status: appointment.status,
        to_status: "confirmed",
        reason: "Stripe payment succeeded."
      });
      await sendStatusLink(appointment, "payment_confirmed");
    }
    await synchronizeCalendarAfterSave(organizationId, appointment.id);
    await supabase.from("slot_reservations").update({ status: "converted" }).eq("organization_id", organizationId).eq("appointment_request_id", appointment.id).eq("status", "active");
    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      action: "payment.confirmed",
      entity_type: "appointment_payment",
      entity_id: payment.id,
      metadata: { eventType: input.eventType }
    });
    await supabase.from("payment_events").update({ processing_status: "processed", processed_at: new Date().toISOString(), safe_summary: "Payment event processed." }).eq("provider", "stripe").eq("provider_event_id", input.providerEventId);
    return { confirmed: true };
    } catch (error) {
      await supabase.from("payment_events").update({ processing_status: "failed", safe_summary: "Payment event processing failed." }).eq("provider", "stripe").eq("provider_event_id", input.providerEventId);
      throw error;
    }
  },
  async getCustomerAppointmentByAccessToken(token: string): Promise<CustomerAppointmentStatus | null> {
    if (!hasSupabaseServiceConfig()) return null;
    const tokenHash = hashAppointmentAccessToken(token);
    const supabase = getSupabaseAdmin();
    const { data: tokens, error: tokenError } = await supabase
      .from("appointment_access_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (tokenError?.code === "PGRST205") return null;
    if (tokenError) throw tokenError;
    const tokenRecord = tokens?.[0];
    if (!tokenRecord || !appointmentAccessTokenHashesEqual(tokenHash, tokenRecord.token_hash)) return null;

    await supabase.from("audit_logs").insert({ organization_id: tokenRecord.organization_id, action: "client_workspace.access_opened", entity_type: "appointment_request", entity_id: tokenRecord.appointment_request_id, metadata: { tokenId: tokenRecord.id, actorType: "customer" } });

    await supabase
      .from("appointment_access_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRecord.id);

    const { data: appointmentRow, error: appointmentError } = await supabase
      .from("appointment_requests")
      .select("*, customers(*)")
      .eq("organization_id", tokenRecord.organization_id)
      .eq("id", tokenRecord.appointment_request_id)
      .single();
    if (appointmentError) return null;
    const appointment = mapAppointment(appointmentRow);
    const settings = await loadOrganizationSettings();
    const { data: paymentRows, error: paymentError } = await supabase
      .from("appointment_payments")
      .select("*")
      .eq("organization_id", tokenRecord.organization_id)
      .eq("appointment_request_id", appointment.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (paymentError && paymentError.code !== "PGRST205") throw paymentError;
    const payment = paymentRows?.[0] ? mapPayment(paymentRows[0]) : null;
    const { data: calendarRows, error: calendarError } = await supabase
      .from("calendar_event_mappings")
      .select("meet_url,status")
      .eq("organization_id", tokenRecord.organization_id)
      .eq("appointment_request_id", appointment.id)
      .in("status", ["created", "updated"])
      .limit(1);
    if (calendarError && calendarError.code !== "PGRST205") throw calendarError;
    return {
      appointmentId: appointment.id,
      organizationId: appointment.organizationId,
      reference: referenceCode(appointment.id),
      customerName: appointment.customer.fullName,
      customerEmail: appointment.customer.email,
      status: appointment.status,
      customerStatusLabel: customerStatusLabel(appointment.status),
      preferredDate: appointment.preferredDate,
      preferredTime: appointment.preferredTime,
      timezone: settings.business.timezone,
      serviceName: appointment.serviceNameSnapshot ?? "Remote online notarization appointment",
      paymentStatus: payment?.status ?? null,
      amountDueCents: payment?.amountCents ?? appointment.servicePriceCentsSnapshot,
      currency: payment?.currency ?? appointment.serviceCurrencySnapshot ?? "USD",
      checkoutUrl: payment?.status === "payment_link_created" ? payment.checkoutUrl : null,
      paymentExpiresAt: payment?.expiresAt ?? null,
      businessName: settings.business.businessName,
      businessEmail: settings.business.supportEmail,
      businessPhone: settings.business.supportPhone,
      meetingUrl: stringOrNull(calendarRows?.[0]?.meet_url)
    };
  },
  async requestCustomerStatusLink(input: { email: string; reference: string }) {
    if (!hasSupabaseServiceConfig()) return;
    const organizationId = await resolvePublicOrganizationId();
    const normalizedReference = input.reference.replaceAll("-", "").trim().toUpperCase();
    const { data, error } = await getSupabaseAdmin()
      .from("appointment_requests")
      .select("*, customers!inner(*)")
      .eq("organization_id", organizationId)
      .ilike("customers.email", input.email.trim())
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    const match = (data ?? [])
      .map(mapAppointment)
      .find((appointment) => referenceCode(appointment.id) === normalizedReference);
    if (match) await sendStatusLink(match, "appointment_request_received");
  },
  async getSettings() {
    return loadOrganizationSettings();
  },
  async getOrganizationSettings() {
    return repository.getSettings();
  },
  async listIntegrations() {
    const env = getServerEnv();
    if (!hasSupabaseServiceConfig()) {
      return [
        { provider: "google_calendar", status: "disconnected", accountLabel: null, lastConnectedAt: null, lastSyncedAt: null, lastError: null },
        { provider: "stripe", status: env.STRIPE_SECRET_KEY ? "test_mode" : "disconnected", accountLabel: "Stripe test mode", lastConnectedAt: null, lastSyncedAt: null, lastError: null },
        { provider: "gmail_smtp", status: env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD ? "connected" : "disconnected", accountLabel: env.SMTP_USER ?? null, lastConnectedAt: null, lastSyncedAt: null, lastError: null }
      ];
    }
    const organizationId = await resolvePublicOrganizationId();
    const googleStatus = await getGoogleConnectionStatus(organizationId);
    const { data, error } = await getSupabaseAdmin()
      .from("organization_integrations")
      .select("provider,status,account_label,last_connected_at,last_synced_at,last_error")
      .eq("organization_id", organizationId)
      .order("provider");
    if (error && error.code !== "PGRST205") throw error;
    const integrations = (data ?? []).map((row) => ({
      provider: String(row.provider),
      status: String(row.status),
      accountLabel: stringOrNull(row.account_label),
      lastConnectedAt: stringOrNull(row.last_connected_at),
      lastSyncedAt: stringOrNull(row.last_synced_at),
      lastError: stringOrNull(row.last_error)
    }));
    const googleIndex = integrations.findIndex((item) => item.provider === "google_calendar");
    const googleIntegration = {
      provider: "google_calendar",
      status: googleStatus.status,
      accountLabel: googleStatus.accountEmail,
      lastConnectedAt: googleStatus.lastVerifiedAt,
      lastSyncedAt: googleStatus.lastSuccessfulRefreshAt ?? googleStatus.lastVerifiedAt,
      lastError: googleStatus.lastErrorMessage,
      scopes: googleStatus.scopes
    };
    if (googleIndex >= 0) {
      integrations[googleIndex] = { ...integrations[googleIndex], ...googleIntegration };
    } else {
      integrations.unshift(googleIntegration);
    }
    return integrations;
  },
  async retryCalendarSyncs(organizationId: string, limit?: number) {
    if (!hasSupabaseServiceConfig()) return { attempted: 0, succeeded: 0, failed: 0 };
    return retryPendingCalendarSyncs({ organizationId, limit });
  },
  async updateOrganizationSettings(input: OrganizationSettingsInput) {
    if (!hasSupabaseServiceConfig()) return devStore.updateOrganizationSettings(input);
    const supabase = getSupabaseAdmin();
    const current = await loadOrganizationSettings();
    const organizationId = current.business.organizationId;

    const { error: orgError } = await supabase
      .from("organizations")
      .update({
        name: input.businessName,
        display_name: input.businessName,
        business_mode: input.businessMode,
        timezone: input.timezone,
        default_delivery_method: input.defaultDeliveryMethod,
        updated_at: new Date().toISOString()
      })
      .eq("id", organizationId);
    if (orgError) throw orgError;

    const { error: businessError } = await supabase
      .from("business_settings")
      .update({
        business_name: input.businessName,
        support_email: input.supportEmail,
        support_phone: input.supportPhone,
        website: input.website,
        description: input.description,
        timezone: input.timezone,
        default_delivery_method: input.defaultDeliveryMethod,
        pricing_headline: input.pricingHeadline,
        pricing_note: input.pricingNote
      })
      .eq("organization_id", organizationId);
    if (businessError) throw businessError;

    const { error: rulesError } = await supabase.from("appointment_rule_settings").upsert(
      {
        organization_id: organizationId,
        default_duration_minutes: input.defaultDurationMinutes,
        buffer_before_minutes: input.bufferBeforeMinutes,
        buffer_after_minutes: input.bufferAfterMinutes,
        minimum_booking_notice_minutes: input.minimumBookingNoticeMinutes,
        maximum_advance_booking_days: input.maximumAdvanceBookingDays,
        same_day_enabled: input.sameDayEnabled,
        maximum_appointments_per_day: input.maximumAppointmentsPerDay,
        customer_rescheduling_enabled: input.customerReschedulingEnabled,
        customer_cancellation_enabled: input.customerCancellationEnabled,
        emergency_appointment_enabled: input.emergencyAppointmentEnabled,
        automatic_approval_enabled: input.automaticApprovalEnabled
      },
      { onConflict: "organization_id" }
    );
    if (rulesError) throw rulesError;

    const { data: schedule, error: scheduleError } = await supabase
      .from("organization_availability_schedules")
      .upsert({ organization_id: organizationId, name: "Avenseal primary schedule", timezone: input.timezone, is_primary: true }, { onConflict: "organization_id" })
      .select("id")
      .single();
    if (scheduleError) throw scheduleError;

    const { error: deleteIntervalsError } = await supabase
      .from("organization_availability_intervals")
      .delete()
      .eq("organization_id", organizationId);
    if (deleteIntervalsError) throw deleteIntervalsError;

    if (input.intervals.length > 0) {
      const { error: intervalsError } = await supabase.from("organization_availability_intervals").insert(
        input.intervals.map((interval) => ({
          organization_id: organizationId,
          schedule_id: schedule.id,
          weekday: interval.weekday,
          start_time: interval.startTime,
          end_time: interval.endTime,
          display_order: interval.displayOrder
        }))
      );
      if (intervalsError) throw intervalsError;
    }

    const { data: existingService } = await supabase
      .from("organization_services")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("internal_name", "florida_remote_online_notarial_act")
      .maybeSingle();
    const servicePayload = {
      organization_id: organizationId,
      internal_name: "florida_remote_online_notarial_act",
      customer_name: input.serviceCustomerName,
      description: input.serviceDescription,
      base_price_cents: input.serviceBasePriceCents,
      currency: input.serviceCurrency,
      default_duration_minutes: input.defaultDurationMinutes,
      is_active: input.serviceActive,
      display_order: 1,
      delivery_type: "remote"
    };
    const { error: serviceError } = existingService
      ? await supabase.from("organization_services").update(servicePayload).eq("id", existingService.id)
      : await supabase.from("organization_services").insert(servicePayload);
    if (serviceError) throw serviceError;

    const { error: commsError } = await supabase.from("communication_settings").upsert(
      {
        organization_id: organizationId,
        sender_name: input.senderName,
        reply_to_email: input.replyToEmail,
        support_phone: input.communicationSupportPhone,
        email_reminders_enabled: input.emailRemindersEnabled,
        sms_reminders_enabled: input.smsRemindersEnabled,
        review_requests_enabled: input.reviewRequestsEnabled,
        confirmation_messaging_enabled: input.confirmationMessagingEnabled
      },
      { onConflict: "organization_id" }
    );
    if (commsError) throw commsError;

    const { error: conciergeError } = await supabase.from("ai_concierge_settings").upsert(
      {
        organization_id: organizationId,
        concierge_enabled: input.conciergeEnabled,
        display_name: input.conciergeDisplayName,
        greeting: input.conciergeGreeting,
        tone_preset: input.conciergeTonePreset,
        escalation_message: input.conciergeEscalationMessage,
        human_support_destination: input.humanSupportDestination,
        booking_assistance_enabled: input.bookingAssistanceEnabled,
        faq_assistance_enabled: input.faqAssistanceEnabled
      },
      { onConflict: "organization_id" }
    );
    if (conciergeError) throw conciergeError;

    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      action: "organization.settings_updated",
      entity_type: "organization",
      entity_id: organizationId,
      metadata: {
        businessModeChanged: current.business.businessMode !== input.businessMode,
        hoursChanged: JSON.stringify(current.intervals) !== JSON.stringify(input.intervals),
        profileChanged: current.business.businessName !== input.businessName || current.business.timezone !== input.timezone,
        servicePriceChanged: current.services[0]?.basePriceCents !== input.serviceBasePriceCents,
        safeSummary: "Organization configuration changed from admin settings."
      }
    });

    return loadOrganizationSettings();
  },
  async getAvailableSlots(date: string) {
    const settings = await loadOrganizationSettings();
    const service = settings.services.find((item) => item.isActive);
    if (!service) {
      return {
        date,
        timezone: settings.business.timezone,
        durationMinutes: settings.rules.defaultDurationMinutes,
        slots: [],
        closedDays: [0, 1, 2, 3, 4, 5, 6]
      };
    }
    const availability = await getAvailableAppointmentSlots({
      organizationId: settings.business.organizationId!,
      serviceId: service.id,
      date
    });
    const slots = availability.slots.map((slot) =>
      localTimeForAppointmentSlot(slot.startAt, availability.timezone)
    );
    return {
      date,
      timezone: availability.timezone,
      durationMinutes: availability.durationMinutes,
      slots,
      closedDays: weekdays
        .map((label, weekday) => ({ label, weekday, open: settings.intervals.some((interval) => interval.weekday === weekday) }))
        .filter((day) => !day.open)
        .map((day) => day.weekday)
    };
  },
  updateSettings: devStore.updateSettings
};
