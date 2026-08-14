import { mapAdminAppointmentRescheduleRpcDiagnostic } from "@/lib/server/repository";

export const adminAppointmentUpdateDiagnosticCategories = [
  "admin_context_rejected",
  "invalid_update",
  "appointment_missing_or_wrong_tenant",
  "appointment_schedule_guard_rejected",
  "appointment_write_constraint_failure",
  "appointment_write_permission_denied",
  "appointment_write_unknown_database_failure",
  "unknown_update_failure",
] as const;

export type AdminAppointmentUpdateDiagnosticCategory =
  (typeof adminAppointmentUpdateDiagnosticCategories)[number];

const scheduleGuardCategories = new Set([
  "rpc_invalid_schedule_input",
  "rpc_inactive_or_unconfigured_organization",
  "rpc_availability_schedule_missing",
  "rpc_invalid_dst_local_time",
  "rpc_minimum_notice_violation",
  "rpc_same_day_booking_disallowed",
  "rpc_beyond_booking_horizon",
  "rpc_blocked_exception",
  "rpc_outside_availability_interval",
  "rpc_daily_limit_reached",
  "rpc_appointment_overlap",
  "rpc_reservation_overlap",
]);

/** Temporary, non-sensitive production diagnostic; remove after one reproduction. */
export function logAdminAppointmentUpdateDiagnostic(category: AdminAppointmentUpdateDiagnosticCategory) {
  console.error("[admin-appointment-update]", { category });
}

export function classifyAdminAppointmentUpdateWriteError(
  error: unknown,
): AdminAppointmentUpdateDiagnosticCategory {
  const rescheduleDiagnostic = mapAdminAppointmentRescheduleRpcDiagnostic(error);
  if (scheduleGuardCategories.has(rescheduleDiagnostic)) {
    return "appointment_schedule_guard_rejected";
  }

  if (typeof error !== "object" || error === null) {
    return "unknown_update_failure";
  }

  const code = typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;

  if (code === "42501") return "appointment_write_permission_denied";
  if (["23502", "23503", "23505", "23514"].includes(code ?? "")) {
    return "appointment_write_constraint_failure";
  }
  if (code) return "appointment_write_unknown_database_failure";
  return "unknown_update_failure";
}
