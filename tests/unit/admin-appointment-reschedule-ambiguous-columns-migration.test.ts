import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0024_fix_admin_reschedule_ambiguous_columns.sql"), "utf8");
const diagnosticMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/0023_admin_appointment_reschedule_diagnostic_categories.sql"), "utf8");

describe("admin appointment reschedule ambiguous-column migration", () => {
  it("qualifies the reschedule-count update against the appointment row", () => {
    expect(migration).toContain("update appointment_requests as appointment");
    expect(migration).toContain("reschedule_count = coalesce(appointment.reschedule_count, 0) + 1");
    expect(migration).not.toContain("reschedule_count = coalesce(reschedule_count, 0) + 1");
  });

  it("keeps function inputs, output signature, and trigger helper boundary unchanged", () => {
    expect(migration).toContain("p_organization_id uuid");
    expect(migration).toContain("p_appointment_id uuid");
    expect(migration).toContain("p_preferred_date date");
    expect(migration).toContain("p_preferred_time time");
    expect(migration).toContain("p_actor_user_id uuid");
    expect(migration).toContain("returns table (\n  appointment_id uuid,\n  previous_date date,\n  previous_time time,\n  preferred_date date,\n  preferred_time time,\n  reschedule_count integer\n)");
    expect(migration).toContain("perform public.assert_appointment_slot_available(p_organization_id, p_appointment_id, p_preferred_date, p_preferred_time, v_duration)");
    expect(migration).not.toContain("create or replace function public.assert_appointment_slot_available");
    expect(migration).not.toContain("create trigger guard_appointment_schedule_write_on_change");
    expect(diagnosticMigration).toContain("create or replace function public.assert_appointment_slot_available");
  });

  it("preserves security, permissions, and stable diagnostics", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) to service_role");
    expect(migration).toContain("AVENSEAL_RESCHEDULE_TENANT_OR_APPOINTMENT_MISMATCH");
    expect(migration).toContain("AVENSEAL_RESCHEDULE_INVALID_SCHEDULE_INPUT");
    expect(migration).toContain("AVENSEAL_RESCHEDULE_RESERVATION_TRANSITION_FAILED");
    expect(migration).toContain("AVENSEAL_RESCHEDULE_AUDIT_INSERT_FAILED");
    expect(diagnosticMigration).toContain("AVENSEAL_RESCHEDULE_MINIMUM_NOTICE");
    expect(diagnosticMigration).toContain("AVENSEAL_RESCHEDULE_APPOINTMENT_OVERLAP");
  });
});
