import { describe, expect, it, vi } from "vitest";
import { createDocumentScanWorker, documentScanRetryAt, type DocumentScanJob } from "@/lib/server/document-security/scan-jobs";
import type { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import type { DocumentScanResult } from "@/lib/server/document-security/scanner";

type ValidatedDocument = NonNullable<Awaited<ReturnType<ReturnType<typeof createAppointmentDocumentRepository>["validateDocumentOwnership"]>>>;
type DocumentScanDocumentRepository = Pick<ReturnType<typeof createAppointmentDocumentRepository>, "markDocumentScanFailed">;

const validDocumentFixture: ValidatedDocument = {
  id: "document-1",
  organizationId: "org-1",
  appointmentId: "appointment-1",
  originalFilename: "document.pdf",
  storageKey: "private-key",
  contentType: "application/pdf",
  sizeBytes: 4,
  status: "uploaded",
  reviewedBy: null,
  reviewerName: null,
  reviewedAt: null,
  reviewNotes: null,
  uploadedByType: "customer",
  uploadedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  metadata: {},
  scanStatus: "pending",
  storageStatus: "quarantined",
  scanProvider: null,
  scanRequestedAt: null,
  scannedAt: null,
  scanFailureCategory: null,
  scanAttemptCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("document scan worker dependency boundaries", () => {
  it("uses injected job-store and document-repository factories for a clean job", async () => {
    const job: DocumentScanJob = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount: 1, nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    const calls = { storeFactory: 0, repositoryFactory: 0, validate: 0, storage: 0, scanner: 0, clean: 0, activate: 0, complete: 0, block: 0, fail: 0, retry: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const createJobStore = vi.fn(() => ({ claim: vi.fn().mockResolvedValue([job]), complete: vi.fn().mockImplementation(async () => { calls.complete++; return job; }), block: vi.fn().mockImplementation(async () => { calls.block++; return true; }), fail: vi.fn().mockImplementation(async () => { calls.fail++; return true; }), scheduleRetry: vi.fn().mockImplementation(async () => { calls.retry++; return true; }), cancel: vi.fn().mockImplementation(async () => { calls.cancel++; return true; }) }));
    const createDocumentRepository = vi.fn(() => ({ validateDocumentOwnership: vi.fn().mockImplementation(async () => { calls.validate++; return validDocumentFixture; }), markDocumentScanClean: vi.fn().mockImplementation(async () => { calls.clean++; return validDocumentFixture; }), activateCleanDocument: vi.fn().mockImplementation(async () => { calls.activate++; return validDocumentFixture; }), markDocumentScanBlocked: vi.fn().mockResolvedValue(validDocumentFixture), markDocumentScanFailed: vi.fn().mockResolvedValue(validDocumentFixture) }));
    const worker = createDocumentScanWorker({ createJobStore: () => { calls.storeFactory++; return createJobStore(); }, createDocumentRepository: () => { calls.repositoryFactory++; return createDocumentRepository(); }, storage: { upload: vi.fn(), remove: vi.fn(), download: vi.fn().mockImplementation(async () => { calls.storage++; return new Uint8Array([1, 2, 3, 4]).buffer; }) }, scanner: { scan: vi.fn().mockImplementation(async () => { calls.scanner++; return { outcome: "clean", provider: "fake" as const }; }) }, now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); } });
    const auditChain = { insert: vi.fn().mockResolvedValue({ error: null }) };
    await worker.process({ from: () => auditChain } as never);
    expect(calls).toMatchObject({ storeFactory: 1, repositoryFactory: 1, validate: 1, storage: 1, scanner: 1, clean: 1, activate: 1, complete: 1, block: 0, fail: 0, retry: 0, cancel: 0 });
    expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_scan_clean_transition", "after_storage_activation", "after_job_completed"]);
    expect(stages).toHaveLength(7);
    for (const context of stages) {
      expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]);
      expect(context.attemptCount).toBe(1);
      for (const unsafe of ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"]) expect(context).not.toHaveProperty(unsafe);
    }
  });

  it("reports the exact safe stage order for an injected infected scan", async () => {
    const job: DocumentScanJob = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount: 1, nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    const calls = { storage: 0, scanner: 0, blocked: 0, block: 0, clean: 0, activate: 0, failed: 0, retry: 0, complete: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const worker = createDocumentScanWorker({
      createJobStore: () => ({ claim: async () => [job], complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return true; }, fail: async () => false, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; } }),
      createDocumentRepository: () => ({ validateDocumentOwnership: async () => validDocumentFixture, markDocumentScanClean: async () => { calls.clean++; return validDocumentFixture; }, activateCleanDocument: async () => { calls.activate++; return validDocumentFixture; }, markDocumentScanBlocked: async (input: { result: string }) => { calls.blocked++; expect(input.result).toBe("infected"); return validDocumentFixture; }, markDocumentScanFailed: async () => { calls.failed++; return validDocumentFixture; } }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([1, 2, 3, 4]).buffer; } }, scanner: { scan: async () => { calls.scanner++; return { outcome: "infected", provider: "fake" }; } }, now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });
    await worker.process({ from: () => ({ insert: async () => ({ error: null }) }) } as never);
    expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_scan_blocked_transition", "after_job_blocked"]);
    expect(calls).toEqual({ storage: 1, scanner: 1, blocked: 1, block: 1, clean: 0, activate: 0, failed: 0, retry: 0, complete: 0, cancel: 0 });
    for (const context of stages) { expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]); expect(context.attemptCount).toBe(1); for (const unsafe of ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"]) expect(context).not.toHaveProperty(unsafe); }
  });

  it("reports the exact safe stage order for an injected suspicious scan", async () => {
    const job: DocumentScanJob = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount: 1, nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    const calls = { storage: 0, scanner: 0, blocked: 0, block: 0, clean: 0, activate: 0, failed: 0, retry: 0, complete: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const worker = createDocumentScanWorker({
      createJobStore: () => ({ claim: async () => [job], complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return true; }, fail: async () => false, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; } }),
      createDocumentRepository: () => ({ validateDocumentOwnership: async () => validDocumentFixture, markDocumentScanClean: async () => { calls.clean++; return validDocumentFixture; }, activateCleanDocument: async () => { calls.activate++; return validDocumentFixture; }, markDocumentScanBlocked: async (input: { result: string }) => { calls.blocked++; expect(input.result).toBe("suspicious"); return validDocumentFixture; }, markDocumentScanFailed: async () => { calls.failed++; return validDocumentFixture; } }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([1, 2, 3, 4]).buffer; } }, scanner: { scan: async () => { calls.scanner++; return { outcome: "suspicious", provider: "fake" }; } }, now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });
    await worker.process({ from: () => ({ insert: async () => ({ error: null }) }) } as never);
    expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_scan_blocked_transition", "after_job_blocked"]);
    expect(stages).toHaveLength(6);
    expect(stages.flatMap((entry) => entry.outcome === undefined ? [] : [entry.outcome])).toEqual(["suspicious", "suspicious", "suspicious"]);
    expect(calls).toEqual({ storage: 1, scanner: 1, blocked: 1, block: 1, clean: 0, activate: 0, failed: 0, retry: 0, complete: 0, cancel: 0 });
    for (const context of stages) { expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]); expect(context.attemptCount).toBe(1); for (const unsafe of ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"]) expect(context).not.toHaveProperty(unsafe); }
  });

  it("reports the exact safe stage order for an injected retryable failure", async () => {
    const job: DocumentScanJob = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount: 2, nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const fixedRandom = vi.fn(() => 0.5);
    const calls = { storage: 0, scanner: 0, retry: 0, clean: 0, blocked: 0, failed: 0, activate: 0, complete: 0, block: 0, fail: 0, cancel: 0 };
    const retryBoundary: Array<{ outcome: string; category: string | undefined; nextAttemptAt: string }> = [];
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const worker = createDocumentScanWorker({
      createJobStore: () => ({ claim: async () => [job], complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, fail: async () => { calls.fail++; return false; }, scheduleRetry: async (receivedJob: DocumentScanJob, result: DocumentScanResult, now: Date, random: () => number) => { calls.retry++; expect(now).toBe(fixedNow); expect(random).toBe(fixedRandom); retryBoundary.push({ outcome: result.outcome, category: result.safeFailureCategory, nextAttemptAt: documentScanRetryAt(receivedJob.attemptCount, now, random) }); return true; }, cancel: async () => { calls.cancel++; return false; } }),
      createDocumentRepository: () => ({ validateDocumentOwnership: async () => validDocumentFixture, markDocumentScanClean: async () => { calls.clean++; return validDocumentFixture; }, activateCleanDocument: async () => { calls.activate++; return validDocumentFixture; }, markDocumentScanBlocked: async () => { calls.blocked++; return validDocumentFixture; }, markDocumentScanFailed: async () => { calls.failed++; return validDocumentFixture; } }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([1, 2, 3, 4]).buffer; } }, scanner: { scan: async () => { calls.scanner++; return { outcome: "retryable_failure", provider: "fake", safeFailureCategory: "provider_unavailable" }; } }, now: () => fixedNow, random: fixedRandom, onStage: (context) => { stages.push({ ...context }); }
    });
    await worker.process({ from: () => ({ insert: async () => ({ error: null }) }) } as never);
    expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_retry_scheduled"]);
    expect(stages).toHaveLength(5);
    expect(stages.flatMap((entry) => entry.outcome === undefined ? [] : [entry.outcome])).toEqual(["retryable_failure", "retryable_failure"]);
    expect(retryBoundary).toEqual([{ outcome: "retryable_failure", category: "provider_unavailable", nextAttemptAt: "2026-01-01T00:05:15.000Z" }]);
    expect(fixedRandom).toHaveBeenCalledOnce();
    expect(calls).toEqual({ storage: 1, scanner: 1, retry: 1, clean: 0, blocked: 0, failed: 0, activate: 0, complete: 0, block: 0, fail: 0, cancel: 0 });
    for (const context of stages) { expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]); expect(context.attemptCount).toBe(2); for (const unsafe of ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"]) expect(context).not.toHaveProperty(unsafe); }
  });

  it("reports the exact safe stage order for an injected permanent failure", async () => {
    const job: DocumentScanJob = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount: 1, nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    const calls = { storage: 0, scanner: 0, failed: 0, fail: 0, retry: 0, clean: 0, blocked: 0, activate: 0, complete: 0, block: 0, cancel: 0 };
    const failureBoundary: Array<{ outcome: string; category: string | undefined }> = [];
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const worker = createDocumentScanWorker({
      createJobStore: () => ({ claim: async () => [job], complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, fail: async (_job, result) => { calls.fail++; failureBoundary.push({ outcome: result.outcome, category: result.safeFailureCategory }); return true; }, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; } }),
      createDocumentRepository: () => ({ validateDocumentOwnership: async () => validDocumentFixture, markDocumentScanClean: async () => { calls.clean++; return validDocumentFixture; }, activateCleanDocument: async () => { calls.activate++; return validDocumentFixture; }, markDocumentScanBlocked: async () => { calls.blocked++; return validDocumentFixture; }, markDocumentScanFailed: async (input: Parameters<DocumentScanDocumentRepository["markDocumentScanFailed"]>[0]) => { calls.failed++; failureBoundary.push({ outcome: "permanent_failure", category: input.category }); expect(input.provider).toBe("fake"); return validDocumentFixture; } }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([1, 2, 3, 4]).buffer; } }, scanner: { scan: async () => { calls.scanner++; return { outcome: "permanent_failure", provider: "fake", safeFailureCategory: "provider_rejected" }; } }, now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });
    await worker.process({ from: () => ({ insert: async () => ({ error: null }) }) } as never);
    expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_scan_failed_transition", "after_job_failed"]);
    expect(stages).toHaveLength(6);
    expect(stages.flatMap((entry) => entry.outcome === undefined ? [] : [entry.outcome])).toEqual(["permanent_failure", "permanent_failure", "permanent_failure"]);
    expect(failureBoundary).toEqual([{ outcome: "permanent_failure", category: "provider_rejected" }, { outcome: "permanent_failure", category: "provider_rejected" }]);
    expect(calls).toEqual({ storage: 1, scanner: 1, failed: 1, fail: 1, retry: 0, clean: 0, blocked: 0, activate: 0, complete: 0, block: 0, cancel: 0 });
    for (const context of stages) { expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]); expect(context.attemptCount).toBe(1); for (const unsafe of ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"]) expect(context).not.toHaveProperty(unsafe); }
  });

  it("stops at an injected clean-transition fault without affecting another worker", async () => {
    const job: DocumentScanJob = { id: "job-1", organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", status: "claimed", attemptCount: 1, nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
    const fault = new Error("injected clean-transition fault");
    const calls = { storage: 0, scanner: 0, clean: 0, activate: 0, complete: 0, block: 0, fail: 0, retry: 0, cancel: 0 };
    const stages: Array<{ stage: string; attemptCount: number; outcome?: string }> = [];
    const faultyWorker = createDocumentScanWorker({
      createJobStore: () => ({ claim: async () => [job], complete: async () => { calls.complete++; return null; }, block: async () => { calls.block++; return false; }, fail: async () => { calls.fail++; return false; }, scheduleRetry: async () => { calls.retry++; return false; }, cancel: async () => { calls.cancel++; return false; } }),
      createDocumentRepository: () => ({ validateDocumentOwnership: async () => validDocumentFixture, markDocumentScanClean: async () => { calls.clean++; return validDocumentFixture; }, activateCleanDocument: async () => { calls.activate++; return validDocumentFixture; }, markDocumentScanBlocked: async () => validDocumentFixture, markDocumentScanFailed: async () => validDocumentFixture }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => { calls.storage++; return new Uint8Array([1, 2, 3, 4]).buffer; } }, scanner: { scan: async () => { calls.scanner++; return { outcome: "clean", provider: "fake" }; } }, now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); if (context.stage === "after_scan_clean_transition") throw fault; }
    });
    await expect(faultyWorker.process({ from: () => ({ insert: async () => ({ error: null }) }) } as never)).rejects.toBe(fault);
    expect(stages.map((entry) => entry.stage)).toEqual(["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_scan_clean_transition"]);
    expect(stages).toHaveLength(5);
    expect(calls).toEqual({ storage: 1, scanner: 1, clean: 1, activate: 0, complete: 0, block: 0, fail: 0, retry: 0, cancel: 0 });
    for (const context of stages) { expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]); expect(context.attemptCount).toBe(1); for (const unsafe of ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"]) expect(context).not.toHaveProperty(unsafe); }

    const normalCalls = { clean: 0, activate: 0, complete: 0 };
    const normalWorker = createDocumentScanWorker({
      createJobStore: () => ({ claim: async () => [job], complete: async () => { normalCalls.complete++; return null; }, block: async () => false, fail: async () => false, scheduleRetry: async () => false, cancel: async () => false }),
      createDocumentRepository: () => ({ validateDocumentOwnership: async () => validDocumentFixture, markDocumentScanClean: async () => { normalCalls.clean++; return validDocumentFixture; }, activateCleanDocument: async () => { normalCalls.activate++; return validDocumentFixture; }, markDocumentScanBlocked: async () => validDocumentFixture, markDocumentScanFailed: async () => validDocumentFixture }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async () => new Uint8Array([1, 2, 3, 4]).buffer }, scanner: { scan: async () => ({ outcome: "clean", provider: "fake" }) }, now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: () => undefined
    });
    await expect(normalWorker.process({ from: () => ({ insert: async () => ({ error: null }) }) } as never)).resolves.toMatchObject({ completed: 1 });
    expect(normalCalls).toEqual({ clean: 1, activate: 1, complete: 1 });
  });
});
