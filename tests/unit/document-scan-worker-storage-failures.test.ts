import { describe, expect, it, vi } from "vitest";
import { appointmentDocumentStorage } from "@/lib/server/document-storage";
import { createDocumentScanWorker, documentScanMaximumAttempts, type DocumentScanJob } from "@/lib/server/document-security/scan-jobs";
import type { DocumentScanResult } from "@/lib/server/document-security/scanner";
import type { createAppointmentDocumentRepository } from "@/lib/server/document-repository";

type ValidatedDocument = NonNullable<Awaited<ReturnType<ReturnType<typeof createAppointmentDocumentRepository>["validateDocumentOwnership"]>>>;
type StageContext = { stage: string; attemptCount: number; outcome?: string };

const unsafeHookKeys = ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"];
const now = new Date("2026-01-01T00:00:00.000Z");

function claimedJob(attemptCount = 1): DocumentScanJob {
  return { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount, nextAttemptAt: now.toISOString(), claimedAt: now.toISOString(), claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
}

function pendingDocument(): ValidatedDocument {
  return { id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", originalFilename: "document.pdf", storageKey: "private-quarantine-key", contentType: "application/pdf", sizeBytes: 5, status: "uploaded", reviewedBy: null, reviewerName: null, reviewedAt: null, reviewNotes: null, uploadedByType: "customer", uploadedAt: now.toISOString(), deletedAt: null, metadata: {}, scanStatus: "pending", storageStatus: "quarantined", scanProvider: null, scanRequestedAt: now.toISOString(), scannedAt: null, scanFailureCategory: null, scanAttemptCount: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() };
}

function auditSupabase(audits: unknown[]) {
  return { from: () => ({ insert: async (value: unknown) => { audits.push(value); return { error: null }; } }) } as never;
}

function assertSafeHookContexts(stages: StageContext[]) {
  for (const context of stages) {
    expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]);
    for (const unsafeKey of unsafeHookKeys) expect(context).not.toHaveProperty(unsafeKey);
  }
}

const storageFailures: Array<{ name: string; download: () => Promise<ArrayBuffer> }> = [
  { name: "transient private-storage exception", download: async () => { throw new Error("private object timed out"); } },
  { name: "missing object", download: async () => null as never },
  { name: "empty object", download: async () => new ArrayBuffer(0) },
  { name: "oversized object", download: async () => new ArrayBuffer(appointmentDocumentStorage.maximumSizeBytes + 1) },
  { name: "content-type mismatch", download: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer },
  { name: "corrupt bytes", download: async () => new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]).buffer },
  { name: "unexpected adapter error", download: async () => { throw { code: "adapter_failure" }; } }
];

describe("document scan worker storage failures", () => {
  it.each(storageFailures)("fails closed and schedules one safe retry for $name", async ({ download }) => {
    const calls = { claim: 0, storage: 0, scanner: 0, clean: 0, blocked: 0, activate: 0, failed: 0, retry: 0, complete: 0, block: 0, fail: 0, cancel: 0 };
    const stages: StageContext[] = [];
    const audits: unknown[] = [];
    const retries: DocumentScanResult[] = [];
    const document = pendingDocument();
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => { calls.claim++; return calls.claim === 1 ? [claimedJob()] : []; },
        complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, fail: async () => { calls.fail++; return false; }, cancel: async () => { calls.cancel++; return false; },
        scheduleRetry: async (_job, result) => { calls.retry++; retries.push(result); return true; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => document,
        markDocumentScanClean: async () => { calls.clean++; return document; }, markDocumentScanBlocked: async () => { calls.blocked++; return document; }, activateCleanDocument: async () => { calls.activate++; return document; },
        markDocumentScanFailed: async () => { calls.failed++; return document; }
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return download(); } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } },
      now: () => now, random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    const result = await worker.process(auditSupabase(audits));

    expect(result).toEqual({ claimed: 1, completed: 0, blocked: 0, retryScheduled: 1, failed: 0, cancelled: 0 });
    expect(calls).toEqual({ claim: 1, storage: 1, scanner: 0, clean: 0, blocked: 0, activate: 0, failed: 0, retry: 1, complete: 0, block: 0, fail: 0, cancel: 0 });
    expect(document).toMatchObject({ scanStatus: "pending", storageStatus: "quarantined" });
    expect(retries).toEqual([{ outcome: "retryable_failure", provider: "document-security", safeFailureCategory: "provider_unavailable" }]);
    expect(JSON.stringify(result)).not.toMatch(/private-quarantine-key|timed out|adapter_failure|document-1|job-1/i);
    expect(JSON.stringify(audits)).not.toMatch(/private-quarantine-key|timed out|adapter_failure/i);
    assertSafeHookContexts(stages);
  });

  it("fails an exhausted storage retry once and leaves the object quarantined", async () => {
    const calls = { claim: 0, storage: 0, scanner: 0, clean: 0, blocked: 0, activate: 0, failed: 0, retry: 0, complete: 0, block: 0, fail: 0, cancel: 0 };
    const stages: StageContext[] = [];
    const audits: unknown[] = [];
    let document = pendingDocument();
    let terminal = false;
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => { calls.claim++; return terminal ? [] : [claimedJob(documentScanMaximumAttempts)]; },
        complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, cancel: async () => { calls.cancel++; return false; }, scheduleRetry: async () => { calls.retry++; return false; },
        fail: async (_job, result) => { calls.fail++; expect(result).toEqual({ outcome: "retryable_failure", provider: "document-security", safeFailureCategory: "provider_unavailable" }); terminal = true; return true; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => document,
        markDocumentScanClean: async () => { calls.clean++; return document; }, markDocumentScanBlocked: async () => { calls.blocked++; return document; }, activateCleanDocument: async () => { calls.activate++; return document; },
        markDocumentScanFailed: async (input) => { calls.failed++; expect(input.category).toBe("provider_unavailable"); document = { ...document, scanStatus: "failed", storageStatus: "quarantined", scanFailureCategory: input.category }; return document; }
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; throw new Error("private object unavailable"); } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } },
      now: () => now, random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    await expect(worker.process(auditSupabase(audits))).resolves.toEqual({ claimed: 1, completed: 0, blocked: 0, retryScheduled: 0, failed: 1, cancelled: 0 });
    await expect(worker.process(auditSupabase(audits))).resolves.toEqual({ claimed: 0, completed: 0, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 });

    expect(calls).toEqual({ claim: 2, storage: 1, scanner: 0, clean: 0, blocked: 0, activate: 0, failed: 1, retry: 0, complete: 0, block: 0, fail: 1, cancel: 0 });
    expect(document).toMatchObject({ scanStatus: "failed", storageStatus: "quarantined", scanFailureCategory: "provider_unavailable" });
    expect(stages.map((stage) => stage.stage)).toEqual(["after_claim", "after_state_revalidation", "after_scan_result", "after_scan_failed_transition", "after_job_failed"]);
    expect(JSON.stringify(audits)).not.toContain("private object unavailable");
    assertSafeHookContexts(stages);
  });
});
