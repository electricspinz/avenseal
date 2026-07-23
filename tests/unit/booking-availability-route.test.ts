import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAvailableAppointmentSlots: vi.fn(),
  resolvePublicOrganization: vi.fn(),
  checkRateLimit: vi.fn()
}));

vi.mock("@/lib/server/appointment-availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/appointment-availability")>();
  return {
    ...actual,
    getAvailableAppointmentSlots: mocks.getAvailableAppointmentSlots
  };
});

vi.mock("@/lib/server/organization", () => ({
  resolvePublicOrganization: mocks.resolvePublicOrganization
}));

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit
}));

import { AppointmentAvailabilityError } from "@/lib/server/appointment-availability";
import { GET } from "@/app/api/booking/availability/route";

const serviceId = "00000000-0000-4000-8000-000000000002";

describe("public booking availability route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 7 });
    mocks.resolvePublicOrganization.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      slug: "avenseal",
      status: "active",
      timezone: "America/New_York"
    });
  });

  it("returns only public slot timestamps", async () => {
    mocks.getAvailableAppointmentSlots.mockResolvedValue({
      date: "2026-07-30",
      timezone: "America/New_York",
      durationMinutes: 30,
      slots: [{
        startAt: "2026-07-30T14:00:00-04:00",
        endAt: "2026-07-30T14:30:00-04:00",
        available: true,
        reason: "appointment_conflict"
      }]
    });

    const response = await GET(new NextRequest(
      `http://localhost/api/booking/availability?organization=avenseal&service=${serviceId}&date=2026-07-30`
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      date: "2026-07-30",
      timezone: "America/New_York",
      slots: [{
        startAt: "2026-07-30T14:00:00-04:00",
        endAt: "2026-07-30T14:30:00-04:00"
      }]
    });
    expect(mocks.getAvailableAppointmentSlots).toHaveBeenCalledWith({
      organizationId: "00000000-0000-4000-8000-000000000001",
      serviceId,
      date: "2026-07-30"
    });
  });

  it("returns a generic temporary-unavailability response for Google failures", async () => {
    mocks.getAvailableAppointmentSlots.mockRejectedValue(
      new AppointmentAvailabilityError("google_connection_failure", "private provider detail")
    );

    const response = await GET(new NextRequest(
      `http://localhost/api/booking/availability?organization=avenseal&service=${serviceId}&date=2026-07-30`
    ));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Availability is temporarily unavailable. Please try again shortly."
    });
    expect(JSON.stringify(body)).not.toContain("provider");
  });
});
