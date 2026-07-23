export const stagingOrganizationId = "00000000-0000-4000-8000-000000000001";

export const requiredGoogleCalendarVerificationEnv = [
  "LIVE_SUPABASE_ENVIRONMENT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY"
];

export function assertStagingEnvironment(env) {
  if (env.LIVE_SUPABASE_ENVIRONMENT !== "staging") {
    throw new Error("Refusing to run: LIVE_SUPABASE_ENVIRONMENT must be exactly staging.");
  }
}

export function assertRequiredEnvironment(env, names = requiredGoogleCalendarVerificationEnv) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required Google Calendar verification environment variables: ${missing.join(", ")}`);
  }
}

export function buildFreeBusyRequest(now = new Date()) {
  return {
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    items: [{ id: "primary" }]
  };
}

export function buildTemporaryEvent(now = new Date()) {
  const start = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  return {
    summary: "Avenseal Staging Calendar Test",
    description: "Temporary event created by the Avenseal staging verification script.",
    start: {
      dateTime: start.toISOString()
    },
    end: {
      dateTime: end.toISOString()
    }
  };
}

export function assertGoogleEventCreated(event) {
  if (!event || typeof event.id !== "string" || event.id.length === 0) {
    throw new Error("Google Calendar did not return an event ID.");
  }
  if (typeof event.htmlLink !== "string" && typeof event.status !== "string") {
    throw new Error("Google Calendar did not return an event URL or status.");
  }
}
