import { describe, expect, it, vi } from "vitest";
import { createDocumentScanWorker, documentScanMaximumAttempts, documentScanRetryAt, type DocumentScanJob } from "@/lib/server/document-security/scan-jobs";
import type { createAppointmentDocumentRepository } from "@/lib/server/document-repository";

type ValidatedDocument = NonNullable<Awaited<ReturnType<ReturnType<typeof createAppointmentDocumentRepository>["validateDocumentOwnership"]>>>;
type FailedDocumentInput = Parameters<ReturnType<typeof createAppointmentDocumentRepository>["markDocumentScanFailed"]>[0];

const claimedJob: DocumentScanJob = {
  id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount: 1,
  nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1",
  lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null
};

const cleanDocumentFixture: ValidatedDocument = {
  id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", originalFilename: "document.pdf", storageKey: "private-key",
  contentType: "application/pdf", sizeBytes: 4, status: "uploaded", reviewedBy: null, reviewerName: null, reviewedAt: null, reviewNotes: null,
  uploadedByType: "customer", uploadedAt: "2026-01-01T00:00:00.000Z", deletedAt: null, metadata: {}, scanStatus: "clean", storageStatus: "quarantined",
  scanProvider: "fake", scanRequestedAt: "2026-01-01T00:00:00.000Z", scannedAt: "2026-01-01T00:00:01.000Z", scanFailureCategory: null, scanAttemptCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:01.000Z"
};

const unsafeHookKeys = ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"];

function auditSupabase() {
  return { from: () => ({ insert: async () => ({ error: null }) }) } as never;
}

function auditSupabaseWith(audits: Array<{ action: string }>) {
  return { from: () => ({ insert: async (value: { action: string }) => { audits.push({ action: value.action }); return { error: null }; } }) } as never;
}

function assertSafeReplayStages(stages: Array<{ stage: string; attemptCount: number; outcome?: string }>) {
  expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation"]);
  for (const context of stages) {
    expect(Object.keys(context).sort()).toEqual(["attemptCount", "stage"]);
    expect(context.attemptCount).toBe(1);
    for (const unsafe of unsafeHookKeys) expect(context).not.toHaveProperty(unsafe);
  }
}

function assertSafeTerminalReplayStages(stages: Array<{ stage: string; attemptCount: number; outcome?: string }>, terminalStage: "after_job_blocked" | "after_job_failed", outcome: "infected" | "suspicious" | "permanent_failure") {
  expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation", terminalStage]);
  for (const context of stages) {
    expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]);
    expect(context.attemptCount).toBe(1);
    if (context.outcome !== undefined) expect(context.outcome).toBe(outcome);
    for (const unsafe of unsafeHookKeys) expect(context).not.toHaveProperty(unsafe);
  }
}

describe("document scan worker clean durable-state replay", () => {
  it("activates a clean quarantined document once, then finalizes its claimed job once", async () => {
    const calls = { claim: 0, storage: 0, scanner: 0, clean: 0, activate: 0, complete: 0, block: 0, fail: 0, retry: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    let durableDocument: ValidatedDocument = cleanDocumentFixture;
    let completed = false;
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => { calls.claim++; return completed ? [] : [claimedJob]; },
        complete: async (job) => { calls.complete++; expect(job).toBe(claimedJob); expect(job.claimedBy).toBe("worker-1"); completed = true; return { ...job, status: "completed", claimedAt: null, claimExpiresAt: null, claimedBy: null, completedAt: "2026-01-01T00:00:02.000Z" }; },
        block: async () => { calls.block++; return false; }, fail: async () => { calls.fail++; return false; }, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => durableDocument,
        markDocumentScanClean: async () => { calls.clean++; return durableDocument; },
        activateCleanDocument: async () => { calls.activate++; durableDocument = { ...durableDocument, storageStatus: "active" }; return durableDocument; },
        markDocumentScanBlocked: async () => durableDocument,
        markDocumentScanFailed: async () => durableDocument
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer; } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } },
      now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 1, completed: 1 });
    await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 0, completed: 0 });

    expect(calls).toEqual({ claim: 2, storage: 0, scanner: 0, clean: 0, activate: 1, complete: 1, block: 0, fail: 0, retry: 0, cancel: 0 });
    expect(durableDocument).toMatchObject({ scanStatus: "clean", storageStatus: "active" });
    assertSafeReplayStages(stages);
  });

  it("finalizes a clean active document's claimed job without repeating any document lifecycle work", async () => {
    const calls = { claim: 0, storage: 0, scanner: 0, clean: 0, activate: 0, complete: 0, block: 0, fail: 0, retry: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const durableDocument: ValidatedDocument = { ...cleanDocumentFixture, storageStatus: "active" };
    let completed = false;
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => { calls.claim++; return completed ? [] : [claimedJob]; },
        complete: async (job) => { calls.complete++; expect(job).toBe(claimedJob); expect(job.claimedBy).toBe("worker-1"); completed = true; return { ...job, status: "completed", claimedAt: null, claimExpiresAt: null, claimedBy: null, completedAt: "2026-01-01T00:00:02.000Z" }; },
        block: async () => { calls.block++; return false; }, fail: async () => { calls.fail++; return false; }, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => durableDocument,
        markDocumentScanClean: async () => { calls.clean++; return durableDocument; },
        activateCleanDocument: async () => { calls.activate++; return durableDocument; },
        markDocumentScanBlocked: async () => durableDocument,
        markDocumentScanFailed: async () => durableDocument
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new ArrayBuffer(4); } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } },
      now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 1, completed: 1 });
    await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 0, completed: 0 });

    expect(calls).toEqual({ claim: 2, storage: 0, scanner: 0, clean: 0, activate: 0, complete: 1, block: 0, fail: 0, retry: 0, cancel: 0 });
    expect(durableDocument).toMatchObject({ scanStatus: "clean", storageStatus: "active" });
    assertSafeReplayStages(stages);
  });

  for (const scanStatus of ["infected", "suspicious"] as const) {
    it(`finalizes a ${scanStatus} quarantined document as blocked without repeating document work`, async () => {
      const calls = { claim: 0, storage: 0, scanner: 0, clean: 0, activate: 0, blocked: 0, failed: 0, complete: 0, block: 0, fail: 0, retry: 0, cancel: 0 };
      const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
      const durableDocument: ValidatedDocument = { ...cleanDocumentFixture, scanStatus, storageStatus: "quarantined" };
      let finalized = false;
      let blockedOutcome: string | undefined;
      const worker = createDocumentScanWorker({
        createJobStore: () => ({
          claim: async () => { calls.claim++; return finalized ? [] : [claimedJob]; },
          complete: async () => { calls.complete++; return null; },
          block: async (job, result) => { calls.block++; expect(job).toBe(claimedJob); expect(job.claimedBy).toBe("worker-1"); blockedOutcome = result.outcome; finalized = true; return true; },
          fail: async () => { calls.fail++; return false; }, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; }
        }),
        createDocumentRepository: () => ({
          validateDocumentOwnership: async () => durableDocument,
          markDocumentScanClean: async () => { calls.clean++; return durableDocument; }, activateCleanDocument: async () => { calls.activate++; return durableDocument; },
          markDocumentScanBlocked: async () => { calls.blocked++; return durableDocument; }, markDocumentScanFailed: async () => { calls.failed++; return durableDocument; }
        }),
        storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new ArrayBuffer(4); } },
        scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } },
        now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
      });

      await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 1, blocked: 1 });
      await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 0, blocked: 0 });

      expect(calls).toEqual({ claim: 2, storage: 0, scanner: 0, clean: 0, activate: 0, blocked: 0, failed: 0, complete: 0, block: 1, fail: 0, retry: 0, cancel: 0 });
      expect(blockedOutcome).toBe(scanStatus);
      expect(durableDocument).toMatchObject({ scanStatus, storageStatus: "quarantined" });
      assertSafeTerminalReplayStages(stages, "after_job_blocked", scanStatus);
    });
  }

  it("finalizes a failed quarantined document without repeating document work", async () => {
    const calls = { claim: 0, storage: 0, scanner: 0, clean: 0, activate: 0, blocked: 0, failed: 0, complete: 0, block: 0, fail: 0, retry: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const durableDocument: ValidatedDocument = { ...cleanDocumentFixture, scanStatus: "failed", storageStatus: "quarantined", scanFailureCategory: "provider_rejected" };
    let finalized = false;
    let failureCategory: string | undefined;
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => { calls.claim++; return finalized ? [] : [claimedJob]; },
        complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; },
        fail: async (job, result) => { calls.fail++; expect(job).toBe(claimedJob); expect(job.claimedBy).toBe("worker-1"); failureCategory = result.safeFailureCategory; finalized = true; return true; },
        scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => durableDocument,
        markDocumentScanClean: async () => { calls.clean++; return durableDocument; }, activateCleanDocument: async () => { calls.activate++; return durableDocument; },
        markDocumentScanBlocked: async () => { calls.blocked++; return durableDocument; }, markDocumentScanFailed: async (_input: FailedDocumentInput) => { void _input; calls.failed++; return durableDocument; }
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new ArrayBuffer(4); } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } },
      now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 1, failed: 1 });
    await expect(worker.process(auditSupabase())).resolves.toMatchObject({ claimed: 0, failed: 0 });

    expect(calls).toEqual({ claim: 2, storage: 0, scanner: 0, clean: 0, activate: 0, blocked: 0, failed: 0, complete: 0, block: 0, fail: 1, retry: 0, cancel: 0 });
    expect(failureCategory).toBe("provider_rejected");
    expect(durableDocument).toMatchObject({ scanStatus: "failed", storageStatus: "quarantined", scanFailureCategory: "provider_rejected" });
    assertSafeTerminalReplayStages(stages, "after_job_failed", "permanent_failure");
  });
});

describe("document scan worker retry-scheduled replay", () => {
  it("does not claim a retry-scheduled job before its next attempt time", async () => {
    const calls = { claim: 0, document: 0, storage: 0, scanner: 0, retry: 0, complete: 0, block: 0, fail: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const audits: Array<{ action: string }> = [];
    const beforeDue = new Date("2026-01-01T00:00:00.000Z");
    const retryJob: DocumentScanJob = { ...claimedJob, status: "retry_scheduled", attemptCount: 1, nextAttemptAt: "2026-01-01T00:01:00.000Z", claimedAt: null, claimExpiresAt: null, claimedBy: null, lastFailureCategory: "provider_unavailable" };
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => { calls.claim++; return beforeDue >= new Date(retryJob.nextAttemptAt) ? [{ ...retryJob, status: "claimed", attemptCount: retryJob.attemptCount + 1, claimedAt: beforeDue.toISOString(), claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1" }] : []; },
        complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, fail: async () => { calls.fail++; return false; }, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => { calls.document++; return { ...cleanDocumentFixture, scanStatus: "pending", storageStatus: "quarantined" }; },
        markDocumentScanClean: async () => cleanDocumentFixture, activateCleanDocument: async () => cleanDocumentFixture, markDocumentScanBlocked: async () => cleanDocumentFixture, markDocumentScanFailed: async (_input: FailedDocumentInput) => { void _input; return cleanDocumentFixture; }
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new ArrayBuffer(4); } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } },
      now: () => beforeDue, random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    await expect(worker.process(auditSupabaseWith(audits))).resolves.toEqual({ claimed: 0, completed: 0, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 });

    expect(calls).toEqual({ claim: 1, document: 0, storage: 0, scanner: 0, retry: 0, complete: 0, block: 0, fail: 0, cancel: 0 });
    expect(stages).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("claims a due retry once, advances its schedule deterministically, and remains idle before the new due time", async () => {
    const calls = { claim: 0, document: 0, storage: 0, scanner: 0, clean: 0, activate: 0, blocked: 0, failed: 0, retry: 0, complete: 0, block: 0, fail: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const audits: Array<{ action: string }> = [];
    const now = new Date("2026-01-01T00:01:00.000Z");
    const expectedNextAttemptAt = documentScanRetryAt(2, now, () => 0);
    let durableJob: DocumentScanJob = { ...claimedJob, status: "retry_scheduled", attemptCount: 1, nextAttemptAt: now.toISOString(), claimedAt: null, claimExpiresAt: null, claimedBy: null, lastFailureCategory: "provider_unavailable" };
    const durableDocument: ValidatedDocument = { ...cleanDocumentFixture, scanStatus: "pending", storageStatus: "quarantined", scanFailureCategory: "provider_unavailable" };
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => {
          calls.claim++;
          if (durableJob.status !== "retry_scheduled" || new Date(durableJob.nextAttemptAt) > now) return [];
          durableJob = { ...durableJob, status: "claimed", attemptCount: durableJob.attemptCount + 1, claimedAt: now.toISOString(), claimExpiresAt: "2026-01-01T00:06:00.000Z", claimedBy: "worker-1" };
          return [durableJob];
        },
        complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, fail: async () => { calls.fail++; return false; }, cancel: async () => { calls.cancel++; return false; },
        scheduleRetry: async (job, result, retryNow, random) => {
          calls.retry++;
          expect(job).toMatchObject({ id: claimedJob.id, status: "claimed", attemptCount: 2, claimedBy: "worker-1" });
          expect(result).toMatchObject({ outcome: "retryable_failure", safeFailureCategory: "provider_unavailable" });
          durableJob = { ...durableJob, status: "retry_scheduled", nextAttemptAt: documentScanRetryAt(job.attemptCount, retryNow, random), claimedAt: null, claimExpiresAt: null, claimedBy: null, lastFailureCategory: result.safeFailureCategory ?? null };
          audits.push({ action: "document.scan_retry_scheduled" });
          return true;
        }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => { calls.document++; return durableDocument; },
        markDocumentScanClean: async () => { calls.clean++; return durableDocument; }, activateCleanDocument: async () => { calls.activate++; return durableDocument; }, markDocumentScanBlocked: async () => { calls.blocked++; return durableDocument; }, markDocumentScanFailed: async (_input: FailedDocumentInput) => { void _input; calls.failed++; return durableDocument; }
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer; } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "retryable_failure", provider: "fake", safeFailureCategory: "provider_unavailable" }; } },
      now: () => now, random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    await expect(worker.process(auditSupabaseWith(audits))).resolves.toMatchObject({ claimed: 1, retryScheduled: 1 });
    await expect(worker.process(auditSupabaseWith(audits))).resolves.toMatchObject({ claimed: 0, retryScheduled: 0 });

    expect(calls).toEqual({ claim: 2, document: 1, storage: 1, scanner: 1, clean: 0, activate: 0, blocked: 0, failed: 0, retry: 1, complete: 0, block: 0, fail: 0, cancel: 0 });
    expect(durableJob).toMatchObject({ status: "retry_scheduled", attemptCount: 2, nextAttemptAt: expectedNextAttemptAt, claimedAt: null, claimExpiresAt: null, claimedBy: null, lastFailureCategory: "provider_unavailable" });
    expect(durableJob.nextAttemptAt).not.toBe(now.toISOString());
    expect(audits.map((audit) => audit.action)).toEqual(["document.scan_started", "document.scan_retry_scheduled"]);
    expect(stages.map((stage) => stage.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_retry_scheduled"]);
    for (const context of stages) {
      expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]);
      expect(context.attemptCount).toBe(2);
      for (const unsafe of unsafeHookKeys) expect(context).not.toHaveProperty(unsafe);
    }
  });

  it("turns a due final-attempt retry into one terminal failed job without another retry", async () => {
    const calls = { claim: 0, document: 0, storage: 0, scanner: 0, clean: 0, activate: 0, blocked: 0, failed: 0, retry: 0, complete: 0, block: 0, fail: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const audits: Array<{ action: string }> = [];
    const now = new Date("2026-01-01T00:01:00.000Z");
    let durableJob: DocumentScanJob = { ...claimedJob, status: "retry_scheduled", attemptCount: documentScanMaximumAttempts - 1, nextAttemptAt: now.toISOString(), claimedAt: null, claimExpiresAt: null, claimedBy: null, lastFailureCategory: "provider_unavailable" };
    let durableDocument: ValidatedDocument = { ...cleanDocumentFixture, scanStatus: "pending", storageStatus: "quarantined", scanFailureCategory: "provider_unavailable" };
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => {
          calls.claim++;
          if (durableJob.status !== "retry_scheduled" || new Date(durableJob.nextAttemptAt) > now) return [];
          durableJob = { ...durableJob, status: "claimed", attemptCount: durableJob.attemptCount + 1, claimedAt: now.toISOString(), claimExpiresAt: "2026-01-01T00:06:00.000Z", claimedBy: "worker-1" };
          return [durableJob];
        },
        complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; },
        fail: async (job, result) => { calls.fail++; expect(job).toMatchObject({ status: "claimed", attemptCount: documentScanMaximumAttempts, claimedBy: "worker-1" }); expect(result).toMatchObject({ outcome: "retryable_failure", safeFailureCategory: "provider_unavailable" }); durableJob = { ...durableJob, status: "failed", claimedAt: null, claimExpiresAt: null, claimedBy: null, lastFailureCategory: result.safeFailureCategory ?? null, completedAt: now.toISOString() }; return true; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async () => { calls.document++; return durableDocument; },
        markDocumentScanClean: async () => { calls.clean++; return durableDocument; }, activateCleanDocument: async () => { calls.activate++; return durableDocument; }, markDocumentScanBlocked: async () => { calls.blocked++; return durableDocument; },
        markDocumentScanFailed: async (input: FailedDocumentInput) => { calls.failed++; expect(input.category).toBe("provider_unavailable"); durableDocument = { ...durableDocument, scanStatus: "failed", storageStatus: "quarantined", scanFailureCategory: input.category }; return durableDocument; }
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer; } },
      scanner: { scan: async () => { calls.scanner++; return { outcome: "retryable_failure", provider: "fake", safeFailureCategory: "provider_unavailable" }; } },
      now: () => now, random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    await expect(worker.process(auditSupabaseWith(audits))).resolves.toMatchObject({ claimed: 1, failed: 1, retryScheduled: 0 });
    await expect(worker.process(auditSupabaseWith(audits))).resolves.toMatchObject({ claimed: 0, failed: 0, retryScheduled: 0 });

    expect(calls).toEqual({ claim: 2, document: 1, storage: 1, scanner: 1, clean: 0, activate: 0, blocked: 0, failed: 1, retry: 0, complete: 0, block: 0, fail: 1, cancel: 0 });
    expect(durableDocument).toMatchObject({ scanStatus: "failed", storageStatus: "quarantined", scanFailureCategory: "provider_unavailable" });
    expect(durableJob).toMatchObject({ status: "failed", attemptCount: documentScanMaximumAttempts, claimedAt: null, claimExpiresAt: null, claimedBy: null, lastFailureCategory: "provider_unavailable" });
    expect(audits.map((audit) => audit.action)).toEqual(["document.scan_started"]);
    expect(stages.map((stage) => stage.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_scan_failed_transition", "after_job_failed"]);
    for (const context of stages) {
      expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]);
      expect(context.attemptCount).toBe(documentScanMaximumAttempts);
      for (const unsafe of unsafeHookKeys) expect(context).not.toHaveProperty(unsafe);
    }
  });
});
