import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isActionRequiredEligible } from "@/lib/server/action-required-eligibility";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0032_production_operational_cutover.sql"), "utf8");
const cutover = { productionCutoverAt: "2026-08-21T00:00:00.000Z" };

describe("Production Clean Slate eligibility", () => {
  it("excludes an archived historical failed communication while preserving its failed state outside Action Required", () => {
    expect(isActionRequiredEligible({ requiresAction: true, archivedAt: "2026-08-20T23:00:00.000Z" }, cutover)).toBe(false);
    expect("failed").toBe("failed");
  });

  it("keeps a new production failure actionable", () => {
    expect(isActionRequiredEligible({ requiresAction: true }, cutover)).toBe(true);
  });

  it("excludes structurally marked test data even after cutover", () => {
    expect(isActionRequiredEligible({ requiresAction: true, isTestData: true }, cutover)).toBe(false);
  });

  it("does not hide a non-test customer record solely because it predates cutover", () => {
    expect(isActionRequiredEligible({ requiresAction: true }, cutover)).toBe(true);
  });

  it("requires an unresolved operational condition", () => {
    expect(isActionRequiredEligible({ requiresAction: false }, cutover)).toBe(false);
  });
});

describe("Production Clean Slate migration", () => {
  it("adds tenant-scoped cutover, test classification, and an auditable document-action dismissal boundary", () => {
    expect(migration).toContain("add column if not exists is_test_data boolean not null default false");
    expect(migration).toContain("create table if not exists organization_operational_cutovers");
    expect(migration).toContain("production_cutover_at timestamptz not null");
    expect(migration).toContain("create table if not exists operational_action_dismissals");
    expect(migration).toContain("reason = 'pre_production_cleanup'");
    expect(migration).toContain("organization_id uuid not null references organizations(id)");
  });

  it("archives only failed pre-cutover communications and never rewrites them as sent", () => {
    expect(migration).toContain("m.status = 'failed'");
    expect(migration).toContain("m.created_at < v_cutover");
    expect(migration).toContain("'communication.archived'");
    expect(migration).toContain("'pre_production_cleanup'");
    expect(migration).not.toContain("set status = 'sent'");
  });

  it("is idempotent and only dismisses security actions for structurally marked test appointments", () => {
    expect(migration).toContain("on conflict (organization_id, entity_type, entity_id) do nothing");
    expect(migration).toContain("a.is_test_data = true");
    expect(migration).toContain("'operational_action.dismissed'");
    expect(migration).toContain("grant execute on function apply_pre_production_operational_cleanup(uuid) to service_role");
  });
});
