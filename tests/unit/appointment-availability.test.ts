import { describe, expect, it, vi } from "vitest";
import {
  AppointmentAvailabilityError,
  calculateAppointmentSlots,
  getAvailableAppointmentSlots,
  isBlockingAppointmentStatus,
  type AppointmentAvailabilityData,
  type AppointmentAvailabilityDataSource,
  type AvailabilityRules
} from "@/lib/server/appointment-availability";

const organizationId = "00000000-0000-4000-8000-000000000001";
const serviceId = "00000000-0000-4000-8000-000000000002";
const timezone = "America/New_York";
const monday = "2026-07-20";
const now = new Date("2026-07-01T12:00:00Z");

const baseRules: AvailabilityRules = {
  defaultDurationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minimumBookingNoticeMinutes: 0,
  maximumAdvanceBookingDays: null,
  sameDayEnabled: true,
  maximumAppointmentsPerDay: null
};

function calculate(overrides: Partial<Parameters<typeof calculateAppointmentSlots>[0]> = {}) {
  return calculateAppointmentSlots({
    date: monday,
    timezone,
    durationMinutes: 30,
    intervals: [{ weekday: 1, startTime: "09:00", endTime: "12:00" }],
    rules: baseRules,
    slotIncrementMinutes: 30,
    now,
    ...overrides
  });
}

function source(overrides: Partial<AppointmentAvailabilityData> = {}): AppointmentAvailabilityDataSource {
  const data: AppointmentAvailabilityData = {
    organization: { id: organizationId, status: "active", timezone },
    service: {
      id: serviceId,
      organizationId,
      durationMinutes: 30,
      active: true,
      bookable: true
    },
    schedule: { timezone },
    intervals: [{ weekday: 1, startTime: "09:00", endTime: "12:00" }],
    exceptions: [],
    rules: baseRules,
    slotIncrementMinutes: 30,
    blockers: [],
    activeAppointmentCount: 0,
    ...overrides
  };
  return { load: vi.fn().mockResolvedValue(data) };
}

describe("appointment availability calculation", () => {
  it("requires the full service duration to fit within business hours", () => {
    const slots = calculate({
      durationMinutes: 45,
      intervals: [{ weekday: 1, startTime: "09:00", endTime: "10:00" }]
    });
    expect(slots.map((slot) => slot.startAt)).toEqual(["2026-07-20T09:00:00-04:00"]);
  });

  it("supports multiple availability intervals", () => {
    const slots = calculate({
      intervals: [
        { weekday: 1, startTime: "09:00", endTime: "10:00" },
        { weekday: 1, startTime: "13:00", endTime: "14:00" }
      ]
    });
    expect(slots.map((slot) => slot.startAt)).toEqual([
      "2026-07-20T09:00:00-04:00",
      "2026-07-20T09:30:00-04:00",
      "2026-07-20T13:00:00-04:00",
      "2026-07-20T13:30:00-04:00"
    ]);
  });

  it("uses the configured slot interval", () => {
    const slots = calculate({
      intervals: [{ weekday: 1, startTime: "09:00", endTime: "10:00" }],
      slotIncrementMinutes: 15
    });
    expect(slots).toHaveLength(3);
    expect(slots[1].startAt).toBe("2026-07-20T09:15:00-04:00");
  });

  it("keeps buffer-before time inside business hours", () => {
    const slots = calculate({
      rules: { ...baseRules, bufferBeforeMinutes: 15 }
    });
    expect(slots[0].startAt).toBe("2026-07-20T09:15:00-04:00");
  });

  it("keeps buffer-after time inside business hours", () => {
    const slots = calculate({
      intervals: [{ weekday: 1, startTime: "09:00", endTime: "10:00" }],
      rules: { ...baseRules, bufferAfterMinutes: 15 }
    });
    expect(slots.map((slot) => slot.startAt)).toEqual(["2026-07-20T09:00:00-04:00"]);
  });

  it("removes overlapping Avenseal appointments but preserves non-overlapping slots", () => {
    const slots = calculate({
      blockers: [{
        date: monday,
        time: "09:30",
        durationMinutes: 30,
        source: "appointment"
      }]
    });
    expect(slots.map((slot) => slot.startAt)).not.toContain("2026-07-20T09:30:00-04:00");
    expect(slots.map((slot) => slot.startAt)).toContain("2026-07-20T10:00:00-04:00");
  });

  it("applies appointment buffers when checking adjacent conflicts", () => {
    const slots = calculate({
      rules: { ...baseRules, bufferAfterMinutes: 15 },
      blockers: [{
        date: monday,
        time: "10:00",
        durationMinutes: 30,
        source: "appointment"
      }]
    });
    expect(slots.map((slot) => slot.startAt)).not.toContain("2026-07-20T09:30:00-04:00");
  });

  it("does not classify cancelled or declined appointments as blocking", () => {
    expect(isBlockingAppointmentStatus("cancelled")).toBe(false);
    expect(isBlockingAppointmentStatus("declined")).toBe(false);
    expect(isBlockingAppointmentStatus("confirmed")).toBe(true);
    expect(isBlockingAppointmentStatus("awaiting_review")).toBe(true);
  });

  it("removes slots fully or partially overlapped by Google busy periods", () => {
    const slots = calculate({
      googleBusy: [
        { start: "2026-07-20T13:15:00Z", end: "2026-07-20T13:45:00Z" },
        { start: "2026-07-20T14:25:00Z", end: "2026-07-20T14:35:00Z" }
      ]
    });
    const starts = slots.map((slot) => slot.startAt);
    expect(starts).not.toContain("2026-07-20T09:00:00-04:00");
    expect(starts).not.toContain("2026-07-20T10:00:00-04:00");
  });

  it("converts summer and winter slots using the organization timezone", () => {
    expect(calculate()[0].startAt).toBe("2026-07-20T09:00:00-04:00");
    const winter = calculate({
      date: "2026-12-07",
      now: new Date("2026-11-01T00:00:00Z")
    });
    expect(winter[0].startAt).toBe("2026-12-07T09:00:00-05:00");
  });

  it("skips nonexistent wall-clock times during the DST spring transition", () => {
    const slots = calculate({
      date: "2026-03-08",
      now: new Date("2026-02-01T00:00:00Z"),
      intervals: [{ weekday: 0, startTime: "01:30", endTime: "04:00" }]
    });
    expect(slots.map((slot) => slot.startAt)).toEqual([
      "2026-03-08T01:30:00-05:00",
      "2026-03-08T03:00:00-04:00",
      "2026-03-08T03:30:00-04:00"
    ]);
  });

  it("enforces minimum booking notice", () => {
    const slots = calculate({
      date: "2026-07-20",
      now: new Date("2026-07-20T12:30:00Z"),
      rules: { ...baseRules, minimumBookingNoticeMinutes: 90 }
    });
    expect(slots[0].startAt).toBe("2026-07-20T10:00:00-04:00");
  });

  it("enforces the maximum booking horizon", () => {
    const slots = calculate({
      date: "2026-07-20",
      now: new Date("2026-07-01T12:00:00Z"),
      rules: { ...baseRules, maximumAdvanceBookingDays: 10 }
    });
    expect(slots).toEqual([]);
  });

  it("can retain rejection reasons for internal inspection", () => {
    const slots = calculate({
      includeUnavailable: true,
      blockers: [{
        date: monday,
        time: "09:00",
        durationMinutes: 30,
        source: "reservation"
      }]
    });
    expect(slots[0]).toMatchObject({ available: false, reason: "reservation_conflict" });
  });
});

describe("appointment availability service", () => {
  it("rejects inactive services", async () => {
    await expect(getAvailableAppointmentSlots(
      { organizationId, serviceId, date: monday },
      {
        dataSource: source({
          service: {
            id: serviceId,
            organizationId,
            durationMinutes: 30,
            active: false,
            bookable: true
          }
        }),
        googleBusyProvider: vi.fn().mockResolvedValue([]),
        now
      }
    )).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("prevents cross-organization service access", async () => {
    await expect(getAvailableAppointmentSlots(
      { organizationId, serviceId, date: monday },
      {
        dataSource: source({
          service: {
            id: serviceId,
            organizationId: "00000000-0000-4000-8000-000000000099",
            durationMinutes: 30,
            active: true,
            bookable: true
          }
        }),
        googleBusyProvider: vi.fn().mockResolvedValue([]),
        now
      }
    )).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("fails closed when a connected Google calendar cannot be queried", async () => {
    await expect(getAvailableAppointmentSlots(
      { organizationId, serviceId, date: monday },
      {
        dataSource: source(),
        googleBusyProvider: vi.fn().mockRejectedValue(new Error("provider failed")),
        now
      }
    )).rejects.toEqual(expect.objectContaining<Partial<AppointmentAvailabilityError>>({
      code: "google_connection_failure"
    }));
  });

  it("returns normal availability when there is no Google connection", async () => {
    const result = await getAvailableAppointmentSlots(
      { organizationId, serviceId, date: monday },
      {
        dataSource: source(),
        googleBusyProvider: vi.fn().mockResolvedValue([]),
        now
      }
    );
    expect(result.slots).not.toHaveLength(0);
  });

  it("queries the exact local-day UTC range plus configured buffers", async () => {
    const googleBusyProvider = vi.fn().mockResolvedValue([]);
    await getAvailableAppointmentSlots(
      { organizationId, serviceId, date: monday },
      {
        dataSource: source({
          rules: {
            ...baseRules,
            bufferBeforeMinutes: 15,
            bufferAfterMinutes: 20
          }
        }),
        googleBusyProvider,
        now
      }
    );

    expect(googleBusyProvider).toHaveBeenCalledWith(expect.objectContaining({
      timezone,
      timeMin: "2026-07-20T03:45:00.000Z",
      timeMax: "2026-07-21T04:20:00.000Z"
    }));
  });
});
