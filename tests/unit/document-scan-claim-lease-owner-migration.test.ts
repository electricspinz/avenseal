import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0025_document_scan_claim_lease_owner.sql"), "utf8");

describe("document scan claim lease-owner migration", () => {
  it("returns the lease owner required by conditional worker finalization", () => {
    expect(migration).toContain("returns table (id uuid, organization_id uuid, appointment_request_id uuid, document_id uuid, attempt_count integer, claimed_by text)");
    expect(migration).toContain("returning j.id, j.organization_id, j.appointment_request_id, j.document_id, j.attempt_count, j.claimed_by");
  });

  it("preserves bounded claims, reclaimable expired leases, and service-role-only execution", () => {
    expect(migration).toContain("p_lease_seconds integer default 300");
    expect(migration).toContain("p_lease_seconds < 30 or p_lease_seconds > 900");
    expect(migration).toContain("status = 'claimed' and claim_expires_at <= now()");
    expect(migration).toContain("attempt_count = j.attempt_count + 1");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("security definer set search_path = public");
    expect(migration).toContain("revoke all on function public.claim_document_scan_jobs(integer, text, integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_document_scan_jobs(integer, text, integer) to service_role");
  });
});
