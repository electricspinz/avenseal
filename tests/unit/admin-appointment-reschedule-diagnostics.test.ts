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

  it("extracts an exact approved token from supported PostgREST error fields", () => {
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ message: "P0001: AVENSEAL_RESCHEDULE_MINIMUM_NOTICE" })).toBe("rpc_minimum_notice_violation");
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ message: null, details: "AVENSEAL_RESCHEDULE_APPOINTMENT_OVERLAP", hint: null, code: "P0001" })).toBe("rpc_appointment_overlap");
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ message: null, details: null, hint: "AVENSEAL_RESCHEDULE_RESERVATION_OVERLAP", code: "P0001" })).toBe("rpc_reservation_overlap");
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ message: "unrecognized", details: null, hint: null, code: "AVENSEAL_RESCHEDULE_AUDIT_INSERT_FAILED" })).toBe("rpc_audit_insert_failed");
  });

  it("rejects unknown and partial strings without preserving raw database text", () => {
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ message: "AVENSEAL_RESCHEDULE_MINIMUM_NOTIC" })).toBe("unknown_rpc_validation_failure");
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ message: "prefixAVENSEAL_RESCHEDULE_MINIMUM_NOTICE" })).toBe("unknown_rpc_validation_failure");
    const raw = "database failure containing customer@example.com and internal details";
    const category = mapAdminAppointmentRescheduleRpcDiagnostic({ message: raw });
    expect(category).toBe("unknown_rpc_validation_failure");
    expect(category).not.toContain("customer");
    expect(category).not.toContain("internal");
  });

  it("uses a later supported field only when it contains an approved token", () => {
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({
      message: "unapproved database text",
      details: "unapproved details",
      hint: "AVENSEAL_RESCHEDULE_OUTSIDE_AVAILABILITY_INTERVAL",
      code: "P0001"
    })).toBe("rpc_outside_availability_interval");
  });

  it("maps only exact PostgreSQL and PostgREST error codes after token extraction", () => {
    const codeCategories = {
      "42883": "rpc_function_or_signature_missing",
      PGRST202: "rpc_function_or_signature_missing",
      "42703": "rpc_undefined_column",
      "42P01": "rpc_undefined_table",
      "42501": "rpc_permission_denied",
      "42702": "rpc_ambiguous_column",
      "23502": "rpc_not_null_violation",
      "23503": "rpc_foreign_key_violation",
      "23505": "rpc_unique_violation",
      "23514": "rpc_check_violation",
      "22P02": "rpc_invalid_input",
      "22007": "rpc_datetime_failure",
      "22008": "rpc_datetime_failure",
      "21000": "rpc_cardinality_violation",
      P0001: "rpc_uncategorized_raise"
    } as const;

    for (const [code, category] of Object.entries(codeCategories)) {
      expect(mapAdminAppointmentRescheduleRpcDiagnostic({
        message: "unapproved database text",
        details: null,
        hint: null,
        code
      })).toBe(category);
    }
  });

  it("prioritizes an approved token over a generic P0001 code", () => {
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({
      message: "P0001: AVENSEAL_RESCHEDULE_MINIMUM_NOTICE",
      code: "P0001"
    })).toBe("rpc_minimum_notice_violation");
  });

  it("fails closed for unknown database errors without preserving their content", () => {
    const raw = "database failure containing customer@example.com and internal details";
    const category = mapAdminAppointmentRescheduleRpcDiagnostic({ message: raw });
    expect(category).toBe("unknown_rpc_validation_failure");
    expect(category).not.toContain("customer");
    expect(category).not.toContain("internal");
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ code: "unrecognized_code" })).toBe("unknown_rpc_validation_failure");
    expect(mapAdminAppointmentRescheduleRpcDiagnostic({ code: "toString" })).toBe("unknown_rpc_validation_failure");
  });

  it("retains function security and atomic reservation/audit exception boundaries", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("exception when others then\n    raise exception 'AVENSEAL_RESCHEDULE_RESERVATION_TRANSITION_FAILED'");
    expect(migration).toContain("exception when others then\n    raise exception 'AVENSEAL_RESCHEDULE_AUDIT_INSERT_FAILED'");
    expect(migration).toContain("grant execute on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) to service_role");
  });
});
