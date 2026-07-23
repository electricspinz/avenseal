import { describe, expect, it } from "vitest";

const utils = await import("../../scripts/google-calendar-verification-utils.mjs");

describe("Google Calendar staging verification helpers", () => {
  it("requires an explicit staging environment marker", () => {
    expect(() => utils.assertStagingEnvironment({ LIVE_SUPABASE_ENVIRONMENT: "staging" })).not.toThrow();
    expect(() => utils.assertStagingEnvironment({ LIVE_SUPABASE_ENVIRONMENT: "production" })).toThrow(/staging/);
    expect(() => utils.assertStagingEnvironment({})).toThrow(/staging/);
  });

  it("reports missing required environment variable names without values", () => {
    expect(() => utils.assertRequiredEnvironment({ A: "set" }, ["A"])).not.toThrow();
    expect(() => utils.assertRequiredEnvironment({ A: "set" }, ["A", "B"])).toThrow(/B/);
  });

  it("builds a primary-calendar free/busy request covering 24 hours", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    expect(utils.buildFreeBusyRequest(now)).toEqual({
      timeMin: "2026-07-23T12:00:00.000Z",
      timeMax: "2026-07-24T12:00:00.000Z",
      items: [{ id: "primary" }]
    });
  });

  it("builds the temporary staging event 48 hours ahead for 15 minutes", () => {
    const event = utils.buildTemporaryEvent(new Date("2026-07-23T12:00:00.000Z"));

    expect(event.summary).toBe("Avenseal Staging Calendar Test");
    expect(event.description).toContain("Temporary event");
    expect(event.start.dateTime).toBe("2026-07-25T12:00:00.000Z");
    expect(event.end.dateTime).toBe("2026-07-25T12:15:00.000Z");
  });

  it("builds a deterministic appointment reschedule pair approximately 48 hours ahead", () => {
    expect(utils.buildStagingAppointmentSchedule(new Date("2026-07-23T12:00:00.000Z"))).toEqual({
      date: "2026-07-25",
      initialTime: "14:00",
      updatedTime: "15:30"
    });
  });

  it("requires Google to return an event id and link or status", () => {
    expect(() => utils.assertGoogleEventCreated({ id: "event-id", htmlLink: "https://calendar.google.test/event" })).not.toThrow();
    expect(() => utils.assertGoogleEventCreated({ id: "event-id", status: "confirmed" })).not.toThrow();
    expect(() => utils.assertGoogleEventCreated({ htmlLink: "https://calendar.google.test/event" })).toThrow(/event ID/);
    expect(() => utils.assertGoogleEventCreated({ id: "event-id" })).toThrow(/event URL or status/);
  });
});
