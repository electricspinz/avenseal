import { currentPartnerCode } from "@/lib/partner-attribution";

export type ScheduleAppointmentLocation = "homepage_hero" | "homepage_footer" | "public_header" | "pricing" | "how_it_works";

type AnalyticsEvent =
  | Readonly<{ name: "page_view"; parameters: Readonly<{ page_path: string }> }>
  | Readonly<{ name: "schedule_appointment_click"; parameters: Readonly<{ location: ScheduleAppointmentLocation }> }>
  | Readonly<{ name: "booking_started"; parameters: Readonly<{ partner_code?: string }> }>
  | Readonly<{ name: "booking_step_completed"; parameters: Readonly<{ step_name: string; step_number: number }> }>
  | Readonly<{ name: "appointment_selected"; parameters: Readonly<{ service_category: "remote_online_notary"; urgency: "same_day" | "next_available" | "specific_date" | "not_urgent" }> }>
  | Readonly<{ name: "booking_submitted"; parameters: Readonly<{ partner_code?: string }> }>
  | Readonly<{ name: "begin_checkout"; parameters: Readonly<{ currency: "USD"; value: number; partner_code?: string }> }>
  | Readonly<{ name: "bluenotary_handoff"; parameters: Readonly<{ provider: "bluenotary" }> }>
  | Readonly<{ name: "partner_page_view"; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ name: "partner_interest_started"; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ name: "partner_interest_submitted"; parameters: Readonly<Record<string, never>> }>;

type Gtag = (command: "event", eventName: AnalyticsEvent["name"], parameters: AnalyticsEvent["parameters"]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

const trackablePagePaths = new Set([
  "/", "/about", "/contact", "/faq", "/how-it-works", "/partners", "/pricing", "/privacy", "/terms", "/book", "/booking/confirmation", "/appointments/status", "/appointments/access/request"
]);

function withPartnerCode<T extends Record<string, unknown>>(parameters: T): T & { partner_code?: string } {
  const partnerCode = currentPartnerCode();
  return partnerCode ? { ...parameters, partner_code: partnerCode } : parameters;
}

function send(event: AnalyticsEvent) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", event.name, event.parameters);
  } catch {
    // Analytics must never interrupt a customer action.
  }
}

export function trackPageView(pathname: string) {
  if (trackablePagePaths.has(pathname)) send({ name: "page_view", parameters: { page_path: pathname } });
}

export function trackScheduleAppointmentClick(location: ScheduleAppointmentLocation) {
  send({ name: "schedule_appointment_click", parameters: { location } });
}

export function trackBookingStarted() {
  send({ name: "booking_started", parameters: withPartnerCode({}) });
}

export function trackBookingStepCompleted(stepName: string, stepNumber: number) {
  send({ name: "booking_step_completed", parameters: { step_name: stepName, step_number: stepNumber } });
}

export function trackAppointmentSelected(urgency: "same_day" | "next_available" | "specific_date" | "not_urgent") {
  send({ name: "appointment_selected", parameters: { service_category: "remote_online_notary", urgency } });
}

export function trackBookingSubmitted() {
  send({ name: "booking_submitted", parameters: withPartnerCode({}) });
}

export function trackBeginCheckout(amountDueCents: number, currency: string) {
  if (currency !== "USD" || !Number.isSafeInteger(amountDueCents) || amountDueCents < 0) return;
  send({ name: "begin_checkout", parameters: withPartnerCode({ currency: "USD", value: amountDueCents / 100 }) });
}

export function trackBlueNotaryHandoff() {
  send({ name: "bluenotary_handoff", parameters: { provider: "bluenotary" } });
}

export function trackPartnerPageView() {
  send({ name: "partner_page_view", parameters: {} });
}

export function trackPartnerInterestStarted() {
  send({ name: "partner_interest_started", parameters: {} });
}

export function trackPartnerInterestSubmitted() {
  send({ name: "partner_interest_submitted", parameters: {} });
}
