export type GoogleBusyInterval = {
  start: string;
  end: string;
};

type GoogleFreeBusyResponse = {
  calendars?: Record<string, {
    busy?: Array<{ start?: unknown; end?: unknown }>;
    errors?: unknown[];
  }>;
};

export class GoogleCalendarUnavailableError extends Error {
  constructor() {
    super("Google Calendar availability is temporarily unavailable.");
    this.name = "GoogleCalendarUnavailableError";
  }
}

export async function fetchGoogleFreeBusy(input: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
  timezone: string;
  calendarId?: string;
  fetcher?: typeof fetch;
}): Promise<GoogleBusyInterval[]> {
  const calendarId = input.calendarId ?? "primary";
  const fetcher = input.fetcher ?? fetch;
  let response: Response;

  try {
    response = await fetcher("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        timeZone: input.timezone,
        items: [{ id: calendarId }]
      })
    });
  } catch {
    throw new GoogleCalendarUnavailableError();
  }

  const body = await response.json().catch(() => null) as GoogleFreeBusyResponse | null;
  const calendar = body?.calendars?.[calendarId];
  if (!response.ok || !calendar || (calendar.errors?.length ?? 0) > 0 || !Array.isArray(calendar.busy)) {
    throw new GoogleCalendarUnavailableError();
  }

  const busy: GoogleBusyInterval[] = [];
  for (const interval of calendar.busy) {
    if (typeof interval.start !== "string" || typeof interval.end !== "string") {
      throw new GoogleCalendarUnavailableError();
    }
    const start = new Date(interval.start);
    const end = new Date(interval.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      throw new GoogleCalendarUnavailableError();
    }
    busy.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return busy;
}
