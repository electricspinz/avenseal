import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDocumentScanJobStore, documentScanMaximumAttempts, documentScanRetryAt, getDocumentScanMetrics } from "@/lib/server/document-security/scan-jobs";

describe("document scan job migration contract", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0020_document_scan_jobs.sql"), "utf8");

  it("uses a constrained, service-role-only queue with atomic SKIP LOCKED claims", () => {
    for (const field of ["organization_id", "appointment_request_id", "document_id", "attempt_count", "next_attempt_at", "claim_expires_at", "last_failure_category", "scan_duration_ms"]) expect(sql).toContain(field);
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("where status in ('pending', 'claimed', 'retry_scheduled')");
    expect(sql).toContain("revoke all on function claim_document_scan_jobs");
    expect(sql).toContain("grant execute on function claim_document_scan_jobs");
    for (const forbidden of ["storage_key text", "original_filename", "signed_url", "provider_response", "workspace_token", "jsonb provider"]) expect(sql).not.toContain(forbidden);
  });

  it("centralizes the bounded retry schedule with bounded jitter", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(documentScanMaximumAttempts).toBe(5);
    expect(documentScanRetryAt(1, now, () => 0)).toBe("2026-08-01T00:01:00.000Z");
    expect(documentScanRetryAt(2, now, () => 1)).toBe("2026-08-01T00:05:30.000Z");
    expect(documentScanRetryAt(5, now, () => 0)).toBe("2026-08-01T06:00:00.000Z");
  });
});

describe("document scan job store", () => {
  it("uses the trusted enqueue RPC and maps only the worker projection", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const supabase = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return Promise.resolve({ data: name === "enqueue_document_scan_job" ? "job-1" : [{ id: "job-1", organization_id: "org-1", appointment_request_id: "appointment-1", document_id: "document-1", status: "claimed", attempt_count: 1, next_attempt_at: "2026-08-01T00:00:00.000Z", claimed_at: "2026-08-01T00:00:00.000Z", claim_expires_at: "2026-08-01T00:05:00.000Z", claimed_by: "worker", last_failure_category: null, provider: null, provider_request_id: null, scan_duration_ms: null, completed_at: null }], error: null });
      }
    } as never;
    const store = createDocumentScanJobStore(supabase);
    await expect(store.enqueue({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1" })).resolves.toBe("job-1");
    await expect(store.claim({ batchSize: 100, claimedBy: "worker", leaseSeconds: 300 })).resolves.toMatchObject([{ id: "job-1", organizationId: "org-1", attemptCount: 1, claimedBy: "worker" }]);
    expect(calls).toEqual(expect.arrayContaining([
      { name: "enqueue_document_scan_job", args: { p_organization_id: "org-1", p_appointment_request_id: "appointment-1", p_document_id: "document-1" } },
      { name: "claim_document_scan_jobs", args: { p_batch_size: 20, p_claimed_by: "worker", p_lease_seconds: 300 } }
    ]));
  });

  it("fails closed when a claim response omits the lease owner", async () => {
    const supabase = {
      rpc: async () => ({ data: [{ id: "job-1", organization_id: "org-1", appointment_request_id: "appointment-1", document_id: "document-1", attempt_count: 1 }], error: null })
    } as never;

    await expect(createDocumentScanJobStore(supabase).claim({ claimedBy: "worker" })).rejects.toThrow("Document scan claim is missing lease ownership.");
  });

  it("carries the returned lease owner into every conditional finalization and does not count zero-row updates as success", async () => {
    const filters: Array<[string, unknown]> = [];
    const updateChain = { eq: (field: string, value: unknown) => { filters.push([field, value]); return updateChain; }, select: () => updateChain, maybeSingle: async () => ({ data: null, error: null }) };
    const row = { id: "job-1", organization_id: "org-1", appointment_request_id: "appointment-1", document_id: "document-1", attempt_count: 1, claimed_by: "worker-1" };
    const supabase = {
      rpc: async () => ({ data: [row], error: null }),
      from: (table: string) => table === "document_scan_jobs" ? { update: () => updateChain } : { insert: async () => ({ error: null }) }
    } as never;
    const store = createDocumentScanJobStore(supabase);
    const [job] = await store.claim({ claimedBy: "worker-1" });

    await expect(store.complete(job, { outcome: "clean", provider: "fake" })).resolves.toBeNull();
    await expect(store.block(job, { outcome: "infected", provider: "fake" })).resolves.toBe(false);
    await expect(store.scheduleRetry(job, { outcome: "retryable_failure", provider: "fake", safeFailureCategory: "provider_unavailable" }, new Date("2026-08-01T00:00:00.000Z"))).resolves.toBe(false);
    await expect(store.fail(job, { outcome: "permanent_failure", provider: "fake", safeFailureCategory: "provider_rejected" })).resolves.toBe(false);
    await expect(store.cancel(job)).resolves.toBe(false);

    expect(filters.filter(([field, value]) => field === "claimed_by" && value === "worker-1")).toHaveLength(5);
  });

  it("derives tenant-scoped safe operational metrics without exposing job details", async () => {
    const rows = [
      { status: "pending", created_at: "2026-08-01T00:00:00.000Z", completed_at: null, scan_duration_ms: null },
      { status: "retry_scheduled", created_at: "2026-08-01T01:00:00.000Z", completed_at: null, scan_duration_ms: null },
      { status: "completed", created_at: "2026-08-01T02:00:00.000Z", completed_at: "2026-08-01T03:00:00.000Z", scan_duration_ms: 100 },
      { status: "blocked", created_at: "2026-08-01T04:00:00.000Z", completed_at: null, scan_duration_ms: 300 }
    ];
    const filters: Array<[string, unknown]> = [];
    const chain = { select: () => chain, eq: (field: string, value: unknown) => { filters.push([field, value]); return chain; }, then: (resolve: (value: { data: typeof rows; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve) };
    const metrics = await getDocumentScanMetrics({ from: () => chain } as never, "org-1");
    expect(metrics).toEqual({ pending: 1, retryScheduled: 1, claimed: 0, failed: 0, blocked: 1, oldestPendingAt: "2026-08-01T00:00:00.000Z", lastSuccessfulScanAt: "2026-08-01T03:00:00.000Z", averageScanDurationMs: 200 });
    expect(filters).toContainEqual(["organization_id", "org-1"]);
    expect(JSON.stringify(metrics)).not.toContain("document-1");
  });

  it("does not let a stale worker schedule a retry or create an audit after lease ownership changes", async () => {
    const filters: Array<[string, unknown]> = [];
    const audits: unknown[] = [];
    const updateChain = { eq: (field: string, value: unknown) => { filters.push([field, value]); return updateChain; }, select: () => updateChain, maybeSingle: async () => ({ data: null, error: null }) };
    const supabase = { from: (table: string) => table === "document_scan_jobs" ? { update: () => updateChain } : { insert: (value: unknown) => { audits.push(value); return Promise.resolve({ error: null }); } } } as never;
    const job = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed" as const, attemptCount: 1, nextAttemptAt: "2026-08-01T00:00:00.000Z", claimedAt: "2026-08-01T00:00:00.000Z", claimExpiresAt: "2026-08-01T00:05:00.000Z", claimedBy: "worker-original", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    await expect(createDocumentScanJobStore(supabase).scheduleRetry(job, { outcome: "retryable_failure", provider: "fake", safeFailureCategory: "provider_unavailable" }, new Date("2026-08-01T00:00:00.000Z"))).resolves.toBe(false);
    expect(filters).toContainEqual(["claimed_by", "worker-original"]);
    expect(audits).toEqual([]);
  });

  it("does not let a stale worker complete a claimed job", async () => {
    const filters: Array<[string, unknown]> = [];
    const updateChain = { eq: (field: string, value: unknown) => { filters.push([field, value]); return updateChain; }, select: () => updateChain, maybeSingle: async () => ({ data: null, error: null }) };
    const supabase = { from: () => ({ update: () => updateChain }) } as never;
    const job = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed" as const, attemptCount: 1, nextAttemptAt: "2026-08-01T00:00:00.000Z", claimedAt: "2026-08-01T00:00:00.000Z", claimExpiresAt: "2026-08-01T00:05:00.000Z", claimedBy: "worker-original", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    await expect(createDocumentScanJobStore(supabase).complete(job, { outcome: "clean", provider: "fake" })).resolves.toBeNull();
    expect(filters).toContainEqual(["claimed_by", "worker-original"]);
  });

  it("does not let a stale worker block a claimed job or write its audit", async () => {
    const filters: Array<[string, unknown]> = [];
    const audits: unknown[] = [];
    const updateChain = { eq: (field: string, value: unknown) => { filters.push([field, value]); return updateChain; }, select: () => updateChain, maybeSingle: async () => ({ data: null, error: null }) };
    const supabase = { from: (table: string) => table === "document_scan_jobs" ? { update: () => updateChain } : { insert: (value: unknown) => { audits.push(value); return Promise.resolve({ error: null }); } } } as never;
    const job = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed" as const, attemptCount: 1, nextAttemptAt: "2026-08-01T00:00:00.000Z", claimedAt: "2026-08-01T00:00:00.000Z", claimExpiresAt: "2026-08-01T00:05:00.000Z", claimedBy: "worker-original", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };

    await expect(createDocumentScanJobStore(supabase).block(job, { outcome: "infected", provider: "fake" })).resolves.toBe(false);

    expect(filters).toContainEqual(["claimed_by", "worker-original"]);
    expect(audits).toEqual([]);
  });

  it("does not let a stale worker fail a claimed job or write its audit", async () => {
    const filters: Array<[string, unknown]> = [];
    const audits: unknown[] = [];
    const updateChain = { eq: (field: string, value: unknown) => { filters.push([field, value]); return updateChain; }, select: () => updateChain, maybeSingle: async () => ({ data: null, error: null }) };
    const supabase = { from: (table: string) => table === "document_scan_jobs" ? { update: () => updateChain } : { insert: (value: unknown) => { audits.push(value); return Promise.resolve({ error: null }); } } } as never;
    const job = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed" as const, attemptCount: 1, nextAttemptAt: "2026-08-01T00:00:00.000Z", claimedAt: "2026-08-01T00:00:00.000Z", claimExpiresAt: "2026-08-01T00:05:00.000Z", claimedBy: "worker-original", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };

    await expect(createDocumentScanJobStore(supabase).fail(job, { outcome: "permanent_failure", provider: "fake", safeFailureCategory: "provider_rejected" })).resolves.toBe(false);

    expect(filters).toContainEqual(["claimed_by", "worker-original"]);
    expect(audits).toEqual([]);
  });

  it("prevents worker A from mutating a retry job reclaimed by worker B after its lease expires", async () => {
    const filters: Array<[string, unknown]> = [];
    const audits: unknown[] = [];
    let leaseExpired = false;
    const row = (claimedBy: string, attemptCount: number) => ({ id: "job-1", organization_id: "org-1", appointment_request_id: "appointment-1", document_id: "document-1", status: "claimed", attempt_count: attemptCount, next_attempt_at: "2026-08-01T00:00:00.000Z", claimed_at: "2026-08-01T00:00:00.000Z", claim_expires_at: "2026-08-01T00:05:00.000Z", claimed_by: claimedBy, last_failure_category: "provider_unavailable", provider: "fake", provider_request_id: null, scan_duration_ms: null, completed_at: null });
    const updateChain = { eq: (field: string, value: unknown) => { filters.push([field, value]); return updateChain; }, select: () => updateChain, maybeSingle: async () => ({ data: null, error: null }) };
    const supabase = {
      rpc: async (name: string, args: { p_claimed_by: string }) => {
        expect(name).toBe("claim_document_scan_jobs");
        if (args.p_claimed_by === "worker-a") return { data: [row("worker-a", 2)], error: null };
        expect(leaseExpired).toBe(true);
        expect(args.p_claimed_by).toBe("worker-b");
        return { data: [row("worker-b", 3)], error: null };
      },
      from: (table: string) => table === "document_scan_jobs" ? { update: () => updateChain } : { insert: (value: unknown) => { audits.push(value); return Promise.resolve({ error: null }); } }
    } as never;
    const store = createDocumentScanJobStore(supabase);
    const [workerAJob] = await store.claim({ claimedBy: "worker-a" });
    leaseExpired = true;
    const [workerBJob] = await store.claim({ claimedBy: "worker-b" });

    expect(workerAJob).toMatchObject({ status: "claimed", claimedBy: "worker-a", attemptCount: 2 });
    expect(workerBJob).toMatchObject({ status: "claimed", claimedBy: "worker-b", attemptCount: 3 });
    await expect(store.scheduleRetry(workerAJob, { outcome: "retryable_failure", provider: "fake", safeFailureCategory: "provider_unavailable" }, new Date("2026-08-01T00:00:00.000Z"))).resolves.toBe(false);
    await expect(store.complete(workerAJob, { outcome: "clean", provider: "fake" })).resolves.toBeNull();
    await expect(store.block(workerAJob, { outcome: "infected", provider: "fake" })).resolves.toBe(false);
    await expect(store.fail(workerAJob, { outcome: "permanent_failure", provider: "fake", safeFailureCategory: "provider_rejected" })).resolves.toBe(false);
    await expect(store.cancel(workerAJob)).resolves.toBe(false);

    expect(filters.filter(([field, value]) => field === "claimed_by" && value === "worker-a")).toHaveLength(5);
    expect(audits).toEqual([]);
    expect(workerBJob).toMatchObject({ status: "claimed", claimedBy: "worker-b", attemptCount: 3 });
  });
});
