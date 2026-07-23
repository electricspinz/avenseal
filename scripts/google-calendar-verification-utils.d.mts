export const stagingOrganizationId: string;
export const requiredGoogleCalendarVerificationEnv: string[];

export function assertStagingEnvironment(env: Record<string, string | undefined>): void;
export function assertRequiredEnvironment(env: Record<string, string | undefined>, names?: string[]): void;

export type GoogleFreeBusyRequest = {
  timeMin: string;
  timeMax: string;
  items: Array<{ id: "primary" }>;
};

export type GoogleCalendarEventInput = {
  summary: string;
  description: string;
  start: { dateTime: string };
  end: { dateTime: string };
};

export function buildFreeBusyRequest(now?: Date): GoogleFreeBusyRequest;
export function buildTemporaryEvent(now?: Date): GoogleCalendarEventInput;
export function assertGoogleEventCreated(event: unknown): void;
