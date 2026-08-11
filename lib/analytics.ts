import { currentPartnerCode } from "@/lib/partner-attribution";

type PartnerAnalyticsEvent =
  | Readonly<{ name: "partner_page_view"; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ name: "partner_interest_started"; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ name: "partner_interest_submitted"; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ name: "booking_started"; parameters: Readonly<{ partner_code?: string }> }>
  | Readonly<{ name: "booking_submitted"; parameters: Readonly<{ partner_code?: string }> }>
  | Readonly<{ name: "begin_checkout"; parameters: Readonly<{ currency: "USD"; value: number; partner_code?: string }> }>;

type Gtag = (command: "event", eventName: PartnerAnalyticsEvent["name"], parameters: PartnerAnalyticsEvent["parameters"]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

function withPartnerCode<T extends Record<string, unknown>>(parameters: T): T & { partner_code?: string } {
  const partnerCode = currentPartnerCode();
  return partnerCode ? { ...parameters, partner_code: partnerCode } : parameters;
}

function send(event: PartnerAnalyticsEvent) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", event.name, event.parameters);
  } catch {
    // Analytics must never interrupt a customer action.
  }
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

export function trackBookingStarted() {
  send({ name: "booking_started", parameters: withPartnerCode({}) });
}

export function trackBookingSubmitted() {
  send({ name: "booking_submitted", parameters: withPartnerCode({}) });
}

export function trackBeginCheckout(amountDueCents: number, currency: string) {
  if (currency !== "USD" || !Number.isSafeInteger(amountDueCents) || amountDueCents < 0) return;
  send({ name: "begin_checkout", parameters: withPartnerCode({ currency: "USD", value: amountDueCents / 100 }) });
}
