export type AppointmentStatus =
  | "awaiting_review"
  | "awaiting_payment"
  | "clarification_needed"
  | "approved_pending_payment"
  | "payment_processing"
  | "confirmed"
  | "ready"
  | "completed"
  | "cancelled"
  | "declined"
  | "follow_up_required"
  | "no_show";

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  awaiting_review: "Awaiting Review",
  awaiting_payment: "Awaiting Payment",
  clarification_needed: "Clarification Needed",
  approved_pending_payment: "Approved Pending Payment",
  payment_processing: "Payment Processing",
  confirmed: "Confirmed",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  follow_up_required: "Follow-Up Required",
  no_show: "No-Show"
};

export type DocumentCategory =
  | "affidavit"
  | "power_of_attorney"
  | "estate_planning"
  | "business_document"
  | "consent_or_authorization"
  | "real_estate_related"
  | "school_or_travel"
  | "other"
  | "not_sure";

export interface Customer {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  mobilePhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentRequest {
  id: string;
  organizationId: string;
  customerId: string;
  status: AppointmentStatus;
  customer: Customer;
  documentCategory: DocumentCategory;
  documentCount: number;
  signerCount: number;
  estimatedNotarizations: number | null;
  notarizationsNotSure: boolean;
  hasWitnessLines: boolean | null;
  witnessesAvailable: boolean | null;
  signerLocation: string;
  allSignersHaveGovernmentId: boolean;
  preferredDate: string;
  preferredTime: string;
  urgency: "same_day" | "next_available" | "specific_date" | "not_urgent";
  administrativeNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  appointmentRequestId: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  reason: string | null;
  createdAt: string;
}

export interface InternalNote {
  id: string;
  appointmentRequestId: string;
  body: string;
  createdAt: string;
}

export interface BusinessSettings {
  organizationId?: string;
  businessName: string;
  supportEmail: string;
  supportPhone: string;
  website?: string | null;
  description?: string | null;
  timezone: string;
  businessMode?: BusinessMode;
  defaultDeliveryMethod?: "remote_online_notarization";
  pricingHeadline: string;
  pricingNote: string;
  privacyPolicyVersion: string;
  termsVersion: string;
}

export type BusinessMode = "solo" | "team" | "enterprise";

export interface AvailabilityInterval {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  displayOrder?: number;
}

export interface AvailabilityException {
  exceptionDate: string;
  closedAllDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  customerMessage: string | null;
}

export interface AppointmentRules {
  defaultDurationMinutes: number;
  bufferBeforeMinutes: number | null;
  bufferAfterMinutes: number | null;
  minimumBookingNoticeMinutes: number | null;
  maximumAdvanceBookingDays: number | null;
  sameDayEnabled: boolean;
  maximumAppointmentsPerDay: number | null;
  customerReschedulingEnabled: boolean | null;
  customerCancellationEnabled: boolean | null;
  emergencyAppointmentEnabled: boolean | null;
  automaticApprovalEnabled: boolean;
  sameDayPaymentWindowMinutes?: number;
  futurePaymentWindowMinutes?: number;
  complimentaryRescheduleCount?: number;
  rescheduleNoticeMinutes?: number;
  lateCancellationCutoffMinutes?: number;
  lateCancellationRetainedCents?: number;
  noShowGraceMinutes?: number;
}

export interface OrganizationService {
  id: string;
  internalName: string;
  customerName: string;
  description: string | null;
  basePriceCents: number | null;
  currency: string;
  defaultDurationMinutes: number;
  isActive: boolean;
  displayOrder: number;
  deliveryType: "remote" | "in_person";
}

export interface CommunicationSettings {
  senderName: string;
  replyToEmail: string | null;
  supportPhone: string | null;
  emailRemindersEnabled: boolean;
  smsRemindersEnabled: boolean;
  reviewRequestsEnabled: boolean;
  confirmationMessagingEnabled: boolean;
}

export interface AiConciergeSettings {
  conciergeEnabled: boolean;
  displayName: string;
  greeting: string;
  tonePreset: "professional_and_warm" | "formal" | "friendly" | "concise";
  escalationMessage: string;
  humanSupportDestination: string | null;
  bookingAssistanceEnabled: boolean;
  faqAssistanceEnabled: boolean;
}

export interface OrganizationSettings {
  business: BusinessSettings;
  rules: AppointmentRules;
  intervals: AvailabilityInterval[];
  exceptions: AvailabilityException[];
  services: OrganizationService[];
  communications: CommunicationSettings;
  concierge: AiConciergeSettings;
}

export type PaymentStatus =
  | "payment_link_created"
  | "payment_processing"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
  | "partially_refunded"
  | "disputed";

export interface AppointmentPayment {
  id: string;
  appointmentRequestId: string;
  serviceId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  refundedAmountCents: number;
  refundReason: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAppointmentStatus {
  reference: string;
  customerName: string;
  customerEmail: string;
  status: AppointmentStatus;
  customerStatusLabel: string;
  preferredDate: string;
  preferredTime: string;
  timezone: string;
  serviceName: string;
  paymentStatus: PaymentStatus | null;
  amountDueCents: number | null;
  currency: string;
  checkoutUrl: string | null;
  paymentExpiresAt: string | null;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
}

export interface CalendarEventMapping {
  id: string;
  appointmentRequestId: string;
  providerEventId: string | null;
  status: "pending" | "created" | "updated" | "cancelled" | "failed";
  startsAt: string;
  endsAt: string;
  timezone: string;
  lastError: string | null;
}

export interface CommunicationMessage {
  id: string;
  appointmentRequestId: string | null;
  messageType: string;
  recipientEmail: string;
  subject: string;
  status: "queued" | "sent" | "delivered" | "failed" | "skipped";
  sentAt: string | null;
  lastError: string | null;
}
