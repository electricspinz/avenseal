import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0022_admin_appointment_reschedule.sql"), "utf8");

describe("admin appointment reschedule database hardening", () => {
  it("makes SQL availability validation authoritative for both booking writes and reschedules", () => {
    expect(migration).toContain("create or replace function public.assert_appointment_slot_available");
    expect(migration).toContain("minimum_booking_notice_minutes");
    expect(migration).toContain("maximum_advance_booking_days");
    expect(migration).toContain("same_day_enabled");
    expect(migration).toContain("maximum_appointments_per_day");
    expect(migration).toContain("availability_exceptions");
    expect(migration).toContain("organization_availability_intervals");
    expect(migration).toContain("v_target_at < now()");
    expect(migration).toContain("perform public.assert_appointment_slot_available(p_organization_id");
    expect(migration).toContain("create trigger guard_appointment_schedule_write_on_change");
  });

  it("serializes overlapping local appointment ranges and keeps private helpers uncallable", () => {
    expect(migration).toContain("while v_lock_cursor < v_buffered_end loop");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("revoke all on function public.assert_appointment_slot_available");
    expect(migration).toContain("revoke all on function public.reschedule_admin_appointment");
    expect(migration).toContain("grant execute on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) to service_role");
    expect(migration).toContain("set search_path = public, pg_temp");
  });
});

