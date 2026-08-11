import { afterEach, describe, expect, it, vi } from "vitest";
import { trackAppointmentSelected, trackBeginCheckout, trackBlueNotaryHandoff, trackBookingStarted, trackBookingStepCompleted, trackBookingSubmitted, trackPageView, trackScheduleAppointmentClick } from "@/lib/analytics";

const gtag = vi.fn();

describe("analytics", () => {
  afterEach(() => {
    gtag.mockReset();
    delete window.gtag;
  });

  it("safely no-ops when analytics is unavailable", () => {
    expect(() => trackBookingStarted()).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("emits only approved anonymous funnel payloads", () => {
    window.gtag = gtag;

    trackPageView("/pricing");
    trackScheduleAppointmentClick("pricing");
    trackBookingStarted();
    trackBookingStepCompleted("customer_details", 1);
    trackAppointmentSelected("next_available");
    trackBookingSubmitted();
    trackBeginCheckout(2500, "USD");
    trackBlueNotaryHandoff();

    expect(gtag.mock.calls).toEqual([
      ["event", "page_view", { page_path: "/pricing" }],
      ["event", "schedule_appointment_click", { location: "pricing" }],
      ["event", "booking_started", {}],
      ["event", "booking_step_completed", { step_name: "customer_details", step_number: 1 }],
      ["event", "appointment_selected", { service_category: "remote_online_notary", urgency: "next_available" }],
      ["event", "booking_submitted", {}],
      ["event", "begin_checkout", { currency: "USD", value: 25 }],
      ["event", "bluenotary_handoff", { provider: "bluenotary" }]
    ]);
  });

  it("does not track token-protected paths or invalid checkout values", () => {
    window.gtag = gtag;

    trackPageView("/appointments/access/opaque-token");
    trackBeginCheckout(2500, "EUR");

    expect(gtag).not.toHaveBeenCalled();
  });
});
