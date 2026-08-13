import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appointmentDocumentStorage, createSupabaseAppointmentDocumentStorage, validateAppointmentDocumentSignature, type AppointmentDocumentObjectStorage } from "@/lib/server/document-storage";
import { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import { createDocumentMalwareScanner, type DocumentScanFailureCategory, type DocumentScanResult, type MalwareScanner } from "@/lib/server/document-security/scanner";

export const documentScanMaximumAttempts = 5;
const retryDelaysMs = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;

export type DocumentScanJobStatus = "pending" | "claimed" | "retry_scheduled" | "completed" | "blocked" | "failed" | "cancelled";
export type DocumentScanJob = Readonly<{ id: string; organizationId: string; appointmentId: string; documentId: string; status: DocumentScanJobStatus; attemptCount: number; nextAttemptAt: string; claimedAt: string | null; claimExpiresAt: string | null; claimedBy: string | null; lastFailureCategory: string | null; provider: string | null; providerRequestId: string | null; scanDurationMs: number | null; completedAt: string | null }>;
type JobRow = { id: string; organization_id: string; appointment_request_id: string; document_id: string; status: DocumentScanJobStatus; attempt_count: number; next_attempt_at: string; claimed_at: string | null; claim_expires_at: string | null; claimed_by: string | null; last_failure_category: string | null; provider: string | null; provider_request_id: string | null; scan_duration_ms: number | null; completed_at: string | null };
export type DocumentScanBatchResult = { claimed: number; completed: number; blocked: number; retryScheduled: number; failed: number; cancelled: number };
export const documentScanWorkerStages = ["after_claim", "after_state_revalidation", "after_storage_fetch", "after_scan_result", "after_scan_clean_transition", "after_storage_activation", "after_scan_blocked_transition", "after_scan_failed_transition", "after_retry_scheduled", "after_job_completed", "after_job_blocked", "after_job_failed"] as const;
export type DocumentScanWorkerStage = (typeof documentScanWorkerStages)[number];
export type DocumentScanWorkerStageHook = (context: Readonly<{ stage: DocumentScanWorkerStage; attemptCount: number; outcome?: DocumentScanResult["outcome"] }>) => void | Promise<void>;
const noOpStageHook: DocumentScanWorkerStageHook = () => undefined;

type DocumentScanJobStore = Omit<Pick<ReturnType<typeof createDocumentScanJobStore>, "claim" | "complete" | "block" | "fail" | "scheduleRetry" | "cancel">, "scheduleRetry"> & {
  scheduleRetry: (job: DocumentScanJob, result: DocumentScanResult, now: Date, random: () => number) => ReturnType<ReturnType<typeof createDocumentScanJobStore>["scheduleRetry"]>;
};

type DocumentScanDocumentRepository = Pick<ReturnType<typeof createAppointmentDocumentRepository>, "validateDocumentOwnership" | "markDocumentScanClean" | "markDocumentScanBlocked" | "markDocumentScanFailed" | "activateCleanDocument">;

/** Server-only orchestration dependencies. Production construction supplies real boundaries only. */
export type DocumentScanWorkerDependencies = Readonly<{
  createJobStore?: (supabase: SupabaseClient) => DocumentScanJobStore;
  createDocumentRepository?: (supabase: SupabaseClient) => DocumentScanDocumentRepository;
  scanner?: MalwareScanner;
  storage?: AppointmentDocumentObjectStorage;
  now?: () => Date;
  random?: () => number;
  onStage?: DocumentScanWorkerStageHook;
}>;

const productionDocumentScanWorkerDependencies: DocumentScanWorkerDependencies = Object.freeze({
  createJobStore: createDocumentScanJobStore,
  createDocumentRepository: createAppointmentDocumentRepository,
  now: () => new Date(),
  random: Math.random,
  onStage: noOpStageHook
});

function mapJob(row: JobRow): DocumentScanJob {
  return { id: row.id, organizationId: row.organization_id, appointmentId: row.appointment_request_id, documentId: row.document_id, status: row.status, attemptCount: row.attempt_count, nextAttemptAt: row.next_attempt_at, claimedAt: row.claimed_at, claimExpiresAt: row.claim_expires_at, claimedBy: row.claimed_by, lastFailureCategory: row.last_failure_category, provider: row.provider, providerRequestId: row.provider_request_id, scanDurationMs: row.scan_duration_ms, completedAt: row.completed_at };
}

function mapClaimedJob(row: JobRow): DocumentScanJob {
  if (typeof row.claimed_by !== "string" || row.claimed_by.trim().length === 0) {
    throw new Error("Document scan claim is missing lease ownership.");
  }
  return mapJob({ ...row, status: "claimed" });
}

function safeCategory(result: DocumentScanResult): DocumentScanFailureCategory {
  return result.safeFailureCategory ?? (result.outcome === "permanent_failure" ? "invalid_response" : "unexpected_error");
}

export function documentScanRetryAt(attemptCount: number, now: Date, random = Math.random) {
  const base = retryDelaysMs[Math.min(Math.max(attemptCount - 1, 0), retryDelaysMs.length - 1)];
  const jitter = Math.floor(Math.min(Math.max(random(), 0), 1) * Math.floor(base * 0.1));
  return new Date(now.getTime() + base + jitter).toISOString();
}

async function safeAudit(supabase: SupabaseClient, job: DocumentScanJob, action: "document.scan_started" | "document.scan_retry_scheduled", metadata: Record<string, string | number | null>) {
  const { error } = await supabase.from("audit_logs").insert({ organization_id: job.organizationId, action, entity_type: "appointment_request", entity_id: job.appointmentId, metadata: { documentId: job.documentId, jobId: job.id, attemptCount: job.attemptCount, ...metadata } });
  if (error) throw error;
}

export function createDocumentScanJobStore(supabase: SupabaseClient) {
  return {
    async enqueue(input: { organizationId: string; appointmentId: string; documentId: string }) {
      const { data, error } = await supabase.rpc("enqueue_document_scan_job", { p_organization_id: input.organizationId, p_appointment_request_id: input.appointmentId, p_document_id: input.documentId });
      if (error) throw error;
      return typeof data === "string" ? data : null;
    },
    async claim(input: { batchSize?: number; claimedBy?: string; leaseSeconds?: number } = {}) {
      const { data, error } = await supabase.rpc("claim_document_scan_jobs", { p_batch_size: Math.min(Math.max(input.batchSize ?? 10, 1), 20), p_claimed_by: input.claimedBy ?? `document-scan-worker:${randomUUID()}`, p_lease_seconds: input.leaseSeconds ?? 300 });
      if (error) throw error;
      return ((data ?? []) as JobRow[]).map(mapClaimedJob);
    },
    async complete(job: DocumentScanJob, result: DocumentScanResult) {
      const { data, error } = await supabase.from("document_scan_jobs").update({ status: "completed", provider: result.provider, provider_request_id: result.providerRequestId ?? null, scan_duration_ms: result.durationMs ?? null, completed_at: new Date().toISOString(), claimed_at: null, claim_expires_at: null, claimed_by: null }).eq("id", job.id).eq("organization_id", job.organizationId).eq("document_id", job.documentId).eq("status", "claimed").eq("claimed_by", job.claimedBy ?? "").select().maybeSingle();
      if (error) throw error;
      return data ? mapJob(data as JobRow) : null;
    },
    async block(job: DocumentScanJob, result: DocumentScanResult) {
      const { data, error } = await supabase.from("document_scan_jobs").update({ status: "blocked", provider: result.provider, provider_request_id: result.providerRequestId ?? null, scan_duration_ms: result.durationMs ?? null, completed_at: new Date().toISOString(), claimed_at: null, claim_expires_at: null, claimed_by: null }).eq("id", job.id).eq("organization_id", job.organizationId).eq("document_id", job.documentId).eq("status", "claimed").eq("claimed_by", job.claimedBy ?? "").select().maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async scheduleRetry(job: DocumentScanJob, result: DocumentScanResult, now = new Date(), random = Math.random) {
      const category = safeCategory(result);
      const nextAttemptAt = documentScanRetryAt(job.attemptCount, now, random);
      const { data, error } = await supabase.from("document_scan_jobs").update({ status: "retry_scheduled", next_attempt_at: nextAttemptAt, last_failure_category: category, provider: result.provider, provider_request_id: result.providerRequestId ?? null, scan_duration_ms: result.durationMs ?? null, claimed_at: null, claim_expires_at: null, claimed_by: null }).eq("id", job.id).eq("organization_id", job.organizationId).eq("document_id", job.documentId).eq("status", "claimed").eq("claimed_by", job.claimedBy ?? "").select().maybeSingle();
      if (error) throw error;
      if (!data) return false;
      await safeAudit(supabase, job, "document.scan_retry_scheduled", { provider: result.provider, outcome: result.outcome, failureCategory: category, durationMs: result.durationMs ?? null });
      return true;
    },
    async fail(job: DocumentScanJob, result: DocumentScanResult) {
      const category = safeCategory(result);
      const { data, error } = await supabase.from("document_scan_jobs").update({ status: "failed", last_failure_category: category, provider: result.provider, provider_request_id: result.providerRequestId ?? null, scan_duration_ms: result.durationMs ?? null, completed_at: new Date().toISOString(), claimed_at: null, claim_expires_at: null, claimed_by: null }).eq("id", job.id).eq("organization_id", job.organizationId).eq("document_id", job.documentId).eq("status", "claimed").eq("claimed_by", job.claimedBy ?? "").select().maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async cancel(job: DocumentScanJob) {
      const { data, error } = await supabase.from("document_scan_jobs").update({ status: "cancelled", completed_at: new Date().toISOString(), claimed_at: null, claim_expires_at: null, claimed_by: null }).eq("id", job.id).eq("organization_id", job.organizationId).eq("document_id", job.documentId).eq("status", "claimed").eq("claimed_by", job.claimedBy ?? "").select().maybeSingle();
      if (error) throw error;
      return Boolean(data);
    }
  };
}

export async function getDocumentScanMetrics(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase.from("document_scan_jobs").select("status,created_at,completed_at,scan_duration_ms").eq("organization_id", organizationId);
  if (error) throw error;
  const rows = data ?? [];
  const count = (status: DocumentScanJobStatus) => rows.filter((row) => row.status === status).length;
  const pending = rows.filter((row) => row.status === "pending" || row.status === "retry_scheduled");
  const durations = rows.map((row) => row.scan_duration_ms).filter((value): value is number => typeof value === "number");
  const completed = rows.filter((row) => row.status === "completed" && row.completed_at).map((row) => row.completed_at!).sort();
  return { pending: count("pending"), retryScheduled: count("retry_scheduled"), claimed: count("claimed"), failed: count("failed"), blocked: count("blocked"), oldestPendingAt: pending.map((row) => row.created_at).sort()[0] ?? null, lastSuccessfulScanAt: completed.at(-1) ?? null, averageScanDurationMs: durations.length ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length) : null };
}

export async function processDocumentScanBatch(supabase: SupabaseClient, options: DocumentScanWorkerDependencies & { batchSize?: number } = {}): Promise<DocumentScanBatchResult> {
  const store = (options.createJobStore ?? productionDocumentScanWorkerDependencies.createJobStore!)(supabase);
  const repository = (options.createDocumentRepository ?? productionDocumentScanWorkerDependencies.createDocumentRepository!)(supabase);
  const scanner = options.scanner ?? createDocumentMalwareScanner();
  const storage = options.storage ?? createSupabaseAppointmentDocumentStorage(supabase);
  const now = options.now ?? productionDocumentScanWorkerDependencies.now!;
  const random = options.random ?? productionDocumentScanWorkerDependencies.random!;
  const onStage = options.onStage ?? productionDocumentScanWorkerDependencies.onStage!;
  const jobs = await store.claim({ batchSize: options.batchSize });
  const result: DocumentScanBatchResult = { claimed: jobs.length, completed: 0, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 };
  for (const job of jobs) {
    await onStage({ stage: "after_claim", attemptCount: job.attemptCount });
    await safeAudit(supabase, job, "document.scan_started", { provider: null, outcome: "claimed", failureCategory: null, durationMs: null });
    const document = await repository.validateDocumentOwnership(job.organizationId, job.appointmentId, job.documentId);
    await onStage({ stage: "after_state_revalidation", attemptCount: job.attemptCount });
    if (!document || document.deletedAt || document.storageStatus === "removed") { await store.cancel(job); result.cancelled++; continue; }
    if (document.scanStatus === "clean") {
      const replay = { outcome: "clean" as const, provider: document.scanProvider ?? "replay" };
      if (document.storageStatus === "active") { if (await store.complete(job, replay)) result.completed++; continue; }
      if (document.storageStatus === "quarantined") {
        try { await repository.activateCleanDocument({ organizationId: job.organizationId, appointmentId: job.appointmentId, documentId: job.documentId, actorType: "system", now: now() }); if (await store.complete(job, replay)) result.completed++; }
        catch { if (await store.scheduleRetry(job, { outcome: "retryable_failure", provider: replay.provider, safeFailureCategory: "provider_unavailable" }, now(), random)) result.retryScheduled++; }
        continue;
      }
    }
    if (document.scanStatus === "infected" || document.scanStatus === "suspicious") { if (await store.block(job, { outcome: document.scanStatus, provider: document.scanProvider ?? "replay" })) { await onStage({ stage: "after_job_blocked", attemptCount: job.attemptCount, outcome: document.scanStatus }); result.blocked++; } continue; }
    if (document.scanStatus === "failed" && document.storageStatus === "quarantined") { if (await store.fail(job, { outcome: "permanent_failure", provider: document.scanProvider ?? "replay", safeFailureCategory: (document.scanFailureCategory as DocumentScanFailureCategory | null) ?? "unexpected_error" })) { await onStage({ stage: "after_job_failed", attemptCount: job.attemptCount, outcome: "permanent_failure" }); result.failed++; } continue; }
    if (document.scanStatus !== "pending" || document.storageStatus !== "quarantined") { await store.cancel(job); result.cancelled++; continue; }
    let scan: DocumentScanResult;
    try {
      const bytes = await storage.download(document.storageKey);
      await onStage({ stage: "after_storage_fetch", attemptCount: job.attemptCount });
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0 || bytes.byteLength > appointmentDocumentStorage.maximumSizeBytes) throw new Error("Document storage object is invalid.");
      validateAppointmentDocumentSignature(document.contentType, bytes);
      const started = now().getTime();
      scan = await scanner.scan({ documentId: document.id, contentType: document.contentType, sizeBytes: document.sizeBytes, bytes: new Uint8Array(bytes), correlationId: job.id });
      scan = { ...scan, durationMs: scan.durationMs ?? now().getTime() - started };
    } catch {
      scan = { outcome: "retryable_failure", provider: "document-security", safeFailureCategory: "provider_unavailable" };
    }
    await onStage({ stage: "after_scan_result", attemptCount: job.attemptCount, outcome: scan.outcome });
    if (scan.outcome === "clean") {
      try { await repository.markDocumentScanClean({ organizationId: job.organizationId, appointmentId: job.appointmentId, documentId: job.documentId, actorType: "system", provider: scan.provider, now: now() }); }
      catch { if (await store.scheduleRetry(job, { outcome: "retryable_failure", provider: scan.provider, safeFailureCategory: "provider_unavailable" }, now(), random)) { await onStage({ stage: "after_retry_scheduled", attemptCount: job.attemptCount, outcome: "retryable_failure" }); result.retryScheduled++; } continue; }
      await onStage({ stage: "after_scan_clean_transition", attemptCount: job.attemptCount, outcome: scan.outcome });
      try { await repository.activateCleanDocument({ organizationId: job.organizationId, appointmentId: job.appointmentId, documentId: job.documentId, actorType: "system", now: now() }); }
      catch { if (await store.scheduleRetry(job, { outcome: "retryable_failure", provider: scan.provider, safeFailureCategory: "provider_unavailable" }, now(), random)) { await onStage({ stage: "after_retry_scheduled", attemptCount: job.attemptCount, outcome: "retryable_failure" }); result.retryScheduled++; } continue; }
      await onStage({ stage: "after_storage_activation", attemptCount: job.attemptCount, outcome: scan.outcome });
      try { if (await store.complete(job, scan)) { await onStage({ stage: "after_job_completed", attemptCount: job.attemptCount, outcome: scan.outcome }); result.completed++; } }
      catch { if (await store.scheduleRetry(job, { outcome: "retryable_failure", provider: scan.provider, safeFailureCategory: "provider_unavailable" }, now(), random)) { await onStage({ stage: "after_retry_scheduled", attemptCount: job.attemptCount, outcome: "retryable_failure" }); result.retryScheduled++; } }
      continue;
    }
    if (scan.outcome === "infected" || scan.outcome === "suspicious") { await repository.markDocumentScanBlocked({ organizationId: job.organizationId, appointmentId: job.appointmentId, documentId: job.documentId, actorType: "system", result: scan.outcome, provider: scan.provider, category: scan.outcome === "infected" ? "policy_blocked" : "suspicious_content", now: now() }); await onStage({ stage: "after_scan_blocked_transition", attemptCount: job.attemptCount, outcome: scan.outcome }); if (await store.block(job, scan)) { await onStage({ stage: "after_job_blocked", attemptCount: job.attemptCount, outcome: scan.outcome }); result.blocked++; } continue; }
    const terminal = scan.outcome === "permanent_failure" || job.attemptCount >= documentScanMaximumAttempts;
    if (terminal) { await repository.markDocumentScanFailed({ organizationId: job.organizationId, appointmentId: job.appointmentId, documentId: job.documentId, actorType: "system", provider: scan.provider, category: safeCategory(scan), now: now() }); await onStage({ stage: "after_scan_failed_transition", attemptCount: job.attemptCount, outcome: scan.outcome }); if (await store.fail(job, scan)) { await onStage({ stage: "after_job_failed", attemptCount: job.attemptCount, outcome: scan.outcome }); result.failed++; } }
    else { if (await store.scheduleRetry(job, scan, now(), random)) { await onStage({ stage: "after_retry_scheduled", attemptCount: job.attemptCount, outcome: scan.outcome }); result.retryScheduled++; } }
  }
  return result;
}

/** Server-only factory; tests may supply a stage hook, production defaults to real dependencies and a no-op hook. */
export function createDocumentScanWorker(dependencies: DocumentScanWorkerDependencies = productionDocumentScanWorkerDependencies) {
  const workerDependencies: DocumentScanWorkerDependencies = Object.freeze({ ...productionDocumentScanWorkerDependencies, ...dependencies });
  return { process: (supabase: SupabaseClient, batchSize?: number) => processDocumentScanBatch(supabase, { ...workerDependencies, batchSize }) };
}
