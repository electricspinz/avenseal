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
  privacyPolicyVersion: "legal-review-placeholder-2026-07",
  termsVersion: "legal-review-placeholder-2026-07"
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
    description: "Pricing is configurable and should be finalized before public launch.",
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
  confirmationMessagingEnabled: false
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

export const devStore = {
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
