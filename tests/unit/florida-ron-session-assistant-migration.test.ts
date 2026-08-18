import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = join(process.cwd(), "supabase/migrations/0028_florida_ron_session_assistant.sql");
describe("Florida RON assistant migration", () => {
  it("persists immutable candidate/version snapshots and append-only events with tenant scoping", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("florida_ron_session_assistant_sessions");
    expect(sql).toContain("florida_ron_session_assistant_events");
    expect(sql).toContain("workflow_version text not null");
    expect(sql).toContain("module_versions jsonb not null");
    expect(sql).toContain("organization_id uuid not null");
    expect(sql).toContain("created_at timestamptz not null default now()");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all");
  });

  it("guards audit history and prevents parameter changes once an attempt is no longer prepared", async () => {
    const guards = await readFile(join(process.cwd(), "supabase/migrations/0029_florida_ron_session_assistant_audit_guards.sql"), "utf8");
    expect(guards).toContain("before update or delete on florida_ron_session_assistant_events");
    expect(guards).toContain("append-only");
    expect(guards).toContain("old.state <> 'prepared'");
  });
});
