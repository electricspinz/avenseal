import { isValidTimezone } from "@/lib/availability";
import type { AdminCommunication, AppointmentRequest } from "@/lib/types";
import { repository } from "@/lib/server/repository";

export type AttentionPriority = "critical" | "high" | "medium" | "low";
export type AttentionCategory = "communications" | "calendar" | "appointments" | "system";
export type AttentionSource = "communications" | "integrations" | "appointments" | "settings";

export type AttentionIssue = {
  id: string;
  priority: AttentionPriority;
  category: AttentionCategory;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  source: AttentionSource;
  createdAt: string | null;
};

export type AttentionEngineRepository = Pick<typeof repository, "listAppointments" | "listAdminCommunications" | "listIntegrations" | "getSettings">;

const priorityRank: Record<AttentionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function loadAttentionIssues(
  dataSource: AttentionEngineRepository = repository,
  now = new Date()
): Promise<AttentionIssue[]> {
  const [appointmentsResult, communicationsResult, integrationsResult, settingsResult] = await Promise.allSettled([
    dataSource.listAppointments(),
    dataSource.listAdminCommunications({ status: "failed", page: 1 }),
    dataSource.listIntegrations(),
    dataSource.getSettings()
  ]);
  const issues = [
    ...(communicationsResult.status === "fulfilled" ? failedCommunicationIssues(communicationsResult.value.records) : [unknownIssue("communications")]),
    ...(integrationsResult.status === "fulfilled" ? disconnectedCalendarIssues(integrationsResult.value) : [unknownIssue("integrations")]),
    ...(appointmentsResult.status === "fulfilled" ? awaitingReviewIssues(appointmentsResult.value) : [unknownIssue("appointments")]),
    ...noAppointmentsTodayIssue(appointmentsResult, settingsResult, now),
    ...(settingsResult.status === "rejected" ? [unknownIssue("settings")] : [])
  ];

  return issues.sort(compareAttentionIssues);
}

function failedCommunicationIssues(communications: AdminCommunication[]): AttentionIssue[] {
  return communications.map((communication) => ({
    id: `communication-failed:${communication.id}`,
    priority: "critical",
    category: "communications",
    title: "Communication failed",
    description: communication.customerName ? `A communication for ${communication.customerName} could not be sent.` : "A communication could not be sent.",
    actionLabel: "Open communication",
    href: `/admin/communications/${encodeURIComponent(communication.id)}`,
    source: "communications",
    createdAt: communication.lastAttemptedAt ?? communication.updatedAt
  }));
}

function disconnectedCalendarIssues(integrations: Awaited<ReturnType<AttentionEngineRepository["listIntegrations"]>>): AttentionIssue[] {
  const calendar = integrations.find((integration) => integration.provider === "google_calendar");
  if (!calendar || calendar.status === "connected") return [];
  return [{
    id: "calendar-integration-disconnected",
    priority: "high",
    category: "calendar",
    title: "Calendar integration disconnected",
    description: "Google Calendar requires reconnection before calendar synchronization can resume.",
    actionLabel: "Open integrations",
    href: "/admin/settings/integrations",
    source: "integrations",
    createdAt: calendar.lastConnectedAt
  }];
}

function awaitingReviewIssues(appointments: AppointmentRequest[]): AttentionIssue[] {
  return appointments
    .filter((appointment) => appointment.status === "awaiting_review")
    .map((appointment) => ({
      id: `appointment-awaiting-review:${appointment.id}`,
      priority: "medium" as const,
      category: "appointments" as const,
      title: "Appointment awaiting review",
      description: appointment.customer.fullName ? `${appointment.customer.fullName}'s booking request is awaiting review.` : "A booking request is awaiting review.",
      actionLabel: "Review appointment",
      href: `/admin/appointments/${appointment.id}`,
      source: "appointments" as const,
      createdAt: appointment.updatedAt
    }));
}

function noAppointmentsTodayIssue(
  appointmentsResult: PromiseSettledResult<AppointmentRequest[]>,
  settingsResult: PromiseSettledResult<Awaited<ReturnType<AttentionEngineRepository["getSettings"]>>>,
  now: Date
): AttentionIssue[] {
  if (appointmentsResult.status !== "fulfilled" || settingsResult.status !== "fulfilled") return [];
  const timezone = settingsResult.value.business.timezone;
  if (!timezone || !isValidTimezone(timezone)) return [];
  const today = localDate(now, timezone);
  if (appointmentsResult.value.some((appointment) => appointment.preferredDate === today)) return [];
  return [{
    id: `no-appointments-today:${today}`,
    priority: "low",
    category: "appointments",
    title: "No appointments today",
    description: "No appointments are recorded for the organization day.",
    actionLabel: "Open appointments",
    href: "/admin/appointments",
    source: "appointments",
    createdAt: null
  }];
}

function unknownIssue(source: AttentionSource): AttentionIssue {
  const label = source === "integrations" ? "calendar integration" : source;
  return {
    id: `unknown-${source}`,
    priority: "low",
    category: "system",
    title: `${capitalize(label)} status unavailable`,
    description: `The ${label} source could not be verified.`,
    actionLabel: source === "integrations" ? "Open integrations" : source === "communications" ? "Open communications" : source === "appointments" ? "Open appointments" : "Open settings",
    href: source === "integrations" ? "/admin/settings/integrations" : source === "communications" ? "/admin/communications" : source === "appointments" ? "/admin/appointments" : "/admin/settings",
    source,
    createdAt: null
  };
}

function compareAttentionIssues(left: AttentionIssue, right: AttentionIssue) {
  const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
  if (priorityDifference !== 0) return priorityDifference;
  const leftTimestamp = timestampValue(left.createdAt);
  const rightTimestamp = timestampValue(right.createdAt);
  if (leftTimestamp === null && rightTimestamp === null) return left.id.localeCompare(right.id);
  if (leftTimestamp === null) return 1;
  if (rightTimestamp === null) return -1;
  return rightTimestamp - leftTimestamp || left.id.localeCompare(right.id);
}

function localDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timestampValue(timestamp: string | null) {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? null : value;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
