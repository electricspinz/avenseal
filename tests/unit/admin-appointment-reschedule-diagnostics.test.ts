import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapAdminAppointmentRescheduleRpcDiagnostic } from "@/lib/server/repository";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0023_admin_appointment_reschedule_diagnostic_categories.sql"), "utf8");

const diagnosticTokens = {
  AVENSEAL_RESCHEDULE_INVALID_SCHEDULE_INPUT: "rpc_invalid_schedule_input",
  AVENSEAL_RESCHEDULE_INACTIVE_OR_UNCONFIGURED_ORGANIZATION: "rpc_inactive_or_unconfigured_organization",
  AVENSEAL_RESCHEDULE_AVAILABILITY_SCHEDULE_MISSING: "rpc_availability_schedule_missing",
  AVENSEAL_RESCHEDULE_INVALID_DST_LOCAL_TIME: "rpc_invalid_dst_local_time",
  AVENSEAL_RESCHEDULE_MINIMUM_NOTICE: "rpc_minimum_notice_violation",
  AVENSEAL_RESCHEDULE_SAME_DAY_DISALLOWED: "rpc_same_day_booking_disallowed",
  AVENSEAL_RESCHEDULE_BEYOND_BOOKING_HORIZON: "rpc_beyond_booking_horizon",
  AVENSEAL_RESCHEDULE_BLOCKED_EXCEPTION: "rpc_blocked_exception",
  AVENSEAL_RESCHEDULE_OUTSIDE_AVAILABILITY_INTERVAL: "rpc_outside_availability_interval",
  AVENSEAL_RESCHEDULE_DAILY_LIMIT_REACHED: "rpc_daily_limit_reached",
  AVENSEAL_RESCHEDULE_APPOINTMENT_OVERLAP: "rpc_appointment_overlap",
  AVENSEAL_RESCHEDULE_RESERVATION_OVERLAP: "rpc_reservation_overlap",
  AVENSEAL_RESCHEDULE_TENANT_OR_APPOINTMENT_MISMATCH: "rpc_tenant_or_appointment_mismatch",
  AVENSEAL_RESCHEDULE_RESERVATION_TRANSITION_FAILED: "rpc_reservation_transition_failed",
  AVENSEAL_RESCHEDULE_AUDIT_INSERT_FAILED: "rpc_audit_insert_failed"
} as const;

describe("admin appointment reschedule SQL diagnostics", () => {
  it("maps only approved stable SQL tokens to safe server categories", () => {
    for (const [token, category] of Object.entries(diagnosticTokens)) {
      expect(migration).toContain(`'${token}'`);
      expect(mapAdminAppointmentRescheduleRpcDiagnostic({ message: token })).toBe(category);
    }
  });

  it("fails closed for unknown database errors without preserving their content", () => {
    const raw = "database failure containing customer@example.com and internal details";
    const category = mapAdminAppointmentRescheduleRpcDiagnostic({ message: raw });
    expect(category).toBe("unknown_rpc_validation_failure");
    expect(category).not.toContain("customer");
    expect(category).not.toContain("internal");
  });

  it("retains function security and atomic reservation/audit exception boundaries", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("exception when others then\n    raise exception 'AVENSEAL_RESCHEDULE_RESERVATION_TRANSITION_FAILED'");
    expect(migration).toContain("exception when others then\n    raise exception 'AVENSEAL_RESCHEDULE_AUDIT_INSERT_FAILED'");
    expect(migration).toContain("grant execute on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) to service_role");
  });
});
