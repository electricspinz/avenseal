import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0021_communication_message_archiving.sql"), "utf8");

describe("communication archiving migration", () => {
  it("adds durable message-level archive fields and preserves the reminder lifecycle", () => {
    expect(migration).toContain("add column if not exists archived_at timestamptz");
    expect(migration).toContain("add column if not exists archived_by uuid references user_profiles(id) on delete set null");
    expect(migration).toContain("m.archived_at as archived_at");
    expect(migration).not.toMatch(/update\s+appointment_reminders/i);
  });

  it("updates only a tenant-scoped message and writes an atomic safe audit event", () => {
    expect(migration).toContain("set_communication_message_archived");
    expect(migration).toContain("m.id = p_communication_id");
    expect(migration).toContain("m.organization_id = p_organization_id");
    expect(migration).toContain("'communication.archived'");
    expect(migration).toContain("'communication.unarchived'");
    expect(migration).toContain("actor_user_id");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("grant execute on function set_communication_message_archived(uuid, uuid, uuid, boolean) to service_role");
    expect(migration).toContain("revoke all on function set_communication_message_archived(uuid, uuid, uuid, boolean) from public, anon, authenticated");
  });
});
