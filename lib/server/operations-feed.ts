import type { AdminCommunication, AppointmentRequest } from "@/lib/types";
import { repository } from "@/lib/server/repository";

export type OperationsFeedEventType =
  | "appointment_created"
  | "appointment_updated"
  | "communication_scheduled"
  | "communication_queued"
  | "communication_sent"
  | "communication_failed"
  | "calendar_integration_connected";

export type OperationsFeedSeverity = "info" | "success" | "warning" | "error";

export type OperationsFeedItem = {
  id: string;
  timestamp: string;
  eventType: OperationsFeedEventType;
  title: string;
  description: string;
  source: "appointment" | "communication" | "integration";
  customerName: string | null;
  appointmentId: string | null;
  destinationUrl: string | null;
  severity: OperationsFeedSeverity;
};

export type OperationsFeedViewModel = {
  items: OperationsFeedItem[];
  unavailableSources: string[];
};

export type OperationsFeedRepository = Pick<typeof repository, "listAppointments" | "listAdminCommunications" | "listIntegrations">;

const maximumItems = 20;

export async function loadOperationsFeed(dataSource: OperationsFeedRepository = repository): Promise<OperationsFeedViewModel> {
  const [appointmentsResult, communicationsResult, integrationsResult] = await Promise.allSettled([
    dataSource.listAppointments(),
    dataSource.listAdminCommunications({ page: 1 }),
    dataSource.listIntegrations()
  ]);
  const unavailableSources = [
    appointmentsResult.status !== "fulfilled" && "Appointments",
    communicationsResult.status !== "fulfilled" && "Communications",
    integrationsResult.status !== "fulfilled" && "Integrations"
  ].filter((source): source is string => Boolean(source));
  const items = [
    ...(appointmentsResult.status === "fulfilled" ? appointmentEvents(appointmentsResult.value) : []),
    ...(communicationsResult.status === "fulfilled" ? communicationEvents(communicationsResult.value.records) : []),
    ...(integrationsResult.status === "fulfilled" ? integrationEvents(integrationsResult.value) : [])
  ].sort(compareFeedItems).slice(0, maximumItems);

  return { items, unavailableSources };
}

function appointmentEvents(appointments: AppointmentRequest[]): OperationsFeedItem[] {
  return appointments.flatMap((appointment) => {
    const context = { customerName: appointment.customer.fullName, appointmentId: appointment.id, destinationUrl: `/admin/appointments/${appointment.id}` };
    const created: OperationsFeedItem = {
      id: `appointment-created:${appointment.id}`,
      timestamp: appointment.createdAt,
      eventType: "appointment_created",
      title: "Appointment created",
      description: "A booking request was received.",
      source: "appointment",
      severity: "info",
      ...context
    };
    if (appointment.updatedAt === appointment.createdAt) return [created];
    return [created, {
      id: `appointment-updated:${appointment.id}:${appointment.updatedAt}`,
      timestamp: appointment.updatedAt,
      eventType: "appointment_updated",
      title: "Appointment updated",
      description: "The appointment record was updated.",
      source: "appointment",
      severity: "info",
      ...context
    }];
  });
}

function communicationEvents(communications: AdminCommunication[]): OperationsFeedItem[] {
  return communications.flatMap((communication) => {
    const context = {
      customerName: communication.customerName,
      appointmentId: communication.appointmentId,
      destinationUrl: `/admin/communications/${encodeURIComponent(communication.id)}`
    };
    switch (communication.status) {
      case "scheduled":
        return communication.scheduledFor ? [communicationEvent(communication, "scheduled", communication.scheduledFor, "Communication scheduled", "A communication is scheduled for delivery.", "info", context)] : [];
      case "queued":
        return [communicationEvent(communication, "queued", communication.queuedAt ?? communication.createdAt, "Communication queued", "A communication is queued for delivery.", "info", context)];
      case "sent":
        return communication.sentAt ? [communicationEvent(communication, "sent", communication.sentAt, "Communication sent", "A communication was sent.", "success", context)] : [];
      case "failed":
        return [communicationEvent(communication, "failed", communication.lastAttemptedAt ?? communication.updatedAt, "Communication failed", "A communication could not be sent.", "error", context)];
      default:
        return [];
    }
  });
}

function communicationEvent(
  communication: AdminCommunication,
  event: "scheduled" | "queued" | "sent" | "failed",
  timestamp: string,
  title: string,
  description: string,
  severity: OperationsFeedSeverity,
  context: Pick<OperationsFeedItem, "customerName" | "appointmentId" | "destinationUrl">
): OperationsFeedItem {
  return { id: `communication-${event}:${communication.id}:${timestamp}`, timestamp, eventType: `communication_${event}`, title, description, source: "communication", severity, ...context };
}

function integrationEvents(integrations: Awaited<ReturnType<OperationsFeedRepository["listIntegrations"]>>): OperationsFeedItem[] {
  return integrations.flatMap((integration) => integration.provider === "google_calendar" && integration.status === "connected" && integration.lastConnectedAt
    ? [{
        id: `calendar-integration-connected:${integration.lastConnectedAt}`,
        timestamp: integration.lastConnectedAt,
        eventType: "calendar_integration_connected" as const,
        title: "Calendar integration connected",
        description: "Google Calendar was connected.",
        source: "integration" as const,
        customerName: null,
        appointmentId: null,
        destinationUrl: "/admin/settings/integrations",
        severity: "success" as const
      }]
    : []);
}

function compareFeedItems(left: OperationsFeedItem, right: OperationsFeedItem) {
  const leftTimestamp = timestampValue(left.timestamp);
  const rightTimestamp = timestampValue(right.timestamp);
  if (leftTimestamp === null && rightTimestamp === null) return left.id.localeCompare(right.id);
  if (leftTimestamp === null) return 1;
  if (rightTimestamp === null) return -1;
  return rightTimestamp - leftTimestamp || left.id.localeCompare(right.id);
}

function timestampValue(timestamp: string) {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? null : value;
}
