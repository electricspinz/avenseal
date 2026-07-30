import type { AppointmentRequest } from "@/lib/types";

const day = 24 * 60 * 60 * 1000;

export function clientWorkspaceExpiration(appointment: Pick<AppointmentRequest, "preferredDate" | "preferredTime" | "status" | "serviceDurationMinutesSnapshot">, now = new Date()) {
  if (appointment.status === "cancelled") return new Date(now.getTime() + 7 * day).toISOString();
  const start = new Date(`${appointment.preferredDate}T${appointment.preferredTime}:00`);
  const end = new Date(start.getTime() + (appointment.serviceDurationMinutesSnapshot ?? 0) * 60_000);
  return new Date((Number.isNaN(end.getTime()) ? now.getTime() : end.getTime()) + 30 * day).toISOString();
}

export function normalizeClientWorkspaceEmail(email: string) {
  return email.trim().toLowerCase();
}
