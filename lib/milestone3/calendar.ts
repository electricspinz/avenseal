import { timeToMinutes, minutesToTime } from "@/lib/availability";

export type BusyInterval = {
  start: string;
  end: string;
};

export function slotToDate(date: string, time: string, timezone: string) {
  return new Date(`${date}T${time}:00${timezone === "America/New_York" ? "-04:00" : "Z"}`);
}

export function excludeBusySlots(input: {
  date: string;
  slots: string[];
  durationMinutes: number;
  busy: BusyInterval[];
}) {
  return input.slots.filter((slot) => {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + input.durationMinutes;
    return !input.busy.some((busy) => {
      const busyStart = timeToMinutes(busy.start.slice(11, 16));
      const busyEnd = timeToMinutes(busy.end.slice(11, 16));
      return slotStart < busyEnd && slotEnd > busyStart;
    });
  });
}

export function addMinutesToTime(time: string, minutes: number) {
  return minutesToTime(timeToMinutes(time) + minutes);
}
