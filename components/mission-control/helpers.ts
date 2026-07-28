import type { AppointmentRequest } from "@/lib/types";

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getAppointmentsForDate(appointments: AppointmentRequest[], date: string) {
  return appointments
    .filter((appointment) => appointment.preferredDate === date)
    .sort((left, right) => left.preferredTime.localeCompare(right.preferredTime));
}
