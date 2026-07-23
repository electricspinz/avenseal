import { describe, expect, it, vi } from "vitest";
import { GoogleCalendarEventError, type GoogleCalendarEvent } from "@/lib/server/google-calendar";
import {
  appointmentDateTimeRange,
  buildAppointmentGoogleEvent,
  googleEventIdForAppointment,
  retryPendingCalendarSyncs,
  synchronizeAppointmentCalendar,
  type CalendarSyncAppointment,
  type CalendarSyncDependencies,
  type CalendarSyncMapping,
  type CalendarSyncStore
} from "@/lib/server/google-calendar-sync";

const organizationId = "00000000-0000-4000-8000-000000000001";
const appointmentId = "10000000-0000-4000-8000-000000000001";

function appointment(overrides: Partial<CalendarSyncAppointment> = {}): CalendarSyncAppointment {
  return {
    id: appointmentId,
    organizationId,
    status: "confirmed",
    customerName: "Jane Morgan",
    customerEmail: "jane@example.com",
    customerPhone: "(407) 555-0100",
    preferredDate: "2026-07-27",
    preferredTime: "09:30",
    administrativeNotes: "Please review the affidavit.",
    serviceId: "00000000-0000-4000-8000-000000000002",
    serviceNameSnapshot: "Booked Remote Service",
    serviceDurationMinutesSnapshot: 60,
    serviceDeliveryType: "remote",
    timezone: "America/New_York",
    defaultDurationMinutes: 30,
    calendarId: "primary",
    ...overrides
  };
}

function providerEvent(overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id: googleEventIdForAppointment(appointmentId),
    status: "confirmed",
    htmlLink: "https://calendar.google.test/event",
    meetUrl: "https://meet.google.com/test-meet",
    etag: "etag-1",
    summary: "Booked Remote Service — Jane Morgan",
    startAt: "2026-07-27T13:30:00.000Z",
    endAt: "2026-07-27T14:30:00.000Z",
    ...overrides
  };
}

function harness(initialAppointment = appointment()) {
  let currentAppointment: CalendarSyncAppointment | null = initialAppointment;
  let mapping: CalendarSyncMapping | null = null;
  const savePending = vi.fn<CalendarSyncStore["savePending"]>(async (input) => {
    mapping = {
      id: "mapping-1",
      organizationId: input.appointment.organizationId,
      appointmentRequestId: input.appointment.id,
      calendarId: input.appointment.calendarId,
      providerEventId: input.eventId,
      status: "pending",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.appointment.timezone,
      meetUrl: input.existing?.meetUrl ?? null,
      providerEtag: input.existing?.providerEtag ?? null,
      retryCount: input.existing?.retryCount ?? 0,
      lastSyncedAt: input.existing?.lastSyncedAt ?? null,
      lastAttemptedAt: "2026-07-23T12:00:00.000Z",
      lastError: input.existing?.lastError ?? null,
      lastErrorAt: input.existing?.lastErrorAt ?? null
    };
    return mapping;
  });
  const saveSuccess = vi.fn<CalendarSyncStore["saveSuccess"]>(async (input) => {
    mapping = {
      ...(mapping!),
      providerEventId: input.eventId,
      status: input.status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      meetUrl: input.event?.meetUrl ?? null,
      providerEtag: input.event?.etag ?? null,
      retryCount: 0,
      lastSyncedAt: "2026-07-23T12:01:00.000Z",
      lastError: null,
      lastErrorAt: null
    };
    return mapping;
  });
  const saveFailure = vi.fn<CalendarSyncStore["saveFailure"]>(async (input) => {
    mapping = {
      ...(mapping!),
      status: "failed",
      retryCount: input.retryCount,
      lastError: input.error,
      lastErrorAt: "2026-07-23T12:01:00.000Z"
    };
    return mapping;
  });
  const store: CalendarSyncStore = {
    loadAppointment: vi.fn(async (requestedOrganizationId, requestedAppointmentId) =>
      currentAppointment &&
      currentAppointment.organizationId === requestedOrganizationId &&
      currentAppointment.id === requestedAppointmentId
        ? currentAppointment
        : null
    ),
    loadMapping: vi.fn(async () => mapping),
    savePending,
    saveSuccess,
    saveFailure,
    listRetryAppointmentIds: vi.fn(async () =>
      mapping && ["pending", "failed"].includes(mapping.status) ? [appointmentId] : []
    )
  };
  const api = {
    create: vi.fn(async () => providerEvent()),
    update: vi.fn(async () => providerEvent({ etag: "etag-2" })),
    delete: vi.fn(async () => undefined)
  };
  const dependencies: CalendarSyncDependencies = {
    store,
    api,
    getAccessToken: vi.fn(async () => "refreshed-access-token"),
    log: vi.fn()
  };
  return {
    dependencies,
    api,
    store,
    mapping: () => mapping,
    setAppointment: (next: CalendarSyncAppointment) => {
      currentAppointment = next;
    }
  };
}

describe("Google Calendar appointment synchronization", () => {
  it("creates one event from booking snapshots and persists Meet metadata", async () => {
    const test = harness();
    const result = await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);

    expect(result.status).toBe("created");
    expect(test.api.create).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "refreshed-access-token",
      calendarId: "primary",
      event: expect.objectContaining({
        eventId: googleEventIdForAppointment(appointmentId),
        summary: "Booked Remote Service — Jane Morgan",
        requestMeet: true,
        startAt: "2026-07-27T13:30:00.000Z",
        endAt: "2026-07-27T14:30:00.000Z"
      })
    }));
    expect(test.mapping()).toMatchObject({
      status: "created",
      meetUrl: "https://meet.google.com/test-meet",
      providerEtag: "etag-1",
      retryCount: 0
    });
  });

  it("updates the existing event on repeated synchronization without creating a duplicate", async () => {
    const test = harness();
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);

    expect(test.api.create).toHaveBeenCalledTimes(1);
    expect(test.api.update).toHaveBeenCalledTimes(1);
    expect(test.mapping()?.status).toBe("updated");
  });

  it("updates the event after appointment time changes", async () => {
    const test = harness();
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);
    test.setAppointment(appointment({ preferredTime: "11:00" }));
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);

    expect(test.api.update).toHaveBeenLastCalledWith(expect.objectContaining({
      event: expect.objectContaining({
        startAt: "2026-07-27T15:00:00.000Z",
        endAt: "2026-07-27T16:00:00.000Z"
      })
    }));
  });

  it("deletes the event and marks the mapping cancelled", async () => {
    const test = harness();
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);
    test.setAppointment(appointment({ status: "cancelled" }));
    const result = await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);

    expect(test.api.delete).toHaveBeenCalledWith(expect.objectContaining({
      eventId: googleEventIdForAppointment(appointmentId)
    }));
    expect(result.status).toBe("cancelled");
    expect(test.mapping()?.status).toBe("cancelled");
  });

  it("persists a sanitized retryable failure without rejecting the appointment workflow", async () => {
    const test = harness();
    test.api.create.mockRejectedValueOnce(new GoogleCalendarEventError("create", 503));
    const result = await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);

    expect(result.status).toBe("failed");
    expect(test.mapping()).toMatchObject({
      status: "failed",
      retryCount: 1,
      lastError: "Google Calendar event synchronization failed."
    });
  });

  it("retries a failed mapping successfully and remains idempotent", async () => {
    const test = harness();
    test.api.create.mockRejectedValueOnce(new GoogleCalendarEventError("create", 503));
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);

    const retry = await retryPendingCalendarSyncs({ organizationId }, test.dependencies);
    expect(retry).toEqual({ attempted: 1, succeeded: 1, failed: 0 });
    expect(test.mapping()?.status).toBe("created");
    expect(test.mapping()?.retryCount).toBe(0);
  });

  it("recovers from a partial create by updating on Google conflict", async () => {
    const test = harness();
    test.api.create.mockRejectedValueOnce(new GoogleCalendarEventError("create", 409));
    const result = await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);
    expect(result.status).toBe("updated");
    expect(test.api.update).toHaveBeenCalledTimes(1);
  });

  it("recreates an event that was manually deleted", async () => {
    const test = harness();
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);
    test.api.update.mockRejectedValueOnce(new GoogleCalendarEventError("update", 404));
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);
    expect(test.api.create).toHaveBeenCalledTimes(2);
  });

  it("does not request Google Meet for an in-person service", () => {
    const inPerson = appointment({ serviceDeliveryType: "in_person" });
    const range = appointmentDateTimeRange(inPerson);
    expect(buildAppointmentGoogleEvent(inPerson, range.startsAt, range.endsAt).requestMeet).toBe(false);
  });

  it("uses the token provider result for Google API calls", async () => {
    const test = harness();
    await synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies);
    expect(test.dependencies.getAccessToken).toHaveBeenCalledWith(organizationId);
    expect(test.api.create).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "refreshed-access-token"
    }));
  });

  it("rejects cross-organization synchronization before calling Google", async () => {
    const test = harness();
    await expect(synchronizeAppointmentCalendar({
      organizationId: "00000000-0000-4000-8000-000000000099",
      appointmentId
    }, test.dependencies)).rejects.toThrow("not available");
    expect(test.api.create).not.toHaveBeenCalled();
    expect(test.api.update).not.toHaveBeenCalled();
  });

  it("uses timezone-aware winter offsets and the snapshot duration", () => {
    expect(appointmentDateTimeRange(appointment({
      preferredDate: "2026-12-07",
      preferredTime: "09:30",
      serviceDurationMinutesSnapshot: 75
    }))).toEqual({
      startsAt: "2026-12-07T14:30:00.000Z",
      endsAt: "2026-12-07T15:45:00.000Z"
    });
  });

  it("skips appointments that are not confirmed, ready, or cancelled", async () => {
    const test = harness(appointment({ status: "awaiting_review" }));
    await expect(synchronizeAppointmentCalendar({ organizationId, appointmentId }, test.dependencies))
      .resolves.toEqual({ status: "skipped", mapping: null });
    expect(test.api.create).not.toHaveBeenCalled();
  });
});
