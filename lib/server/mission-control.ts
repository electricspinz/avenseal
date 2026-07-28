import type { AppointmentRequest, OrganizationSettings } from "@/lib/types";
import { isValidTimezone } from "@/lib/availability";
import { repository } from "@/lib/server/repository";

type HealthStatus = "healthy" | "attention" | "unconfigured" | "unavailable" | "unknown";

type MissionControlRepository = Pick<typeof repository, "listAppointments" | "getSettings" | "listIntegrations" | "getCommunicationMetrics">;

export type MissionControlSnapshotMetric = {
  label: string;
  value: number | null;
};

export type MissionControlHealthCard = {
  name: string;
  status: HealthStatus;
  detail: string;
  href: string;
  linkLabel: string;
};

export type MissionControlViewModel = {
  dailyBrief: {
    date: string | null;
    hour: number | null;
    appointmentsToday: number | null;
    awaitingReview: number | null;
    communicationsUnavailable: boolean;
  };
  schedule: {
    appointments: AppointmentRequest[] | null;
    timezone: string | null;
  };
  snapshot: MissionControlSnapshotMetric[];
  systemHealth: MissionControlHealthCard[];
  settings: OrganizationSettings | null;
};

export async function loadMissionControlViewModel(
  dataSource: MissionControlRepository = repository,
  now = new Date()
): Promise<MissionControlViewModel> {
  const [appointmentsResult, settingsResult, integrationsResult, communicationMetricsResult] = await Promise.allSettled([
    dataSource.listAppointments(),
    dataSource.getSettings(),
    dataSource.listIntegrations(),
    dataSource.getCommunicationMetrics()
  ]);
  const appointments = appointmentsResult.status === "fulfilled" ? appointmentsResult.value : null;
  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
  const integrations = integrationsResult.status === "fulfilled" ? integrationsResult.value : null;
  const communicationMetrics = communicationMetricsResult.status === "fulfilled" ? communicationMetricsResult.value : null;
  const timezone = organizationTimezone(settings?.business.timezone);
  const localNow = timezone ? localDateTime(now, timezone) : null;
  const schedule = appointments && localNow
    ? appointmentsForDate(appointments, localNow.date)
    : null;
  const appointmentMetrics = appointments && localNow
    ? appointmentMetricValues(appointments, localNow.date, localNow.time)
    : null;

  return {
    dailyBrief: {
      date: localNow ? formatDate(now, timezone!) : null,
      hour: localNow?.hour ?? null,
      appointmentsToday: schedule?.length ?? null,
      awaitingReview: appointmentMetrics?.awaitingReview ?? null,
      communicationsUnavailable: !communicationMetrics
    },
    schedule: { appointments: schedule, timezone },
    snapshot: [
      { label: "Appointments today", value: schedule?.length ?? null },
      { label: "Upcoming appointments", value: appointmentMetrics?.upcoming ?? null },
      { label: "Completed appointments", value: appointmentMetrics?.completed ?? null },
      { label: "Awaiting review", value: appointmentMetrics?.awaitingReview ?? null },
      { label: "Scheduled communications", value: communicationMetrics?.scheduled ?? null },
      { label: "Failed communications", value: communicationMetrics?.failed ?? null }
    ],
    systemHealth: [
      communicationHealth(communicationMetrics),
      reminderQueueHealth(),
      calendarHealth(integrations),
      aiConciergeHealth()
    ],
    settings
  };
}

export function appointmentsForDate(appointments: AppointmentRequest[], date: string) {
  return [...appointments.filter((appointment) => appointment.preferredDate === date)]
    .sort(compareAppointmentsByTime);
}

export function appointmentMetricValues(appointments: AppointmentRequest[], today: string, currentTime: string) {
  return {
    upcoming: appointments.filter((appointment) => isUpcoming(appointment, today, currentTime)).length,
    completed: appointments.filter((appointment) => appointment.status === "completed").length,
    awaitingReview: appointments.filter((appointment) => appointment.status === "awaiting_review").length
  };
}

function isUpcoming(appointment: AppointmentRequest, today: string, currentTime: string) {
  if (!isValidAppointmentTime(appointment.preferredTime)) return false;
  return appointment.preferredDate > today || (appointment.preferredDate === today && appointment.preferredTime >= currentTime);
}

function compareAppointmentsByTime(left: AppointmentRequest, right: AppointmentRequest) {
  const leftTime = timeSortValue(left.preferredTime);
  const rightTime = timeSortValue(right.preferredTime);
  return leftTime - rightTime || left.id.localeCompare(right.id);
}

function timeSortValue(time: string) {
  if (!isValidAppointmentTime(time)) return Number.POSITIVE_INFINITY;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidAppointmentTime(time: string) {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time);
}

function organizationTimezone(timezone: string | undefined) {
  return timezone && isValidTimezone(timezone) ? timezone : null;
}

function localDateTime(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  if (!year || !month || !day || !hour || !minute) return null;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}`, hour: Number(hour) };
}

function formatDate(now: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(now);
}

function communicationHealth(metrics: Awaited<ReturnType<MissionControlRepository["getCommunicationMetrics"]>> | null): MissionControlHealthCard {
  if (!metrics) return { name: "Communications", status: "unknown", detail: "Communication health could not be loaded.", href: "/admin/communications", linkLabel: "Open communications" };
  if (metrics.failed > 0) return { name: "Communications", status: "attention", detail: `${metrics.failed} failed communication${metrics.failed === 1 ? " requires" : "s require"} review.`, href: "/admin/communications", linkLabel: "Open communications" };
  return { name: "Communications", status: "healthy", detail: "Communication metrics loaded with no failed communications.", href: "/admin/communications", linkLabel: "Open communications" };
}

function reminderQueueHealth(): MissionControlHealthCard {
  return { name: "Reminder queue", status: "unknown", detail: "Reminder-queue health is unavailable until a dedicated repository view is available.", href: "/admin/communications", linkLabel: "Open communications" };
}

function calendarHealth(integrations: Awaited<ReturnType<MissionControlRepository["listIntegrations"]>> | null): MissionControlHealthCard {
  const calendar = integrations?.find((integration) => integration.provider === "google_calendar");
  if (!calendar) return { name: "Calendar sync", status: "unknown", detail: "Calendar integration status could not be loaded.", href: "/admin/settings/integrations", linkLabel: "Open integrations" };
  if (calendar.status === "connected") return { name: "Calendar sync", status: "healthy", detail: "Google Calendar is connected.", href: "/admin/settings/integrations", linkLabel: "Open integrations" };
  return { name: "Calendar sync", status: "attention", detail: "Google Calendar requires reconnection before sync can be verified.", href: "/admin/settings/integrations", linkLabel: "Open integrations" };
}

function aiConciergeHealth(): MissionControlHealthCard {
  return { name: "AI concierge", status: "unavailable", detail: "AI concierge health is unavailable until an operational source is available.", href: "/admin/settings", linkLabel: "Open settings" };
}
