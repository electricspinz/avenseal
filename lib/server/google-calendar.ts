export type GoogleBusyInterval = {
  start: string;
  end: string;
};

export type GoogleCalendarEventInput = {
  eventId: string;
  summary: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  requestMeet: boolean;
  conferenceRequestId: string;
};

export type GoogleCalendarEvent = {
  id: string;
  status: string | null;
  htmlLink: string | null;
  meetUrl: string | null;
  etag: string | null;
  summary: string | null;
  startAt: string | null;
  endAt: string | null;
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

export class GoogleCalendarEventError extends Error {
  constructor(
    public readonly operation: "create" | "update" | "delete" | "get",
    public readonly status: number | null
  ) {
    super(`Google Calendar event ${operation} failed.`);
    this.name = "GoogleCalendarEventError";
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

export async function createGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId?: string;
  event: GoogleCalendarEventInput;
  fetcher?: typeof fetch;
}): Promise<GoogleCalendarEvent> {
  const body = calendarEventBody(input.event, true);
  const response = await googleCalendarRequest({
    accessToken: input.accessToken,
    calendarId: input.calendarId,
    operation: "create",
    method: "POST",
    query: input.event.requestMeet ? "?conferenceDataVersion=1" : "",
    body,
    fetcher: input.fetcher
  });
  return parseGoogleCalendarEvent(response);
}

export async function updateGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId?: string;
  eventId: string;
  event: GoogleCalendarEventInput;
  fetcher?: typeof fetch;
}): Promise<GoogleCalendarEvent> {
  const response = await googleCalendarRequest({
    accessToken: input.accessToken,
    calendarId: input.calendarId,
    eventId: input.eventId,
    operation: "update",
    method: "PATCH",
    query: "?conferenceDataVersion=1",
    body: calendarEventBody(input.event, false, true),
    fetcher: input.fetcher
  });
  return parseGoogleCalendarEvent(response, "update");
}

export async function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId?: string;
  eventId: string;
  fetcher?: typeof fetch;
}) {
  try {
    await googleCalendarRequest({
      accessToken: input.accessToken,
      calendarId: input.calendarId,
      eventId: input.eventId,
      operation: "delete",
      method: "DELETE",
      fetcher: input.fetcher
    });
  } catch (error) {
    if (
      error instanceof GoogleCalendarEventError &&
      (error.status === 404 || error.status === 410)
    ) {
      return;
    }
    throw error;
  }
}

export async function fetchGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId?: string;
  eventId: string;
  fetcher?: typeof fetch;
}): Promise<GoogleCalendarEvent | null> {
  try {
    const response = await googleCalendarRequest({
      accessToken: input.accessToken,
      calendarId: input.calendarId,
      eventId: input.eventId,
      operation: "get",
      method: "GET",
      fetcher: input.fetcher
    });
    return parseGoogleCalendarEvent(response, "get");
  } catch (error) {
    if (
      error instanceof GoogleCalendarEventError &&
      (error.status === 404 || error.status === 410)
    ) {
      return null;
    }
    throw error;
  }
}

function calendarEventBody(
  event: GoogleCalendarEventInput,
  includeId: boolean,
  includeConferenceUpdate = false
) {
  return {
    ...(includeId ? { id: event.eventId } : {}),
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startAt, timeZone: event.timezone },
    end: { dateTime: event.endAt, timeZone: event.timezone },
    ...((includeId || includeConferenceUpdate) && event.requestMeet
      ? {
          conferenceData: {
            createRequest: {
              requestId: event.conferenceRequestId,
              conferenceSolutionKey: { type: "hangoutsMeet" }
            }
          }
        }
      : includeConferenceUpdate
        ? { conferenceData: null }
        : {})
  };
}

async function googleCalendarRequest(input: {
  accessToken: string;
  calendarId?: string;
  eventId?: string;
  operation: "create" | "update" | "delete" | "get";
  method: "POST" | "PATCH" | "DELETE" | "GET";
  query?: string;
  body?: unknown;
  fetcher?: typeof fetch;
}) {
  const calendarId = input.calendarId ?? "primary";
  const eventPath = input.eventId ? `/${encodeURIComponent(input.eventId)}` : "";
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventPath}${input.query ?? ""}`;
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    });
  } catch {
    throw new GoogleCalendarEventError(input.operation, null);
  }
  if (!response.ok) {
    throw new GoogleCalendarEventError(input.operation, response.status);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => {
    throw new GoogleCalendarEventError(input.operation, response.status);
  });
}

function parseGoogleCalendarEvent(
  value: unknown,
  operation: GoogleCalendarEventError["operation"] = "create"
): GoogleCalendarEvent {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new GoogleCalendarEventError(operation, null);
  }
  const conferenceData = isRecord(value.conferenceData) ? value.conferenceData : null;
  const entryPoints = Array.isArray(conferenceData?.entryPoints) ? conferenceData.entryPoints : [];
  const videoEntry = entryPoints.find((entry) =>
    isRecord(entry) && entry.entryPointType === "video" && typeof entry.uri === "string"
  );
  const start = isRecord(value.start) ? value.start : null;
  const end = isRecord(value.end) ? value.end : null;
  return {
    id: value.id,
    status: typeof value.status === "string" ? value.status : null,
    htmlLink: typeof value.htmlLink === "string" ? value.htmlLink : null,
    meetUrl:
      typeof value.hangoutLink === "string"
        ? value.hangoutLink
        : isRecord(videoEntry) && typeof videoEntry.uri === "string"
          ? videoEntry.uri
          : null,
    etag: typeof value.etag === "string" ? value.etag : null,
    summary: typeof value.summary === "string" ? value.summary : null,
    startAt: typeof start?.dateTime === "string" ? start.dateTime : null,
    endAt: typeof end?.dateTime === "string" ? end.dateTime : null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
