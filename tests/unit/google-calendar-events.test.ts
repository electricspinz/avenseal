import { describe, expect, it, vi } from "vitest";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  fetchGoogleCalendarEvent,
  updateGoogleCalendarEvent
} from "@/lib/server/google-calendar";

const event = {
  eventId: "avenseal10000000000040008000000000000001",
  summary: "Remote Service — Jane Morgan",
  description: "Managed by Avenseal",
  startAt: "2026-07-27T13:30:00.000Z",
  endAt: "2026-07-27T14:30:00.000Z",
  timezone: "America/New_York",
  requestMeet: true,
  conferenceRequestId: "meet-request"
};

describe("Google Calendar event API", () => {
  it("requests Meet conference data and maps returned event metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: event.eventId,
      status: "confirmed",
      htmlLink: "https://calendar.google.test/event",
      hangoutLink: "https://meet.google.com/test-meet",
      etag: "etag-1",
      summary: event.summary,
      start: { dateTime: event.startAt },
      end: { dateTime: event.endAt }
    }), { status: 200 }));

    const result = await createGoogleCalendarEvent({
      accessToken: "access-token",
      event,
      fetcher
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain("conferenceDataVersion=1");
    expect(init.headers.Authorization).toBe("Bearer access-token");
    expect(JSON.parse(init.body)).toMatchObject({
      id: event.eventId,
      conferenceData: {
        createRequest: {
          requestId: "meet-request",
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      }
    });
    expect(result).toMatchObject({
      id: event.eventId,
      meetUrl: "https://meet.google.com/test-meet",
      etag: "etag-1"
    });
  });

  it("treats an already-deleted event as successful cancellation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(deleteGoogleCalendarEvent({
      accessToken: "access-token",
      eventId: event.eventId,
      fetcher
    })).resolves.toBeUndefined();
  });

  it("treats a gone event as successful cancellation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 410 }));
    await expect(deleteGoogleCalendarEvent({
      accessToken: "access-token",
      eventId: event.eventId,
      fetcher
    })).resolves.toBeUndefined();
  });

  it("creates or clears Meet data when an existing event delivery type changes", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: event.eventId,
        hangoutLink: "https://meet.google.com/test-meet"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: event.eventId
      }), { status: 200 }));

    await updateGoogleCalendarEvent({
      accessToken: "access-token",
      eventId: event.eventId,
      event,
      fetcher
    });
    await updateGoogleCalendarEvent({
      accessToken: "access-token",
      eventId: event.eventId,
      event: { ...event, requestMeet: false },
      fetcher
    });

    expect(fetcher.mock.calls[0][0]).toContain("conferenceDataVersion=1");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).conferenceData).toMatchObject({
      createRequest: { requestId: "meet-request" }
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).conferenceData).toBeNull();
  });

  it("returns null when verifying an event that no longer exists", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(fetchGoogleCalendarEvent({
      accessToken: "access-token",
      eventId: event.eventId,
      fetcher
    })).resolves.toBeNull();
  });
});
