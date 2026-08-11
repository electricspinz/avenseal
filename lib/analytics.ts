export type ScheduleAppointmentLocation = "homepage_hero" | "homepage_footer" | "public_header" | "pricing" | "how_it_works";

type AnalyticsEvent =
  | Readonly<{ name: "page_view"; parameters: Readonly<{ page_path: string }> }>
  | Readonly<{ name: "schedule_appointment_click"; parameters: Readonly<{ location: ScheduleAppointmentLocation }> }>
  | Readonly<{ name: "booking_started"; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ name: "booking_step_completed"; parameters: Readonly<{ step_name: string; step_number: number }> }>
  | Readonly<{ name: "appointment_selected"; parameters: Readonly<{ service_category: "remote_online_notary"; urgency: "same_day" | "next_available" | "specific_date" | "not_urgent" }> }>
  | Readonly<{ name: "booking_submitted"; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ name: "begin_checkout"; parameters: Readonly<{ currency: "USD"; value: number }> }>
  | Readonly<{ name: "bluenotary_handoff"; parameters: Readonly<{ provider: "bluenotary" }> }>;

type Gtag = (command: "event", eventName: AnalyticsEvent["name"], parameters: AnalyticsEvent["parameters"]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

const trackablePagePaths = new Set([
  "/", "/about", "/contact", "/faq", "/how-it-works", "/pricing", "/privacy", "/terms", "/book", "/booking/confirmation", "/appointments/status", "/appointments/access/request"
]);

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
  send({ name: "booking_started", parameters: {} });
}

export function trackBookingStepCompleted(stepName: string, stepNumber: number) {
  send({ name: "booking_step_completed", parameters: { step_name: stepName, step_number: stepNumber } });
}

export function trackAppointmentSelected(urgency: "same_day" | "next_available" | "specific_date" | "not_urgent") {
  send({ name: "appointment_selected", parameters: { service_category: "remote_online_notary", urgency } });
}

export function trackBookingSubmitted() {
  send({ name: "booking_submitted", parameters: {} });
}

export function trackBeginCheckout(amountDueCents: number, currency: string) {
  if (currency !== "USD" || !Number.isSafeInteger(amountDueCents) || amountDueCents < 0) return;
  send({ name: "begin_checkout", parameters: { currency: "USD", value: amountDueCents / 100 } });
}

export function trackBlueNotaryHandoff() {
  send({ name: "bluenotary_handoff", parameters: { provider: "bluenotary" } });
}
