import { TZDate } from "@date-fns/tz";
import { getServerEnv } from "@/lib/env";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarEventError,
  updateGoogleCalendarEvent,
  type GoogleCalendarEvent,
  type GoogleCalendarEventInput
} from "@/lib/server/google-calendar";
import { getValidGoogleAccessToken } from "@/lib/server/google-oauth";
import { resolveAppointmentDuration } from "@/lib/server/appointment-services";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AppointmentStatus, CalendarEventMapping } from "@/lib/types";

export type CalendarSyncAppointment = {
  id: string;
  organizationId: string;
  status: AppointmentStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  preferredDate: string;
  preferredTime: string;
  administrativeNotes: string | null;
  serviceId: string | null;
  serviceNameSnapshot: string | null;
  serviceDurationMinutesSnapshot: number | null;
  serviceDeliveryType: "remote" | "in_person" | null;
  timezone: string;
  defaultDurationMinutes: number;
  calendarId: string;
};

export type CalendarSyncMapping = {
  id: string;
  organizationId: string;
  appointmentRequestId: string;
  calendarId: string;
  providerEventId: string | null;
  status: CalendarEventMapping["status"];
  startsAt: string;
  endsAt: string;
  timezone: string;
  meetUrl: string | null;
  providerEtag: string | null;
  retryCount: number;
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

export type CalendarSyncStore = {
  loadAppointment(organizationId: string, appointmentId: string): Promise<CalendarSyncAppointment | null>;
  loadMapping(organizationId: string, appointmentId: string): Promise<CalendarSyncMapping | null>;
  savePending(input: {
    appointment: CalendarSyncAppointment;
    eventId: string;
    startsAt: string;
    endsAt: string;
    existing: CalendarSyncMapping | null;
  }): Promise<CalendarSyncMapping>;
  saveSuccess(input: {
    appointment: CalendarSyncAppointment;
    eventId: string;
    event: GoogleCalendarEvent | null;
    status: "created" | "updated" | "cancelled";
    startsAt: string;
    endsAt: string;
  }): Promise<CalendarSyncMapping>;
  saveFailure(input: {
    appointment: CalendarSyncAppointment;
    eventId: string;
    startsAt: string;
    endsAt: string;
    retryCount: number;
    error: string;
  }): Promise<CalendarSyncMapping>;
  listRetryAppointmentIds(organizationId: string, limit: number): Promise<string[]>;
};

export type CalendarSyncApi = {
  create(input: {
    accessToken: string;
    calendarId: string;
    event: GoogleCalendarEventInput;
  }): Promise<GoogleCalendarEvent>;
  update(input: {
    accessToken: string;
    calendarId: string;
    eventId: string;
    event: GoogleCalendarEventInput;
  }): Promise<GoogleCalendarEvent>;
  delete(input: {
    accessToken: string;
    calendarId: string;
    eventId: string;
  }): Promise<void>;
};

export type CalendarSyncDependencies = {
  store: CalendarSyncStore;
  api: CalendarSyncApi;
  getAccessToken(organizationId: string): Promise<string>;
  log(event: Record<string, unknown>): void;
};

export type CalendarSyncResult = {
  status: "created" | "updated" | "cancelled" | "failed" | "skipped";
  mapping: CalendarSyncMapping | null;
};

const syncableStatuses: AppointmentStatus[] = ["confirmed", "ready", "cancelled"];

export async function synchronizeAppointmentCalendar(
  input: { organizationId: string; appointmentId: string },
  dependencies: CalendarSyncDependencies = defaultDependencies
): Promise<CalendarSyncResult> {
  const appointment = await dependencies.store.loadAppointment(
    input.organizationId,
    input.appointmentId
  );
  if (!appointment || appointment.organizationId !== input.organizationId) {
    throw new Error("Appointment is not available for this organization.");
  }
  if (!syncableStatuses.includes(appointment.status)) {
    return { status: "skipped", mapping: null };
  }

  const { startsAt, endsAt } = appointmentDateTimeRange(appointment);
  const existing = await dependencies.store.loadMapping(input.organizationId, input.appointmentId);
  const eventId = existing?.providerEventId ?? googleEventIdForAppointment(appointment.id);
  const pending = await dependencies.store.savePending({
    appointment,
    eventId,
    startsAt,
    endsAt,
    existing
  });
  const event = buildAppointmentGoogleEvent(appointment, startsAt, endsAt, eventId);

  try {
    const accessToken = await dependencies.getAccessToken(input.organizationId);
    if (appointment.status === "cancelled") {
      await dependencies.api.delete({
        accessToken,
        calendarId: appointment.calendarId,
        eventId
      });
      const mapping = await dependencies.store.saveSuccess({
        appointment,
        eventId,
        event: null,
        status: "cancelled",
        startsAt,
        endsAt
      });
      dependencies.log(calendarSyncLog("cancelled", appointment));
      return { status: "cancelled", mapping };
    }

    let providerEvent: GoogleCalendarEvent;
    let successStatus: "created" | "updated";
    const shouldUpdate = Boolean(existing?.providerEventId && existing.lastSyncedAt);
    if (shouldUpdate) {
      try {
        providerEvent = await dependencies.api.update({
          accessToken,
          calendarId: appointment.calendarId,
          eventId,
          event
        });
        successStatus = "updated";
      } catch (error) {
        if (!(error instanceof GoogleCalendarEventError) || error.status !== 404) throw error;
        providerEvent = await dependencies.api.create({
          accessToken,
          calendarId: appointment.calendarId,
          event
        });
        successStatus = "created";
      }
    } else {
      try {
        providerEvent = await dependencies.api.create({
          accessToken,
          calendarId: appointment.calendarId,
          event
        });
        successStatus = "created";
      } catch (error) {
        if (!(error instanceof GoogleCalendarEventError) || error.status !== 409) throw error;
        providerEvent = await dependencies.api.update({
          accessToken,
          calendarId: appointment.calendarId,
          eventId,
          event
        });
        successStatus = "updated";
      }
    }

    const mapping = await dependencies.store.saveSuccess({
      appointment,
      eventId: providerEvent.id,
      event: providerEvent,
      status: successStatus,
      startsAt,
      endsAt
    });
    dependencies.log(calendarSyncLog(successStatus, appointment));
    return { status: successStatus, mapping };
  } catch (error) {
    const safeError = safeCalendarSyncError(error);
    const mapping = await dependencies.store.saveFailure({
      appointment,
      eventId,
      startsAt,
      endsAt,
      retryCount: pending.retryCount + 1,
      error: safeError
    });
    dependencies.log({
      ...calendarSyncLog("failed", appointment),
      retryCount: mapping.retryCount,
      errorCategory: calendarSyncErrorCategory(error)
    });
    return { status: "failed", mapping };
  }
}

export async function retryPendingCalendarSyncs(
  input: { organizationId: string; limit?: number },
  dependencies: CalendarSyncDependencies = defaultDependencies
) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const appointmentIds = await dependencies.store.listRetryAppointmentIds(input.organizationId, limit);
  const results = [];
  for (const appointmentId of appointmentIds) {
    results.push(await synchronizeAppointmentCalendar({
      organizationId: input.organizationId,
      appointmentId
    }, dependencies));
  }
  return {
    attempted: results.length,
    succeeded: results.filter((result) => result.status !== "failed").length,
    failed: results.filter((result) => result.status === "failed").length
  };
}

export function googleEventIdForAppointment(appointmentId: string) {
  const normalized = appointmentId.toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error("Appointment identifier cannot be used for calendar synchronization.");
  }
  return `avenseal${normalized}`;
}

export function buildAppointmentGoogleEvent(
  appointment: CalendarSyncAppointment,
  startsAt: string,
  endsAt: string,
  eventId = googleEventIdForAppointment(appointment.id)
): GoogleCalendarEventInput {
  const serviceName = appointment.serviceNameSnapshot ?? "Remote online notarization appointment";
  const notes = sanitizeCalendarText(appointment.administrativeNotes ?? "None", 1200);
  return {
    eventId,
    summary: `${sanitizeCalendarText(serviceName, 160)} — ${sanitizeCalendarText(appointment.customerName, 160)}`,
    description: [
      `Customer: ${sanitizeCalendarText(appointment.customerName, 200)}`,
      `Email: ${sanitizeCalendarText(appointment.customerEmail, 240)}`,
      `Phone: ${sanitizeCalendarText(appointment.customerPhone, 80)}`,
      `Appointment notes: ${notes}`,
      `Internal appointment ID: ${appointment.id}`,
      "Booking source: Avenseal customer booking",
      "Managed by Avenseal"
    ].join("\n"),
    startAt: startsAt,
    endAt: endsAt,
    timezone: appointment.timezone,
    requestMeet: appointment.serviceDeliveryType === "remote",
    conferenceRequestId: `meet${eventId}`
  };
}

export function appointmentDateTimeRange(appointment: Pick<
  CalendarSyncAppointment,
  "preferredDate" | "preferredTime" | "timezone" | "serviceDurationMinutesSnapshot" | "defaultDurationMinutes"
>) {
  const [year, month, day] = appointment.preferredDate.split("-").map(Number);
  const [hours, minutes] = appointment.preferredTime.slice(0, 5).split(":").map(Number);
  const start = new TZDate(year, month - 1, day, hours, minutes, 0, appointment.timezone);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day ||
    start.getHours() !== hours ||
    start.getMinutes() !== minutes
  ) {
    throw new Error("Appointment date and time are invalid for the organization timezone.");
  }
  const durationMinutes = resolveAppointmentDuration(
    appointment.serviceDurationMinutesSnapshot,
    appointment.defaultDurationMinutes
  );
  return {
    startsAt: new Date(start.getTime()).toISOString(),
    endsAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString()
  };
}

function sanitizeCalendarText(value: string, maxLength: number) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeCalendarSyncError(error: unknown) {
  if (error instanceof GoogleCalendarEventError) {
    if (error.status === 401 || error.status === 403) {
      return "Google Calendar authorization requires attention.";
    }
    return "Google Calendar event synchronization failed.";
  }
  if (error instanceof Error && error.message.includes("reconnect")) {
    return "Google Calendar authorization requires attention.";
  }
  return "Google Calendar synchronization is temporarily unavailable.";
}

function calendarSyncErrorCategory(error: unknown) {
  if (error instanceof GoogleCalendarEventError) {
    if (error.status === 401 || error.status === 403) return "authorization";
    if (error.status === 404) return "not_found";
    if (error.status === 409) return "conflict";
    return "provider";
  }
  return "connection";
}

function calendarSyncLog(
  action: "created" | "updated" | "cancelled" | "failed",
  appointment: CalendarSyncAppointment
) {
  return {
    component: "google_calendar_sync",
    action,
    organizationId: appointment.organizationId,
    appointmentId: appointment.id
  };
}

const defaultStore: CalendarSyncStore = {
  async loadAppointment(organizationId, appointmentId) {
    const supabase = getSupabaseAdmin();
    const [appointmentResult, organizationResult, rulesResult, integrationResult] = await Promise.all([
      supabase
        .from("appointment_requests")
        .select("id,organization_id,status,service_id,service_name_snapshot,service_duration_minutes_snapshot,preferred_date,preferred_time,administrative_notes,customers(full_name,email,mobile_phone)")
        .eq("organization_id", organizationId)
        .eq("id", appointmentId)
        .limit(1),
      supabase.from("organizations").select("timezone").eq("id", organizationId).limit(1),
      supabase
        .from("appointment_rule_settings")
        .select("default_duration_minutes")
        .eq("organization_id", organizationId)
        .limit(1),
      supabase
        .from("organization_integrations")
        .select("calendar_id")
        .eq("organization_id", organizationId)
        .eq("provider", "google_calendar")
        .limit(1)
    ]);
    for (const result of [appointmentResult, organizationResult, rulesResult, integrationResult]) {
      if (result.error) throw result.error;
    }
    const row = appointmentResult.data?.[0];
    const organization = organizationResult.data?.[0];
    if (!row || !organization) return null;

    let deliveryType: CalendarSyncAppointment["serviceDeliveryType"] = null;
    if (row.service_id) {
      const serviceResult = await supabase
        .from("organization_services")
        .select("delivery_type")
        .eq("organization_id", organizationId)
        .eq("id", row.service_id)
        .limit(1);
      if (serviceResult.error) throw serviceResult.error;
      if (!serviceResult.data?.[0]) {
        throw new Error("Appointment service is not available for this organization.");
      }
      deliveryType = serviceResult.data[0].delivery_type;
    }

    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    if (!customer) throw new Error("Appointment customer is unavailable.");
    return {
      id: row.id,
      organizationId: row.organization_id,
      status: row.status,
      customerName: customer.full_name,
      customerEmail: customer.email,
      customerPhone: customer.mobile_phone,
      preferredDate: row.preferred_date,
      preferredTime: row.preferred_time.slice(0, 5),
      administrativeNotes: row.administrative_notes,
      serviceId: row.service_id,
      serviceNameSnapshot: row.service_name_snapshot,
      serviceDurationMinutesSnapshot: row.service_duration_minutes_snapshot,
      serviceDeliveryType: deliveryType,
      timezone: organization.timezone,
      defaultDurationMinutes: rulesResult.data?.[0]?.default_duration_minutes ?? 30,
      calendarId:
        integrationResult.data?.[0]?.calendar_id ??
        getServerEnv().GOOGLE_CALENDAR_ID ??
        "primary"
    };
  },

  async loadMapping(organizationId, appointmentId) {
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_event_mappings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("appointment_request_id", appointmentId)
      .limit(1);
    if (error) throw error;
    return data?.[0] ? mapSyncMapping(data[0]) : null;
  },

  async savePending(input) {
    const attemptedAt = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_event_mappings")
      .upsert({
        organization_id: input.appointment.organizationId,
        appointment_request_id: input.appointment.id,
        provider: "google_calendar",
        calendar_id: input.appointment.calendarId,
        provider_event_id: input.eventId,
        status: "pending",
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        timezone: input.appointment.timezone,
        retry_count: input.existing?.retryCount ?? 0,
        last_attempted_at: attemptedAt
      }, { onConflict: "organization_id,appointment_request_id" })
      .select()
      .single();
    if (error) throw error;
    return mapSyncMapping(data);
  },

  async saveSuccess(input) {
    const syncedAt = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_event_mappings")
      .update({
        calendar_id: input.appointment.calendarId,
        provider_event_id: input.eventId,
        status: input.status,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        timezone: input.appointment.timezone,
        meet_url: input.event?.meetUrl ?? null,
        provider_etag: input.event?.etag ?? null,
        retry_count: 0,
        last_synced_at: syncedAt,
        last_attempted_at: syncedAt,
        last_error: null,
        last_error_at: null
      })
      .eq("organization_id", input.appointment.organizationId)
      .eq("appointment_request_id", input.appointment.id)
      .select()
      .single();
    if (error) throw error;
    return mapSyncMapping(data);
  },

  async saveFailure(input) {
    const failedAt = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_event_mappings")
      .update({
        calendar_id: input.appointment.calendarId,
        provider_event_id: input.eventId,
        status: "failed",
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        timezone: input.appointment.timezone,
        retry_count: input.retryCount,
        last_attempted_at: failedAt,
        last_error: input.error,
        last_error_at: failedAt
      })
      .eq("organization_id", input.appointment.organizationId)
      .eq("appointment_request_id", input.appointment.id)
      .select()
      .single();
    if (error) throw error;
    return mapSyncMapping(data);
  },

  async listRetryAppointmentIds(organizationId, limit) {
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_event_mappings")
      .select("appointment_request_id")
      .eq("organization_id", organizationId)
      .in("status", ["pending", "failed"])
      .order("last_attempted_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => row.appointment_request_id);
  }
};

const defaultApi: CalendarSyncApi = {
  create: createGoogleCalendarEvent,
  update: updateGoogleCalendarEvent,
  delete: deleteGoogleCalendarEvent
};

const defaultDependencies: CalendarSyncDependencies = {
  store: defaultStore,
  api: defaultApi,
  getAccessToken: getValidGoogleAccessToken,
  log: (event) => console.info("[google-calendar-sync]", event)
};

function mapSyncMapping(row: Record<string, unknown>): CalendarSyncMapping {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    appointmentRequestId: String(row.appointment_request_id),
    calendarId: String(row.calendar_id ?? "primary"),
    providerEventId: typeof row.provider_event_id === "string" ? row.provider_event_id : null,
    status: String(row.status) as CalendarEventMapping["status"],
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    timezone: String(row.timezone),
    meetUrl: typeof row.meet_url === "string" ? row.meet_url : null,
    providerEtag: typeof row.provider_etag === "string" ? row.provider_etag : null,
    retryCount: Number(row.retry_count ?? 0),
    lastSyncedAt: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
    lastAttemptedAt: typeof row.last_attempted_at === "string" ? row.last_attempted_at : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    lastErrorAt: typeof row.last_error_at === "string" ? row.last_error_at : null
  };
}
