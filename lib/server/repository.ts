import { createHash, randomBytes, randomUUID } from "node:crypto";
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
import type { EmailDeliveryResult } from "@/lib/server/email";
import { resolvePublicOrganization, resolvePublicOrganizationId } from "@/lib/server/organization";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";
import type {
  AiConciergeSettings,
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
  OrganizationSettings
} from "@/lib/types";
import type { BookingInput, OrganizationSettingsInput } from "@/lib/validation";

type SupabaseRow = Record<string, unknown>;

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
    privacyPolicyVersion: String(settings.privacy_policy_version ?? "legal-review-placeholder-2026-07"),
    termsVersion: String(settings.terms_version ?? "legal-review-placeholder-2026-07")
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

function mapCommunications(row: SupabaseRow | null): CommunicationSettings {
  return {
    senderName: String(row?.sender_name ?? "Avenseal"),
    replyToEmail: stringOrNull(row?.reply_to_email),
    supportPhone: stringOrNull(row?.support_phone),
    emailRemindersEnabled: Boolean(row?.email_reminders_enabled ?? false),
    smsRemindersEnabled: Boolean(row?.sms_reminders_enabled ?? false),
    reviewRequestsEnabled: Boolean(row?.review_requests_enabled ?? false),
    confirmationMessagingEnabled: Boolean(row?.confirmation_messaging_enabled ?? false)
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

async function createAppointmentAccessLink(appointment: AppointmentRequest, reason: string) {
  if (!hasSupabaseServiceConfig()) return null;
  const organizationId = appointment.organizationId;
  const token = generateAppointmentAccessToken();
  const tokenHash = hashAppointmentAccessToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  const { error } = await getSupabaseAdmin()
    .from("appointment_access_tokens")
    .insert({
      organization_id: organizationId,
      appointment_request_id: appointment.id,
      token_hash: tokenHash,
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
      body: "Your Avenseal appointment request has been received. You can securely check its status using the link below.",
      actionLabel: "Check Appointment Status",
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
    const calendarRelevantUpdate =
      (update.status !== undefined && ["confirmed", "ready", "cancelled"].includes(update.status)) ||
      (["confirmed", "ready"].includes(previous.status) &&
        Boolean(update.preferredDate || update.preferredTime || serviceChanged));
    if (calendarRelevantUpdate) {
      await synchronizeCalendarAfterSave(organizationId, id);
    }
    return mapped;
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
  async createPaymentLink(appointmentId: string) {
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

    const { data: existingPayments, error: existingPaymentError } = await supabase
      .from("appointment_payments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointment.id)
      .eq("status", "payment_link_created")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingPaymentError && existingPaymentError.code !== "PGRST205") throw existingPaymentError;

    const existingPayment = existingPayments?.[0];
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
    const expiresAt = calculatePaymentExpiration(new Date(), appointment.preferredDate, settings.rules);
    const idempotencyKey = `payment-link-${appointment.id}-${randomUUID()}`;
    const env = getServerEnv();
    const siteUrl = env.NEXT_PUBLIC_SITE_URL;
    let checkoutSessionId: string | null = null;
    let checkoutUrl = `${siteUrl}/booking/confirmation?payment=pending`;
    let paymentIntentId: string | null = null;

    if (env.STRIPE_SECRET_KEY) {
      const session = await createStripeCheckoutSession({
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

    const { data: payment, error: paymentError } = await supabase
      .from("appointment_payments")
      .insert({
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
      })
      .select()
      .single();
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
    const existing = await supabase.from("payment_events").select("id").eq("provider", "stripe").eq("provider_event_id", input.providerEventId).maybeSingle();
    if (existing.data) return { duplicate: true };

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

    const organizationId = String(payment.organization_id);
    await supabase.from("payment_events").insert({
      organization_id: organizationId,
      payment_id: payment.id,
      provider: "stripe",
      provider_event_id: input.providerEventId,
      event_type: input.eventType,
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      safe_summary: "Payment event processed."
    });

    const { data: appointmentRow, error: appointmentError } = await supabase
      .from("appointment_requests")
      .select("*, customers(*)")
      .eq("organization_id", organizationId)
      .eq("id", payment.appointment_request_id)
      .single();
    if (appointmentError) throw appointmentError;
    const appointment = mapAppointment(appointmentRow);
    await supabase
      .from("appointment_payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: input.paymentIntentId ?? payment.stripe_payment_intent_id })
      .eq("id", payment.id);
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
    return { confirmed: true };
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
    if (!tokenRecord) return null;

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
    const settings = await loadOrganizationSettings();
    return settings.business;
  },
  async getOrganizationSettings() {
    return loadOrganizationSettings();
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
