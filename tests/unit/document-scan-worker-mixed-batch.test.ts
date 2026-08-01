import { describe, expect, it, vi } from "vitest";
import { createDocumentScanWorker, type DocumentScanJob } from "@/lib/server/document-security/scan-jobs";
import type { DocumentScanResult } from "@/lib/server/document-security/scanner";
import type { createAppointmentDocumentRepository } from "@/lib/server/document-repository";

type ValidatedDocument = NonNullable<Awaited<ReturnType<ReturnType<typeof createAppointmentDocumentRepository>["validateDocumentOwnership"]>>>;
type StageContext = { stage: string; attemptCount: number; outcome?: string };

const unsafeKeys = ["bytes", "storageKey", "filename", "token", "apiKey", "providerRequestId", "providerResponse", "organizationId", "appointmentId", "documentId", "error"];

function job(id: string): DocumentScanJob {
  return { id: `job-${id}`, organizationId: "org-test", appointmentId: `appointment-${id}`, documentId: `document-${id}`, status: "claimed", attemptCount: 1, nextAttemptAt: "2026-01-01T00:00:00.000Z", claimedAt: "2026-01-01T00:00:00.000Z", claimExpiresAt: "2026-01-01T00:05:00.000Z", claimedBy: "worker-1", lastFailureCategory: null, provider: null, providerRequestId: null, scanDurationMs: null, completedAt: null };
}

function documentFor(id: string, overrides: Partial<ValidatedDocument> = {}): ValidatedDocument {
  return { id: `document-${id}`, organizationId: "org-test", appointmentId: `appointment-${id}`, originalFilename: "document.pdf", storageKey: `storage-${id}`, contentType: "application/pdf", sizeBytes: 4, status: "uploaded", reviewedBy: null, reviewerName: null, reviewedAt: null, reviewNotes: null, uploadedByType: "customer", uploadedAt: "2026-01-01T00:00:00.000Z", deletedAt: null, metadata: {}, scanStatus: "pending", storageStatus: "quarantined", scanProvider: null, scanRequestedAt: "2026-01-01T00:00:00.000Z", scannedAt: null, scanFailureCategory: null, scanAttemptCount: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function auditSupabase() {
  return { from: () => ({ insert: async () => ({ error: null }) }) } as never;
}

describe("document scan worker mixed batches", () => {
  it("isolates mixed outcomes and returns aggregate-only counters", async () => {
    const jobs = ["clean", "infected", "suspicious", "retry", "permanent", "replay-quarantined", "replay-active", "failed-replay", "skipped", "stale"].map(job);
    const documents = new Map<string, ValidatedDocument>([
      ["document-clean", documentFor("clean")],
      ["document-infected", documentFor("infected")],
      ["document-suspicious", documentFor("suspicious")],
      ["document-retry", documentFor("retry")],
      ["document-permanent", documentFor("permanent")],
      ["document-replay-quarantined", documentFor("replay-quarantined", { scanStatus: "clean", storageStatus: "quarantined", scanProvider: "replay" })],
      ["document-replay-active", documentFor("replay-active", { scanStatus: "clean", storageStatus: "active", scanProvider: "replay" })],
      ["document-failed-replay", documentFor("failed-replay", { scanStatus: "failed", storageStatus: "quarantined", scanProvider: "replay", scanFailureCategory: "provider_rejected" })],
      ["document-skipped", documentFor("skipped", { deletedAt: "2026-01-01T00:00:01.000Z" })],
      ["document-stale", documentFor("stale", { scanStatus: "clean", storageStatus: "active", scanProvider: "replay" })]
    ]);
    const calls = { claim: 0, storage: 0, scanner: 0, clean: 0, activate: 0, blocked: 0, failed: 0, complete: [] as string[], block: [] as string[], fail: [] as string[], retry: [] as string[], cancel: [] as string[] };
    const stages: StageContext[] = [];
    const scanResults: Record<string, DocumentScanResult> = {
      "document-clean": { outcome: "clean", provider: "fake" },
      "document-infected": { outcome: "infected", provider: "fake" },
      "document-suspicious": { outcome: "suspicious", provider: "fake" },
      "document-permanent": { outcome: "permanent_failure", provider: "fake", safeFailureCategory: "provider_rejected" }
    };
    const worker = createDocumentScanWorker({
      createJobStore: () => ({
        claim: async () => { calls.claim++; return calls.claim === 1 ? jobs : []; },
        complete: async (currentJob) => { if (currentJob.id === "job-stale") return null; calls.complete.push(currentJob.id); return { ...currentJob, status: "completed", claimedAt: null, claimExpiresAt: null, claimedBy: null, completedAt: "2026-01-01T00:00:02.000Z" }; },
        block: async (currentJob) => { calls.block.push(currentJob.id); return true; },
        fail: async (currentJob) => { calls.fail.push(currentJob.id); return true; },
        scheduleRetry: async (currentJob) => { calls.retry.push(currentJob.id); return true; },
        cancel: async (currentJob) => { calls.cancel.push(currentJob.id); return true; }
      }),
      createDocumentRepository: () => ({
        validateDocumentOwnership: async (_organizationId, _appointmentId, documentId) => documents.get(documentId) ?? null,
        markDocumentScanClean: async (input) => { calls.clean++; const current = documents.get(input.documentId)!; const next = { ...current, scanStatus: "clean" as const, scanProvider: input.provider, scanFailureCategory: null }; documents.set(input.documentId, next); return next; },
        activateCleanDocument: async (input) => { calls.activate++; const current = documents.get(input.documentId)!; const next = { ...current, storageStatus: "active" as const }; documents.set(input.documentId, next); return next; },
        markDocumentScanBlocked: async (input) => { calls.blocked++; const current = documents.get(input.documentId)!; const next = { ...current, scanStatus: input.result, storageStatus: "quarantined" as const, scanProvider: input.provider, scanFailureCategory: input.category }; documents.set(input.documentId, next); return next; },
        markDocumentScanFailed: async (input) => { calls.failed++; const current = documents.get(input.documentId)!; const next = { ...current, scanStatus: "failed" as const, storageStatus: "quarantined" as const, scanProvider: input.provider ?? null, scanFailureCategory: input.category }; documents.set(input.documentId, next); return next; }
      }),
      storage: { upload: vi.fn(), remove: vi.fn(), download: async (storageKey) => { calls.storage++; if (storageKey === "storage-retry") throw new Error("scanner provider unavailable"); return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer; } },
      scanner: { scan: async (input) => { calls.scanner++; return scanResults[input.documentId] ?? { outcome: "clean", provider: "fake" }; } },
      now: () => new Date("2026-01-01T00:00:00.000Z"), random: () => 0, onStage: (context) => { stages.push({ ...context }); }
    });

    const result = await worker.process(auditSupabase());

    expect(result).toEqual({ claimed: 10, completed: 3, blocked: 2, retryScheduled: 1, failed: 2, cancelled: 1 });
    expect(Object.keys(result).sort()).toEqual(["blocked", "cancelled", "claimed", "completed", "failed", "retryScheduled"]);
    expect(JSON.stringify(result)).not.toMatch(/job-|document-|appointment-|org-test|storage-|provider_rejected|scanner provider unavailable/i);
    expect(calls).toMatchObject({ claim: 1, storage: 5, scanner: 4, clean: 1, activate: 2, blocked: 2, failed: 1 });
    expect(calls.complete).toEqual(["job-clean", "job-replay-quarantined", "job-replay-active"]);
    expect(calls.block).toEqual(["job-infected", "job-suspicious"]);
    expect(calls.fail).toEqual(["job-permanent", "job-failed-replay"]);
    expect(calls.retry).toEqual(["job-retry"]);
    expect(calls.cancel).toEqual(["job-skipped"]);
    expect(documents.get("document-clean")).toMatchObject({ scanStatus: "clean", storageStatus: "active" });
    expect(documents.get("document-infected")).toMatchObject({ scanStatus: "infected", storageStatus: "quarantined" });
    expect(documents.get("document-suspicious")).toMatchObject({ scanStatus: "suspicious", storageStatus: "quarantined" });
    expect(documents.get("document-permanent")).toMatchObject({ scanStatus: "failed", storageStatus: "quarantined" });
    expect(documents.get("document-replay-quarantined")).toMatchObject({ scanStatus: "clean", storageStatus: "active" });
    expect(documents.get("document-replay-active")).toMatchObject({ scanStatus: "clean", storageStatus: "active" });
    expect(documents.get("document-failed-replay")).toMatchObject({ scanStatus: "failed", storageStatus: "quarantined" });
    expect(documents.get("document-stale")).toMatchObject({ scanStatus: "clean", storageStatus: "active" });
    for (const context of stages) {
      expect(Object.keys(context).sort()).toEqual(context.outcome === undefined ? ["attemptCount", "stage"] : ["attemptCount", "outcome", "stage"]);
      for (const unsafe of unsafeKeys) expect(context).not.toHaveProperty(unsafe);
    }
  });
});
