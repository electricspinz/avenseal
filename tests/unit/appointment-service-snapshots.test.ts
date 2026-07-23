import { describe, expect, it } from "vitest";
import {
  buildAppointmentServiceSnapshot,
  calculateAppointmentCheckoutLineItem,
  resolveAppointmentDuration
} from "@/lib/server/appointment-services";
import type { AppointmentRequest, OrganizationService } from "@/lib/types";

const organizationId = "00000000-0000-4000-8000-000000000001";

function service(overrides: Partial<OrganizationService & { organizationId: string }> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    organizationId,
    internalName: "remote_online_notarization",
    customerName: "Remote online notarization appointment",
    description: null,
    basePriceCents: 2500,
    currency: "USD",
    defaultDurationMinutes: 45,
    isActive: true,
    displayOrder: 1,
    deliveryType: "remote" as const,
    ...overrides
  };
}

describe("appointment service snapshots", () => {
  it("copies the service identity, name, duration, integer price, and currency", () => {
    expect(buildAppointmentServiceSnapshot(service(), organizationId)).toEqual({
      serviceId: "00000000-0000-4000-8000-000000000002",
      serviceNameSnapshot: "Remote online notarization appointment",
      serviceDurationMinutesSnapshot: 45,
      servicePriceCentsSnapshot: 2500,
      serviceCurrencySnapshot: "USD"
    });
  });

  it("rejects cross-organization, inactive, and non-remote services", () => {
    expect(() => buildAppointmentServiceSnapshot(
      service({ organizationId: "00000000-0000-4000-8000-000000000099" }),
      organizationId
    )).toThrow("not available");
    expect(() => buildAppointmentServiceSnapshot(service({ isActive: false }), organizationId))
      .toThrow("not available");
    expect(() => buildAppointmentServiceSnapshot(service({ deliveryType: "in_person" }), organizationId))
      .toThrow("not available");
  });

  it("rejects unsafe monetary values", () => {
    expect(() => buildAppointmentServiceSnapshot(service({ basePriceCents: 12.5 }), organizationId))
      .toThrow("price");
  });

  it("does not mutate an old snapshot when the source service changes", () => {
    const source = service();
    const snapshot = buildAppointmentServiceSnapshot(source, organizationId);
    source.customerName = "Renamed service";
    source.defaultDurationMinutes = 90;
    source.basePriceCents = 5000;
    expect(snapshot).toMatchObject({
      serviceNameSnapshot: "Remote online notarization appointment",
      serviceDurationMinutesSnapshot: 45,
      servicePriceCentsSnapshot: 2500
    });
  });

  it("refreshes all snapshot values when another service is assigned", () => {
    const replacement = buildAppointmentServiceSnapshot(service({
      id: "00000000-0000-4000-8000-000000000003",
      customerName: "Replacement service",
      defaultDurationMinutes: 60,
      basePriceCents: 2500,
      currency: "CAD"
    }), organizationId);
    expect(replacement).toEqual({
      serviceId: "00000000-0000-4000-8000-000000000003",
      serviceNameSnapshot: "Replacement service",
      serviceDurationMinutesSnapshot: 60,
      servicePriceCentsSnapshot: 2500,
      serviceCurrencySnapshot: "CAD"
    });
  });

  it("isolates the default-duration fallback to legacy appointments", () => {
    expect(resolveAppointmentDuration(75, 30)).toBe(75);
    expect(resolveAppointmentDuration(null, 30)).toBe(30);
    expect(resolveAppointmentDuration(undefined, 30)).toBe(30);
  });

  it("uses booking-time snapshots for Stripe checkout", () => {
    const appointment = {
      serviceNameSnapshot: "Booked service",
      servicePriceCentsSnapshot: 2500,
      serviceCurrencySnapshot: "USD"
    } satisfies Pick<
      AppointmentRequest,
      "serviceNameSnapshot" | "servicePriceCentsSnapshot" | "serviceCurrencySnapshot"
    >;
    expect(calculateAppointmentCheckoutLineItem(appointment)).toEqual({
      name: "Booked service",
      quantity: 1,
      amountCents: 2500,
      currency: "usd",
      totalCents: 2500
    });
  });
});
