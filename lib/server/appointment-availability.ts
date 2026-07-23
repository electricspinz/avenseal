import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import { devStore } from "@/lib/server/dev-store";
import { fetchGoogleFreeBusy, type GoogleBusyInterval } from "@/lib/server/google-calendar";
import { getValidGoogleAccessToken } from "@/lib/server/google-oauth";
import { fallbackAvensealOrganizationId } from "@/lib/server/organization";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";
import type { AppointmentStatus, AvailabilityException, AvailabilityInterval } from "@/lib/types";

const defaultSlotIncrementMinutes = 30;
const blockingStatuses: AppointmentStatus[] = [
  "awaiting_review",
  "awaiting_payment",
  "clarification_needed",
  "approved_pending_payment",
  "payment_processing",
  "confirmed",
  "ready",
  "follow_up_required"
];

const availabilityRequestSchema = z.object({
  organizationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "Requested date is invalid."),
  timezone: z.string().min(1).optional(),
  includeUnavailable: z.boolean().optional()
});

export type AvailabilityErrorCode =
  | "invalid_request"
  | "configuration_failure"
  | "google_connection_failure";

export class AppointmentAvailabilityError extends Error {
  constructor(
    public readonly code: AvailabilityErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppointmentAvailabilityError";
  }
}

export type AppointmentSlotRejectionReason =
  | "outside_booking_window"
  | "daily_limit_reached"
  | "appointment_conflict"
  | "reservation_conflict"
  | "calendar_conflict";

export type AppointmentAvailabilitySlot = {
  startAt: string;
  endAt: string;
  available: boolean;
  reason?: AppointmentSlotRejectionReason;
};

export type AppointmentAvailabilityResult = {
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: AppointmentAvailabilitySlot[];
};

export function localTimeForAppointmentSlot(startAt: string, timezone: string) {
  const local = TZDate.tz(timezone, new Date(startAt));
  return `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}

export type AvailabilityRules = {
  defaultDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumBookingNoticeMinutes: number;
  maximumAdvanceBookingDays: number | null;
  sameDayEnabled: boolean;
  maximumAppointmentsPerDay: number | null;
};

export type AppointmentBlocker = {
  date: string;
  time: string;
  durationMinutes: number;
  source: "appointment" | "reservation";
};

export function isBlockingAppointmentStatus(status: AppointmentStatus) {
  return blockingStatuses.includes(status);
}

export type AppointmentAvailabilityData = {
  organization: {
    id: string;
    status: string;
    timezone: string;
  } | null;
  service: {
    id: string;
    organizationId: string;
    durationMinutes: number;
    active: boolean;
    bookable: boolean;
  } | null;
  schedule: {
    timezone: string;
  } | null;
  intervals: AvailabilityInterval[];
  exceptions: AvailabilityException[];
  rules: AvailabilityRules;
  slotIncrementMinutes: number;
  blockers: AppointmentBlocker[];
  activeAppointmentCount: number;
};

export type AppointmentAvailabilityDataSource = {
  load(input: {
    organizationId: string;
    serviceId: string;
    date: string;
    now: Date;
  }): Promise<AppointmentAvailabilityData>;
};

export type GoogleBusyProvider = (input: {
  organizationId: string;
  timezone: string;
  timeMin: string;
  timeMax: string;
  fetcher?: typeof fetch;
}) => Promise<GoogleBusyInterval[]>;

export async function getAvailableAppointmentSlots(
  input: {
    organizationId: string;
    serviceId: string;
    date: string;
    timezone?: string;
    includeUnavailable?: boolean;
  },
  options: {
    dataSource?: AppointmentAvailabilityDataSource;
    googleBusyProvider?: GoogleBusyProvider;
    fetcher?: typeof fetch;
    now?: Date;
  } = {}
): Promise<AppointmentAvailabilityResult> {
  const parsed = availabilityRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppointmentAvailabilityError("invalid_request", "The availability request is invalid.");
  }

  const now = options.now ?? new Date();
  const dataSource = options.dataSource ?? defaultAvailabilityDataSource;
  let data: AppointmentAvailabilityData;
  try {
    data = await dataSource.load({
      organizationId: parsed.data.organizationId,
      serviceId: parsed.data.serviceId,
      date: parsed.data.date,
      now
    });
  } catch {
    throw new AppointmentAvailabilityError("configuration_failure", "Scheduling configuration is unavailable.");
  }

  validateConfiguration(data, parsed.data.organizationId, parsed.data.serviceId, parsed.data.timezone);
  const timezone = data.organization!.timezone;
  const bufferBefore = data.rules.bufferBeforeMinutes;
  const bufferAfter = data.rules.bufferAfterMinutes;
  const dayStart = localDateTime(parsed.data.date, 0, timezone);
  const nextDayStart = localDateTime(addLocalDays(parsed.data.date, 1, timezone), 0, timezone);
  if (!dayStart || !nextDayStart) {
    throw new AppointmentAvailabilityError("configuration_failure", "Scheduling configuration is unavailable.");
  }
  const rangeStart = new Date(dayStart.getTime() - bufferBefore * 60_000);
  const rangeEnd = new Date(nextDayStart.getTime() + bufferAfter * 60_000);

  let googleBusy: GoogleBusyInterval[];
  try {
    googleBusy = await (options.googleBusyProvider ?? defaultGoogleBusyProvider)({
      organizationId: parsed.data.organizationId,
      timezone,
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      fetcher: options.fetcher
    });
  } catch {
    throw new AppointmentAvailabilityError(
      "google_connection_failure",
      "Connected calendar availability is temporarily unavailable."
    );
  }

  const slots = calculateAppointmentSlots({
    date: parsed.data.date,
    timezone,
    durationMinutes: data.service!.durationMinutes,
    intervals: data.intervals,
    exceptions: data.exceptions,
    rules: data.rules,
    slotIncrementMinutes: data.slotIncrementMinutes,
    blockers: data.blockers,
    googleBusy,
    activeAppointmentCount: data.activeAppointmentCount,
    includeUnavailable: parsed.data.includeUnavailable ?? false,
    now
  });

  return {
    date: parsed.data.date,
    timezone,
    durationMinutes: data.service!.durationMinutes,
    slots
  };
}

export function calculateAppointmentSlots(input: {
  date: string;
  timezone: string;
  durationMinutes: number;
  intervals: AvailabilityInterval[];
  exceptions?: AvailabilityException[];
  rules: AvailabilityRules;
  slotIncrementMinutes: number;
  blockers?: AppointmentBlocker[];
  googleBusy?: GoogleBusyInterval[];
  activeAppointmentCount?: number;
  includeUnavailable?: boolean;
  now: Date;
}): AppointmentAvailabilitySlot[] {
  const weekday = weekdayForLocalDate(input.date, input.timezone);
  const exceptionRows = input.exceptions?.filter((item) => item.exceptionDate === input.date) ?? [];
  if (exceptionRows.some((item) => item.closedAllDay)) return [];

  const exceptionIntervals = exceptionRows
    .filter((item) => item.startTime && item.endTime)
    .map((item) => ({
      weekday,
      startTime: item.startTime!,
      endTime: item.endTime!
    }));
  const intervals = exceptionIntervals.length > 0
    ? exceptionIntervals
    : input.intervals.filter((interval) => interval.weekday === weekday);

  const candidates = intervals.flatMap((interval) => {
    const opening = timeToMinutes(interval.startTime);
    const closing = timeToMinutes(interval.endTime);
    const firstStart = opening + input.rules.bufferBeforeMinutes;
    const lastStart = closing - input.durationMinutes - input.rules.bufferAfterMinutes;
    const generated: AppointmentAvailabilitySlot[] = [];

    for (let startMinute = firstStart; startMinute <= lastStart; startMinute += input.slotIncrementMinutes) {
      const start = localDateTime(input.date, startMinute, input.timezone);
      if (!start) continue;
      const end = TZDate.tz(
        input.timezone,
        new Date(start.getTime() + input.durationMinutes * 60_000)
      );
      generated.push({
        startAt: toOffsetIso(start),
        endAt: toOffsetIso(end),
        available: true
      });
    }
    return generated;
  });

  return candidates
    .map((candidate) => rejectUnavailableSlot(candidate, input))
    .filter((slot) => input.includeUnavailable || slot.available);
}

function rejectUnavailableSlot(
  slot: AppointmentAvailabilitySlot,
  input: Parameters<typeof calculateAppointmentSlots>[0]
): AppointmentAvailabilitySlot {
  const start = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  const localToday = localDateKey(input.now, input.timezone);
  const requestedDayOffset = calendarDayDifference(localToday, input.date);
  const minimumStart = input.now.getTime() + input.rules.minimumBookingNoticeMinutes * 60_000;

  if (
    start.getTime() < minimumStart ||
    requestedDayOffset < 0 ||
    (!input.rules.sameDayEnabled && requestedDayOffset === 0) ||
    (input.rules.maximumAdvanceBookingDays !== null &&
      requestedDayOffset > input.rules.maximumAdvanceBookingDays)
  ) {
    return rejected(slot, "outside_booking_window");
  }

  if (
    input.rules.maximumAppointmentsPerDay !== null &&
    (input.activeAppointmentCount ?? 0) >= input.rules.maximumAppointmentsPerDay
  ) {
    return rejected(slot, "daily_limit_reached");
  }

  const bufferedStart = new Date(start.getTime() - input.rules.bufferBeforeMinutes * 60_000);
  const bufferedEnd = new Date(end.getTime() + input.rules.bufferAfterMinutes * 60_000);
  for (const blocker of input.blockers ?? []) {
    const blockerStart = localDateTime(blocker.date, timeToMinutes(blocker.time), input.timezone);
    const blockerEnd = blockerStart
      ? new Date(blockerStart.getTime() + blocker.durationMinutes * 60_000)
      : null;
    if (blockerStart && blockerEnd && overlaps(bufferedStart, bufferedEnd, blockerStart, blockerEnd)) {
      return rejected(slot, blocker.source === "reservation" ? "reservation_conflict" : "appointment_conflict");
    }
  }

  for (const busy of input.googleBusy ?? []) {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);
    if (overlaps(bufferedStart, bufferedEnd, busyStart, busyEnd)) {
      return rejected(slot, "calendar_conflict");
    }
  }

  return slot;
}

function validateConfiguration(
  data: AppointmentAvailabilityData,
  organizationId: string,
  serviceId: string,
  requestedTimezone?: string
) {
  if (!data.organization || data.organization.id !== organizationId || data.organization.status !== "active") {
    throw new AppointmentAvailabilityError("invalid_request", "Organization is not available.");
  }
  if (
    !data.service ||
    data.service.id !== serviceId ||
    data.service.organizationId !== organizationId ||
    !data.service.active ||
    !data.service.bookable
  ) {
    throw new AppointmentAvailabilityError("invalid_request", "Service is not available.");
  }
  if (!isValidTimezone(data.organization.timezone)) {
    throw new AppointmentAvailabilityError("configuration_failure", "Organization timezone is invalid.");
  }
  if (requestedTimezone && requestedTimezone !== data.organization.timezone) {
    throw new AppointmentAvailabilityError("invalid_request", "Timezone does not match the organization.");
  }
  if (!data.schedule || data.schedule.timezone !== data.organization.timezone) {
    throw new AppointmentAvailabilityError("configuration_failure", "Availability schedule is not configured.");
  }
  if (
    !Number.isInteger(data.service.durationMinutes) ||
    data.service.durationMinutes < 5 ||
    !Number.isInteger(data.slotIncrementMinutes) ||
    data.slotIncrementMinutes < 1
  ) {
    throw new AppointmentAvailabilityError("configuration_failure", "Scheduling duration is invalid.");
  }
}

const defaultAvailabilityDataSource: AppointmentAvailabilityDataSource = {
  async load(input) {
    if (!hasSupabaseServiceConfig()) return loadDevelopmentAvailabilityData(input);

    const supabase = getSupabaseAdmin();
    const weekday = weekdayForLocalDate(input.date, "UTC");
    const scheduleResult = await supabase
      .from("organization_availability_schedules")
      .select("id,timezone")
      .eq("organization_id", input.organizationId)
      .eq("is_primary", true)
      .limit(1);
    if (scheduleResult.error) throw scheduleResult.error;
    const schedule = scheduleResult.data?.[0];

    const adjacentDates = [
      addLocalDays(input.date, -1, schedule?.timezone ?? "UTC"),
      input.date,
      addLocalDays(input.date, 1, schedule?.timezone ?? "UTC")
    ];
    const [
      organizationResult,
      serviceResult,
      intervalsResult,
      exceptionsResult,
      rulesResult,
      incrementResult,
      appointmentsResult,
      reservationsResult
    ] = await Promise.all([
      supabase.from("organizations").select("id,status,timezone").eq("id", input.organizationId).limit(1),
      supabase
        .from("organization_services")
        .select("id,organization_id,default_duration_minutes,is_active,delivery_type,metadata")
        .eq("organization_id", input.organizationId)
        .eq("id", input.serviceId)
        .limit(1),
      schedule
        ? supabase
            .from("organization_availability_intervals")
            .select("id,weekday,start_time,end_time,display_order")
            .eq("organization_id", input.organizationId)
            .eq("schedule_id", schedule.id)
            .order("weekday")
            .order("display_order")
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("availability_exceptions")
        .select("exception_date,closed_all_day,is_available,start_time,end_time,reason,customer_message")
        .eq("organization_id", input.organizationId)
        .eq("exception_date", input.date),
      supabase
        .from("appointment_rule_settings")
        .select("default_duration_minutes,buffer_before_minutes,buffer_after_minutes,minimum_booking_notice_minutes,maximum_advance_booking_days,same_day_enabled,maximum_appointments_per_day")
        .eq("organization_id", input.organizationId)
        .limit(1),
      supabase
        .from("availability_rules")
        .select("slot_minutes")
        .eq("organization_id", input.organizationId)
        .eq("weekday", weekday)
        .eq("is_active", true)
        .order("created_at")
        .limit(1),
      supabase
        .from("appointment_requests")
        .select("preferred_date,preferred_time,status")
        .eq("organization_id", input.organizationId)
        .in("preferred_date", adjacentDates)
        .in("status", blockingStatuses),
      supabase
        .from("slot_reservations")
        .select("reserved_date,reserved_time,duration_minutes")
        .eq("organization_id", input.organizationId)
        .in("reserved_date", adjacentDates)
        .eq("status", "active")
        .gt("expires_at", input.now.toISOString())
    ]);

    for (const result of [
      organizationResult,
      serviceResult,
      intervalsResult,
      exceptionsResult,
      rulesResult,
      incrementResult,
      appointmentsResult,
      reservationsResult
    ]) {
      if (result.error) throw result.error;
    }

    const organization = organizationResult.data?.[0];
    const service = serviceResult.data?.[0];
    const rules = rulesResult.data?.[0];
    const appointmentRows = appointmentsResult.data ?? [];
    const reservationRows = reservationsResult.data ?? [];

    return {
      organization: organization
        ? { id: organization.id, status: organization.status, timezone: organization.timezone }
        : null,
      service: service
        ? {
            id: service.id,
            organizationId: service.organization_id,
            durationMinutes: service.default_duration_minutes,
            active: service.is_active,
            bookable:
              service.delivery_type === "remote" &&
              !(isRecord(service.metadata) && service.metadata.bookable === false)
          }
        : null,
      schedule: schedule ? { timezone: schedule.timezone } : null,
      intervals: (intervalsResult.data ?? []).map((row) => ({
        id: row.id,
        weekday: row.weekday,
        startTime: normalizeTime(row.start_time),
        endTime: normalizeTime(row.end_time),
        displayOrder: row.display_order
      })),
      exceptions: (exceptionsResult.data ?? []).map((row) => ({
        exceptionDate: row.exception_date,
        closedAllDay: row.closed_all_day || !row.is_available,
        startTime: row.start_time ? normalizeTime(row.start_time) : null,
        endTime: row.end_time ? normalizeTime(row.end_time) : null,
        reason: row.reason,
        customerMessage: row.customer_message
      })),
      rules: {
        defaultDurationMinutes: rules?.default_duration_minutes ?? 30,
        bufferBeforeMinutes: rules?.buffer_before_minutes ?? 0,
        bufferAfterMinutes: rules?.buffer_after_minutes ?? 0,
        minimumBookingNoticeMinutes: rules?.minimum_booking_notice_minutes ?? 0,
        maximumAdvanceBookingDays: rules?.maximum_advance_booking_days ?? null,
        sameDayEnabled: rules?.same_day_enabled ?? true,
        maximumAppointmentsPerDay: rules?.maximum_appointments_per_day ?? null
      },
      slotIncrementMinutes: incrementResult.data?.[0]?.slot_minutes ?? defaultSlotIncrementMinutes,
      blockers: [
        ...appointmentRows.map((row) => ({
          date: row.preferred_date,
          time: normalizeTime(row.preferred_time),
          durationMinutes: rules?.default_duration_minutes ?? 30,
          source: "appointment" as const
        })),
        ...reservationRows.map((row) => ({
          date: row.reserved_date,
          time: normalizeTime(row.reserved_time),
          durationMinutes: row.duration_minutes,
          source: "reservation" as const
        }))
      ],
      activeAppointmentCount: appointmentRows.filter((row) => row.preferred_date === input.date).length
    };
  }
};

async function loadDevelopmentAvailabilityData(
  input: Parameters<AppointmentAvailabilityDataSource["load"]>[0]
): Promise<AppointmentAvailabilityData> {
  const settings = await devStore.getOrganizationSettings();
  const service = settings.services.find((item) => item.id === input.serviceId) ?? null;
  const bookedTimes = await devStore.getBookedTimes(input.date);
  return {
    organization: {
      id: fallbackAvensealOrganizationId,
      status: "active",
      timezone: settings.business.timezone
    },
    service: service
      ? {
          id: service.id,
          organizationId: fallbackAvensealOrganizationId,
          durationMinutes: service.defaultDurationMinutes,
          active: service.isActive,
          bookable: service.deliveryType === "remote"
        }
      : null,
    schedule: { timezone: settings.business.timezone },
    intervals: settings.intervals,
    exceptions: settings.exceptions,
    rules: {
      defaultDurationMinutes: settings.rules.defaultDurationMinutes,
      bufferBeforeMinutes: settings.rules.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: settings.rules.bufferAfterMinutes ?? 0,
      minimumBookingNoticeMinutes: settings.rules.minimumBookingNoticeMinutes ?? 0,
      maximumAdvanceBookingDays: settings.rules.maximumAdvanceBookingDays,
      sameDayEnabled: settings.rules.sameDayEnabled,
      maximumAppointmentsPerDay: settings.rules.maximumAppointmentsPerDay
    },
    slotIncrementMinutes: defaultSlotIncrementMinutes,
    blockers: [...bookedTimes].map((time) => ({
      date: input.date,
      time,
      durationMinutes: settings.rules.defaultDurationMinutes,
      source: "appointment"
    })),
    activeAppointmentCount: bookedTimes.size
  };
}

const defaultGoogleBusyProvider: GoogleBusyProvider = async (input) => {
  if (!hasSupabaseServiceConfig()) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("google_oauth_connections")
    .select("status")
    .eq("organization_id", input.organizationId)
    .eq("provider", "google")
    .limit(1);
  if (error) throw error;
  if (data?.[0]?.status !== "connected") return [];

  const accessToken = await getValidGoogleAccessToken(input.organizationId, input.fetcher);
  return fetchGoogleFreeBusy({
    accessToken,
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    timezone: input.timezone,
    calendarId: "primary",
    fetcher: input.fetcher
  });
};

function rejected(
  slot: AppointmentAvailabilitySlot,
  reason: AppointmentSlotRejectionReason
): AppointmentAvailabilitySlot {
  return { ...slot, available: false, reason };
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = normalizeTime(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function localDateTime(date: string, minuteOfDay: number, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const result = new TZDate(year, month - 1, day, hours, minutes, 0, timezone);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day ||
    result.getHours() !== hours ||
    result.getMinutes() !== minutes
  ) {
    return null;
  }
  return result;
}

function addLocalDays(date: string, days: number, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new TZDate(year, month - 1, day + days, 12, 0, 0, timezone);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, "0")}-${String(result.getDate()).padStart(2, "0")}`;
}

function weekdayForLocalDate(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new TZDate(year, month - 1, day, 12, 0, 0, timezone).getDay();
}

function localDateKey(date: Date, timezone: string) {
  const local = TZDate.tz(timezone, date);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

function calendarDayDifference(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000
  );
}

function toOffsetIso(date: TZDate) {
  return date.toISOString().replace(".000", "");
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function isRealDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
