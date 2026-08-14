import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0027_fix_status_only_appointment_schedule_guard.sql"),
  "utf8",
);
const availabilityMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0023_admin_appointment_reschedule_diagnostic_categories.sql"),
  "utf8",
);
const rescheduleMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0024_fix_admin_reschedule_ambiguous_columns.sql"),
  "utf8",
);

describe("appointment schedule-write trigger migration", () => {
  it("allows status-only updates without revalidating an unchanged schedule", () => {
    expect(migration).toContain("if tg_op = 'UPDATE'");
    expect(migration).toContain("new.preferred_date is not distinct from old.preferred_date");
    expect(migration).toContain("new.preferred_time is not distinct from old.preferred_time");
    expect(migration).toContain(
      "new.service_duration_minutes_snapshot is not distinct from old.service_duration_minutes_snapshot",
    );
    expect(migration).toContain("return new;");
    expect(migration).not.toContain(
      "before insert or update of preferred_date, preferred_time, status, service_duration_minutes_snapshot",
    );
  });

  it("continues authoritative validation for actual date, time, and duration changes", () => {
    expect(migration).toContain(
      "before insert or update of preferred_date, preferred_time, service_duration_minutes_snapshot",
    );
    expect(migration).toContain("perform public.assert_appointment_slot_available(");
    expect(migration).toContain("new.service_duration_minutes_snapshot");
    expect(rescheduleMigration).toContain(
      "perform public.assert_appointment_slot_available(p_organization_id, p_appointment_id, p_preferred_date, p_preferred_time, v_duration)",
    );
    expect(availabilityMigration).toContain("AVENSEAL_RESCHEDULE_MINIMUM_NOTICE");
  });

  it("does not alter reservation behavior or the guard's security boundary", () => {
    expect(migration).not.toContain("slot_reservations");
    expect(rescheduleMigration).toContain("set status = 'released', updated_at = now()");
    expect(rescheduleMigration).toContain("insert into slot_reservations");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain(
      "revoke all on function public.guard_appointment_schedule_write() from public, anon, authenticated",
    );
  });
});
