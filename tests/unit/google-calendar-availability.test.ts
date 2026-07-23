import { describe, expect, it, vi } from "vitest";
import {
  fetchGoogleFreeBusy,
  GoogleCalendarUnavailableError
} from "@/lib/server/google-calendar";

describe("Google Calendar FreeBusy adapter", () => {
  it("returns validated busy intervals and sends the requested UTC range", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      calendars: {
        primary: {
          busy: [{
            start: "2026-07-20T13:00:00Z",
            end: "2026-07-20T13:30:00Z"
          }]
        }
      }
    }), { status: 200 }));

    const busy = await fetchGoogleFreeBusy({
      accessToken: "unit-test-token",
      timeMin: "2026-07-20T04:00:00Z",
      timeMax: "2026-07-21T04:00:00Z",
      timezone: "America/New_York",
      fetcher
    });

    expect(busy).toEqual([{
      start: "2026-07-20T13:00:00.000Z",
      end: "2026-07-20T13:30:00.000Z"
    }]);
    const request = fetcher.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      timeMin: "2026-07-20T04:00:00Z",
      timeMax: "2026-07-21T04:00:00Z",
      timeZone: "America/New_York",
      items: [{ id: "primary" }]
    });
  });

  it("returns a safe typed error for provider and malformed-response failures", async () => {
    const failed = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(fetchGoogleFreeBusy({
      accessToken: "unit-test-token",
      timeMin: "2026-07-20T04:00:00Z",
      timeMax: "2026-07-21T04:00:00Z",
      timezone: "America/New_York",
      fetcher: failed
    })).rejects.toBeInstanceOf(GoogleCalendarUnavailableError);
  });
});
