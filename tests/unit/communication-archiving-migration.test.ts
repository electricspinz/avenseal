import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/0021_communication_message_archiving.sql", import.meta.url);

describe("communication archiving migration", () => {
  it("adds durable message-level archive fields and preserves the reminder lifecycle", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("add column if not exists archived_at timestamptz");
    expect(sql).toContain("add column if not exists archived_by uuid references user_profiles(id) on delete set null");
    expect(sql).toContain("m.archived_at as archived_at");
    expect(sql).not.toMatch(/update\s+appointment_reminders/i);
  });

  it("updates only a tenant-scoped message and writes an atomic safe audit event", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("set_communication_message_archived");
    expect(sql).toContain("m.id = p_communication_id");
    expect(sql).toContain("m.organization_id = p_organization_id");
    expect(sql).toContain("'communication.archived'");
    expect(sql).toContain("'communication.unarchived'");
    expect(sql).toContain("actor_user_id");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("grant execute on function set_communication_message_archived(uuid, uuid, uuid, boolean) to service_role");
    expect(sql).toContain("revoke all on function set_communication_message_archived(uuid, uuid, uuid, boolean) from public, anon, authenticated");
  });
});
