import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { excludeBusySlots } from "@/lib/milestone3/calendar";
import { reminderShouldSend } from "@/lib/milestone3/email";
import { calculateCancellationRefund, calculatePaymentExpiration } from "@/lib/milestone3/policies";
import { assertNoUnapprovedFees, calculateCheckoutLineItem, getStandardNotarialActService } from "@/lib/milestone3/pricing";
import { verifyStripeSignature } from "@/lib/milestone3/stripe";
import type { AppointmentRules, OrganizationService } from "@/lib/types";

const service: OrganizationService = {
  id: "service_1",
  internalName: "florida_remote_online_notarial_act",
  customerName: "Remote Online Notarial Act",
  description: "One Florida remote online notarial act.",
  basePriceCents: 2500,
  currency: "usd",
  defaultDurationMinutes: 30,
  isActive: true,
  displayOrder: 1,
  deliveryType: "remote"
};

const rules: AppointmentRules = {
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
  automaticApprovalEnabled: false,
  sameDayPaymentWindowMinutes: 30,
  futurePaymentWindowMinutes: 720,
  lateCancellationCutoffMinutes: 120,
  lateCancellationRetainedCents: 1500
};

describe("Milestone 3 pricing", () => {
  it("uses organization service pricing for the approved $25 standard act", () => {
    const selected = getStandardNotarialActService([service]);
    expect(selected).toBeTruthy();
    expect(calculateCheckoutLineItem(selected!).totalCents).toBe(2500);
    expect(calculateCheckoutLineItem(selected!).name).toBe("Remote Online Notarial Act");
  });

  it("rejects hidden technology and coordination fees", () => {
    expect(assertNoUnapprovedFees([{ name: "Remote Online Notarial Act", amountCents: 2500 }])).toBe(true);
    expect(assertNoUnapprovedFees([{ name: "Technology fee", amountCents: 1400 }])).toBe(false);
    expect(assertNoUnapprovedFees([{ name: "Coordination fee", amountCents: 1400 }])).toBe(false);
  });
});

describe("Milestone 3 payment and refund policies", () => {
  it("calculates same-day and future payment expirations from organization rules", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    expect(calculatePaymentExpiration(now, "2026-07-17", rules).toISOString()).toBe("2026-07-17T12:30:00.000Z");
    expect(calculatePaymentExpiration(now, "2026-07-20", rules).toISOString()).toBe("2026-07-18T00:00:00.000Z");
  });

  it("calculates full and late-cancellation refunds", () => {
    const startsAt = new Date("2026-07-20T18:00:00.000Z");
    expect(calculateCancellationRefund({ amountCents: 2500, appointmentStartsAt: startsAt, cancelledAt: new Date("2026-07-20T15:30:00.000Z"), rules }).refundCents).toBe(2500);
    const late = calculateCancellationRefund({ amountCents: 2500, appointmentStartsAt: startsAt, cancelledAt: new Date("2026-07-20T17:00:00.000Z"), rules });
    expect(late.refundCents).toBe(1000);
    expect(late.retainedCents).toBe(1500);
  });
});

describe("Milestone 3 calendar and webhook helpers", () => {
  it("excludes Google busy intervals from candidate slots", () => {
    const slots = excludeBusySlots({
      date: "2026-07-20",
      slots: ["09:30", "10:00", "10:30"],
      durationMinutes: 30,
      busy: [{ start: "2026-07-20T10:00:00-04:00", end: "2026-07-20T10:30:00-04:00" }]
    });
    expect(slots).toEqual(["09:30", "10:30"]);
  });

  it("verifies Stripe webhook signatures", () => {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
    const secret = "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret)).toBe(true);
    expect(verifyStripeSignature(payload, `t=${timestamp},v1=bad`, secret)).toBe(false);
  });

  it("skips stale 24-hour reminders for near-term appointments", () => {
    expect(reminderShouldSend({ appointmentStartsAt: new Date("2026-07-18T12:00:00.000Z"), now: new Date("2026-07-17T13:00:00.000Z"), reminderMinutesBefore: 1440 })).toBe(false);
    expect(reminderShouldSend({ appointmentStartsAt: new Date("2026-07-19T12:00:00.000Z"), now: new Date("2026-07-17T13:00:00.000Z"), reminderMinutesBefore: 1440 })).toBe(true);
  });
});
