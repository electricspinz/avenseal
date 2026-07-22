import type { AppointmentRules, AvailabilityException, AvailabilityInterval } from "@/lib/types";

export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
] as const;

export function isValidTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTime(value: string) {
  return value.slice(0, 5);
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = normalizeTime(value).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function weekdayForDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function validateIntervals(intervals: AvailabilityInterval[]) {
  const errors: string[] = [];
  const byDay = new Map<number, AvailabilityInterval[]>();

  for (const interval of intervals) {
    if (!Number.isInteger(interval.weekday) || interval.weekday < 0 || interval.weekday > 6) {
      errors.push("Weekday must be between Sunday and Saturday.");
      continue;
    }
    if (!interval.startTime || !interval.endTime) {
      errors.push(`${weekdays[interval.weekday]} needs both opening and closing times.`);
      continue;
    }
    if (timeToMinutes(interval.startTime) >= timeToMinutes(interval.endTime)) {
      errors.push(`${weekdays[interval.weekday]} closing time must be after opening time.`);
    }
    byDay.set(interval.weekday, [...(byDay.get(interval.weekday) ?? []), interval]);
  }

  for (const [weekday, dayIntervals] of byDay.entries()) {
    const sorted = [...dayIntervals].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    for (let index = 1; index < sorted.length; index += 1) {
      if (timeToMinutes(sorted[index].startTime) < timeToMinutes(sorted[index - 1].endTime)) {
        errors.push(`${weekdays[weekday]} has overlapping availability intervals.`);
      }
    }
  }

  return errors;
}

export function generateSlots(input: {
  date: string;
  intervals: AvailabilityInterval[];
  exceptions?: AvailabilityException[];
  rules: Pick<AppointmentRules, "defaultDurationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes">;
  slotStepMinutes?: number;
}) {
  const exception = input.exceptions?.find((item) => item.exceptionDate === input.date);
  if (exception?.closedAllDay) return [];

  const duration = input.rules.defaultDurationMinutes;
  const bufferBefore = input.rules.bufferBeforeMinutes ?? 0;
  const bufferAfter = input.rules.bufferAfterMinutes ?? 0;
  const step = input.slotStepMinutes ?? 30;

  const activeIntervals = exception?.startTime && exception.endTime
    ? [{ weekday: weekdayForDate(input.date), startTime: exception.startTime, endTime: exception.endTime }]
    : input.intervals.filter((interval) => interval.weekday === weekdayForDate(input.date));

  return activeIntervals.flatMap((interval) => {
    const firstStart = timeToMinutes(interval.startTime) + bufferBefore;
    const lastStart = timeToMinutes(interval.endTime) - duration - bufferAfter;
    const slots: string[] = [];
    for (let cursor = firstStart; cursor <= lastStart; cursor += step) {
      slots.push(minutesToTime(cursor));
    }
    return slots;
  });
}

export function isSlotAvailable(input: {
  date: string;
  time: string;
  intervals: AvailabilityInterval[];
  exceptions?: AvailabilityException[];
  rules: Pick<AppointmentRules, "defaultDurationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes">;
}) {
  return generateSlots(input).includes(normalizeTime(input.time));
}
