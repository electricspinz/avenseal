import type {
  AiConciergeSettings,
  AppointmentRequest,
  AppointmentRules,
  AppointmentStatus,
  AvailabilityException,
  AvailabilityInterval,
  BusinessSettings,
  CommunicationSettings,
  Customer,
  InternalNote,
  OrganizationService,
  OrganizationSettings,
  StatusHistoryEntry
} from "@/lib/types";
import type { BookingInput, OrganizationSettingsInput } from "@/lib/validation";
import type { AppointmentServiceSnapshot } from "@/lib/server/appointment-services";
import type { AssistantStopReason, FloridaRonModule, FloridaRonPrepareInput } from "@/lib/server/florida-ron-session-assistant";
import type { FloridaRonProductionAttempt, FloridaRonProductionEvidence, ProductionAttemptState } from "@/lib/server/florida-ron-production";

const organizationId = "00000000-0000-4000-8000-000000000001";
const serviceId = "00000000-0000-4000-8000-000000000002";
const now = new Date().toISOString();

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

const settings: BusinessSettings = {
  organizationId,
  businessName: "Avenseal LLC",
  supportEmail: "hello@avenseal.com",
  supportPhone: "(407) 555-0100",
  website: "https://avenseal.com",
  description: "Florida remote online notary appointments with concierge-level booking support.",
  timezone: "America/New_York",
  businessMode: "solo",
  defaultDeliveryMethod: "remote_online_notarization",
  pricingHeadline: "Clear pricing shown before your appointment is confirmed.",
  pricingNote: "Pricing content is awaiting business approval and can be updated in admin settings.",
  privacyPolicyVersion: "privacy-policy-2026-08-09",
  termsVersion: "terms-of-service-2026-08-09"
};

let rules: AppointmentRules = {
  defaultDurationMinutes: 30,
  bufferBeforeMinutes: null,
  bufferAfterMinutes: null,
  minimumBookingNoticeMinutes: null,
  maximumAdvanceBookingDays: null,
  sameDayEnabled: true,
  maximumAppointmentsPerDay: null,
  customerReschedulingEnabled: null,
  customerCancellationEnabled: null,
  emergencyAppointmentEnabled: null,
  automaticApprovalEnabled: false
};

let intervals: AvailabilityInterval[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: "09:30",
  endTime: "18:00",
  displayOrder: 0
}));

const exceptions: AvailabilityException[] = [];

let services: OrganizationService[] = [
  {
    id: serviceId,
    internalName: "remote_online_notarization",
    customerName: "Remote online notarization appointment",
    description: "Current service pricing is provided before payment is requested.",
    basePriceCents: null,
    currency: "USD",
    defaultDurationMinutes: 30,
    isActive: true,
    displayOrder: 1,
    deliveryType: "remote"
  }
];

let communications: CommunicationSettings = {
  senderName: "Avenseal",
  replyToEmail: "hello@avenseal.com",
  supportPhone: "(407) 555-0100",
  emailRemindersEnabled: false,
  smsRemindersEnabled: false,
  reviewRequestsEnabled: false,
  confirmationMessagingEnabled: false,
  reminder24hMinutesBefore: 1440,
  reminder2hMinutesBefore: 120,
  followupMinutesAfter: 1440,
  reviewRequestMinutesAfter: 2880
};

let concierge: AiConciergeSettings = {
  conciergeEnabled: true,
  displayName: "Ava",
  greeting: "Hi, I'm Ava, Avenseal's virtual booking assistant. I'll help you prepare and request a remote online notary appointment.",
  tonePreset: "professional_and_warm",
  escalationMessage: "A commissioned notary will review your request and make all notarial determinations during the session.",
  humanSupportDestination: "hello@avenseal.com",
  bookingAssistanceEnabled: true,
  faqAssistanceEnabled: true
};

const customers: Customer[] = [
  {
    id: "dev_customer_1",
    organizationId,
    fullName: "Development Customer",
    email: "customer@example.com",
    mobilePhone: "(407) 555-0184",
    createdAt: now,
    updatedAt: now
  }
];

const appointments: AppointmentRequest[] = [
  {
    id: "dev_request_1",
    organizationId,
    customerId: "dev_customer_1",
    customer: customers[0],
    serviceId,
    serviceNameSnapshot: services[0].customerName,
    serviceDurationMinutesSnapshot: services[0].defaultDurationMinutes,
    servicePriceCentsSnapshot: services[0].basePriceCents,
    serviceCurrencySnapshot: services[0].currency,
    status: "awaiting_review",
    documentCategory: "affidavit",
    documentCount: 1,
    signerCount: 1,
    estimatedNotarizations: null,
    notarizationsNotSure: true,
    hasWitnessLines: null,
    witnessesAvailable: null,
    signerLocation: "Florida, USA",
    allSignersHaveGovernmentId: true,
    preferredDate: new Date().toISOString().slice(0, 10),
    preferredTime: "14:00",
    urgency: "same_day",
    administrativeNotes: "Development data: sample request for local admin testing.",
    createdAt: now,
    updatedAt: now
  }
];

const history: StatusHistoryEntry[] = [
  {
    id: "dev_history_1",
    appointmentRequestId: "dev_request_1",
    fromStatus: null,
    toStatus: "awaiting_review",
    reason: "Development seed request created.",
    createdAt: now
  }
];

const notes: InternalNote[] = [];

export type DevelopmentFloridaRonSession = {
  id: string; organization_id: string; appointment_request_id: string; workflow_version: string;
  specification_status: "candidate"; state: "prepared" | "stopped" | "preview_completed";
  outcome: string | null; stop_reason: AssistantStopReason | null; parameters: FloridaRonPrepareInput;
  module_versions: FloridaRonModule[]; provider_reference: string | null; created_by: string;
  created_at: string; started_at: string | null; completed_or_stopped_at: string | null;
};
export type DevelopmentFloridaRonEvent = { id: string; session_id: string; organization_id: string; actor_id: string; event_type: string; payload: Record<string, unknown>; created_at: string };
type DevelopmentFloridaRonState = { sessions: DevelopmentFloridaRonSession[]; events: DevelopmentFloridaRonEvent[] };
const developmentGlobal = globalThis as typeof globalThis & { __avensealFloridaRonDevelopmentState?: DevelopmentFloridaRonState };
const floridaRonState = developmentGlobal.__avensealFloridaRonDevelopmentState ??= { sessions: [], events: [] };
const productionGlobal = globalThis as typeof globalThis & { __avensealFloridaRonProductionState?: { attempts: FloridaRonProductionAttempt[]; evidence: FloridaRonProductionEvidence[]; events: DevelopmentFloridaRonEvent[] } };
const productionState = productionGlobal.__avensealFloridaRonProductionState ??= { attempts: [], evidence: [], events: [] };

export const devStore = {
  async createFloridaRonSession(session: Omit<DevelopmentFloridaRonSession, "id" | "outcome" | "provider_reference" | "created_at" | "started_at" | "completed_or_stopped_at">, event: Omit<DevelopmentFloridaRonEvent, "id" | "session_id" | "created_at">) {
    const created: DevelopmentFloridaRonSession = { ...session, id: id("fl_ron"), outcome: null, provider_reference: null, created_at: new Date().toISOString(), started_at: null, completed_or_stopped_at: null };
    floridaRonState.sessions.unshift(created);
    floridaRonState.events.push({ ...event, id: id("fl_ron_event"), session_id: created.id, created_at: new Date().toISOString() });
    return created;
  },
  async getFloridaRonPreparedSession(organizationId: string, appointmentId: string) {
    return floridaRonState.sessions.find((session) => session.organization_id === organizationId && session.appointment_request_id === appointmentId && session.state === "prepared") ?? null;
  },
  async updateFloridaRonPreparedSession(sessionId: string, organizationId: string, parameters: FloridaRonPrepareInput, modules: FloridaRonModule[], stopReason: AssistantStopReason | null, event: Omit<DevelopmentFloridaRonEvent, "id" | "session_id" | "created_at">) {
    const session = floridaRonState.sessions.find((item) => item.id === sessionId && item.organization_id === organizationId && item.state === "prepared");
    if (!session) return null;
    session.parameters = parameters; session.module_versions = modules; session.stop_reason = stopReason;
    floridaRonState.events.push({ ...event, id: id("fl_ron_event"), session_id: session.id, created_at: new Date().toISOString() });
    return session;
  },
  async transitionFloridaRonPreparedSession(sessionId: string, organizationId: string, state: "stopped" | "preview_completed", outcome: string, stopReason: AssistantStopReason | null, event: Omit<DevelopmentFloridaRonEvent, "id" | "session_id" | "created_at">) {
    const session = floridaRonState.sessions.find((item) => item.id === sessionId && item.organization_id === organizationId && item.state === "prepared");
    if (!session) return null;
    session.state = state; session.outcome = outcome; session.stop_reason = stopReason; session.completed_or_stopped_at = new Date().toISOString();
    floridaRonState.events.push({ ...event, id: id("fl_ron_event"), session_id: session.id, created_at: new Date().toISOString() });
    return session;
  },
  async getFloridaRonHistory(organizationId: string, appointmentId: string) {
    return floridaRonState.sessions.filter((session) => session.organization_id === organizationId && session.appointment_request_id === appointmentId).map((session) => ({ ...session, events: floridaRonState.events.filter((event) => event.organization_id === organizationId && event.session_id === session.id) }));
  },
  async createFloridaRonProductionAttempt(input: Omit<FloridaRonProductionAttempt, "id" | "createdAt" | "startedAt" | "terminalAt">) {
    const now = new Date().toISOString(); const attempt = { ...input, id: id("fl_ron_production"), createdAt: now, startedAt: now, terminalAt: null };
    productionState.attempts.unshift(attempt); productionState.events.push({ id: id("fl_ron_production_event"), session_id: attempt.id, organization_id: attempt.organizationId, actor_id: attempt.createdBy, event_type: "attempt_created", payload: { workflowVersion: attempt.workflowVersion, preparedSessionId: attempt.preparedSessionId, moduleVersions: attempt.modules }, created_at: now });
    productionState.events.push({ id: id("fl_ron_production_event"), session_id: attempt.id, organization_id: attempt.organizationId, actor_id: attempt.createdBy, event_type: "attempt_started", payload: { currentModuleIndex: 0, module: attempt.modules[0] ?? null }, created_at: now }); return attempt;
  },
  async getFloridaRonProductionAttempt(organizationId: string, appointmentId: string) { return productionState.attempts.find((attempt) => attempt.organizationId === organizationId && attempt.appointmentId === appointmentId && attempt.state === "in_progress") ?? null; },
  async getFloridaRonProductionEvidence(organizationId: string, attemptId: string) { return productionState.evidence.filter((item) => item.attemptId === attemptId && item.attemptId && productionState.attempts.some((attempt) => attempt.id === attemptId && attempt.organizationId === organizationId)); },
  async addFloridaRonProductionEvidence(item: FloridaRonProductionEvidence) { productionState.evidence.push(item); productionState.events.push({ id: id("fl_ron_production_event"), session_id: item.attemptId, organization_id: productionState.attempts.find((attempt) => attempt.id === item.attemptId)?.organizationId ?? "", actor_id: item.actorId, event_type: "confirmation_recorded", payload: item, created_at: item.createdAt }); return item; },
  async transitionFloridaRonProductionAttempt(attemptId: string, organizationId: string, state: ProductionAttemptState, currentModuleIndex: number, stopReason: AssistantStopReason | null, actorId: string, eventType: string, payload: Record<string, unknown>) { const index = productionState.attempts.findIndex((item) => item.id === attemptId && item.organizationId === organizationId && item.state === "in_progress"); if (index < 0) return null; const attempt = { ...productionState.attempts[index], currentModuleIndex, state, stopReason, terminalAt: state === "stopped" ? new Date().toISOString() : null }; productionState.attempts[index] = attempt; productionState.events.push({ id: id("fl_ron_production_event"), session_id: attempt.id, organization_id: organizationId, actor_id: actorId, event_type: eventType, payload, created_at: new Date().toISOString() }); return attempt; },
  async createAppointment(input: BookingInput, snapshot: AppointmentServiceSnapshot) {
    const timestamp = new Date().toISOString();
    const customer: Customer = {
      id: id("customer"),
      organizationId,
      fullName: input.fullName,
      email: input.email,
      mobilePhone: input.mobilePhone,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const appointment: AppointmentRequest = {
      id: id("request"),
      organizationId,
      customerId: customer.id,
      customer,
      serviceId: snapshot.serviceId,
      serviceNameSnapshot: snapshot.serviceNameSnapshot,
      serviceDurationMinutesSnapshot: snapshot.serviceDurationMinutesSnapshot,
      servicePriceCentsSnapshot: snapshot.servicePriceCentsSnapshot,
      serviceCurrencySnapshot: snapshot.serviceCurrencySnapshot,
      status: "awaiting_review",
      documentCategory: input.documentCategory,
      documentCount: input.documentCount,
      signerCount: input.signerCount,
      estimatedNotarizations: input.notarizationsNotSure ? null : input.estimatedNotarizations ?? null,
      notarizationsNotSure: input.notarizationsNotSure,
      hasWitnessLines: input.hasWitnessLines,
      witnessesAvailable: input.witnessesAvailable,
      signerLocation: input.signerLocation,
      allSignersHaveGovernmentId: input.allSignersHaveGovernmentId,
      preferredDate: input.preferredDate,
      preferredTime: input.preferredTime,
      urgency: input.urgency,
      administrativeNotes: input.administrativeNotes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    customers.unshift(customer);
    appointments.unshift(appointment);
    history.unshift({
      id: id("history"),
      appointmentRequestId: appointment.id,
      fromStatus: null,
      toStatus: "awaiting_review",
      reason: "Public booking request submitted.",
      createdAt: timestamp
    });
    return appointment;
  },
  async listAppointments() {
    return appointments;
  },
  async getAppointment(idValue: string) {
    return appointments.find((appointment) => appointment.id === idValue) ?? null;
  },
  async updateAppointment(idValue: string, update: {
    status?: AppointmentStatus;
    preferredDate?: string;
    preferredTime?: string;
    serviceId?: string;
    note?: string;
  }) {
    const appointment = appointments.find((item) => item.id === idValue);
    if (!appointment) return null;
    const previous = appointment.status;
    if (update.status && update.status !== appointment.status) {
      appointment.status = update.status;
      history.unshift({
        id: id("history"),
        appointmentRequestId: appointment.id,
        fromStatus: previous,
        toStatus: update.status,
        reason: "Admin status update.",
        createdAt: new Date().toISOString()
      });
    }
    if (update.preferredDate) appointment.preferredDate = update.preferredDate;
    if (update.preferredTime) appointment.preferredTime = update.preferredTime;
    if (update.serviceId && update.serviceId !== appointment.serviceId) {
      if (!["awaiting_review", "clarification_needed"].includes(appointment.status)) {
        throw new Error("The service cannot be changed after payment approval.");
      }
      const service = services.find((item) =>
        item.id === update.serviceId &&
        item.isActive &&
        item.deliveryType === "remote"
      );
      if (!service) throw new Error("The selected service is unavailable.");
      appointment.serviceId = service.id;
      appointment.serviceNameSnapshot = service.customerName;
      appointment.serviceDurationMinutesSnapshot = service.defaultDurationMinutes;
      appointment.servicePriceCentsSnapshot = service.basePriceCents;
      appointment.serviceCurrencySnapshot = service.currency;
    }
    if (update.note) {
      notes.unshift({
        id: id("note"),
        appointmentRequestId: appointment.id,
        body: update.note,
        createdAt: new Date().toISOString()
      });
    }
    appointment.updatedAt = new Date().toISOString();
    return appointment;
  },
  async listCustomers() {
    return customers;
  },
  async getCustomer(idValue: string) {
    return customers.find((customer) => customer.id === idValue) ?? null;
  },
  async getHistory(appointmentId: string) {
    return history.filter((entry) => entry.appointmentRequestId === appointmentId);
  },
  async getNotes(appointmentId: string) {
    return notes.filter((note) => note.appointmentRequestId === appointmentId);
  },
  async getSettings() {
    return settings;
  },
  async updateSettings(next: Partial<BusinessSettings>) {
    Object.assign(settings, next);
    return settings;
  },
  async getOrganizationSettings(): Promise<OrganizationSettings> {
    return { business: settings, rules, intervals, exceptions, services, communications, concierge };
  },
  async getBookedTimes(date: string) {
    return new Set(
      appointments
        .filter((appointment) =>
          appointment.preferredDate === date &&
          ["awaiting_review", "awaiting_payment", "confirmed", "ready", "follow_up_required"].includes(appointment.status)
        )
        .map((appointment) => appointment.preferredTime.slice(0, 5))
    );
  },
  async getBlockingAppointments(date: string, excludeAppointmentId?: string) {
    return appointments.filter((appointment) =>
      appointment.id !== excludeAppointmentId &&
      appointment.preferredDate === date &&
      [
        "awaiting_review",
        "awaiting_payment",
        "clarification_needed",
        "approved_pending_payment",
        "payment_processing",
        "confirmed",
        "ready",
        "follow_up_required"
      ].includes(appointment.status)
    );
  },
  async updateOrganizationSettings(input: OrganizationSettingsInput): Promise<OrganizationSettings> {
    Object.assign(settings, {
      businessName: input.businessName,
      supportEmail: input.supportEmail,
      supportPhone: input.supportPhone,
      website: input.website,
      description: input.description,
      timezone: input.timezone,
      businessMode: input.businessMode,
      defaultDeliveryMethod: input.defaultDeliveryMethod,
      pricingHeadline: input.pricingHeadline,
      pricingNote: input.pricingNote
    });
    rules = {
      defaultDurationMinutes: input.defaultDurationMinutes,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
      minimumBookingNoticeMinutes: input.minimumBookingNoticeMinutes,
      maximumAdvanceBookingDays: input.maximumAdvanceBookingDays,
      sameDayEnabled: input.sameDayEnabled,
      maximumAppointmentsPerDay: input.maximumAppointmentsPerDay,
      customerReschedulingEnabled: input.customerReschedulingEnabled,
      customerCancellationEnabled: input.customerCancellationEnabled,
      emergencyAppointmentEnabled: input.emergencyAppointmentEnabled,
      automaticApprovalEnabled: input.automaticApprovalEnabled
    };
    intervals = input.intervals;
    services = [{
      id: services[0]?.id ?? serviceId,
      internalName: "remote_online_notarization",
      customerName: input.serviceCustomerName,
      description: input.serviceDescription,
      basePriceCents: input.serviceBasePriceCents,
      currency: input.serviceCurrency,
      defaultDurationMinutes: input.defaultDurationMinutes,
      isActive: input.serviceActive,
      displayOrder: 1,
      deliveryType: "remote"
    }];
    communications = {
      ...communications,
      senderName: input.senderName,
      replyToEmail: input.replyToEmail,
      supportPhone: input.communicationSupportPhone,
      emailRemindersEnabled: input.emailRemindersEnabled,
      smsRemindersEnabled: input.smsRemindersEnabled,
      reviewRequestsEnabled: input.reviewRequestsEnabled,
      confirmationMessagingEnabled: input.confirmationMessagingEnabled
    };
    concierge = {
      conciergeEnabled: input.conciergeEnabled,
      displayName: input.conciergeDisplayName,
      greeting: input.conciergeGreeting,
      tonePreset: input.conciergeTonePreset,
      escalationMessage: input.conciergeEscalationMessage,
      humanSupportDestination: input.humanSupportDestination,
      bookingAssistanceEnabled: input.bookingAssistanceEnabled,
      faqAssistanceEnabled: input.faqAssistanceEnabled
    };
    return { business: settings, rules, intervals, exceptions, services, communications, concierge };
  }
};
