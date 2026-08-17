import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appointmentDocumentStorageKey, type AppointmentDocumentContentType, validateAppointmentDocumentUploadMetadata } from "@/lib/server/document-storage";
import { assertDocumentReviewTransition, type AppointmentDocumentStatus, type DocumentReviewer, validateDocumentReviewer, validateReviewNotes } from "@/lib/server/document-review";

export type { AppointmentDocumentStatus, DocumentReviewer } from "@/lib/server/document-review";

export const documentScanStatuses = ["pending", "clean", "infected", "suspicious", "failed"] as const;
export type DocumentScanStatus = (typeof documentScanStatuses)[number];
export const documentStorageStatuses = ["quarantined", "active", "removed"] as const;
export type DocumentStorageStatus = (typeof documentStorageStatuses)[number];
export const documentMetadataCreationDefaults = {
  status: "uploaded",
  scan_status: "pending",
  storage_status: "quarantined",
  scan_attempt_count: 0
} as const;
export const documentScanFailureCategories = ["configuration_error", "provider_unavailable", "provider_timeout", "provider_rate_limited", "transient_error", "invalid_response", "authentication_failed", "provider_rejected", "network_error", "unexpected_error"] as const;
export type DocumentScanFailureCategory = (typeof documentScanFailureCategories)[number];
export const documentScanBlockedCategories = ["policy_blocked", "suspicious_content"] as const;
export type DocumentScanBlockedCategory = (typeof documentScanBlockedCategories)[number];
export type DocumentScanActor = "system";
export type DocumentStorageActor = "system";

export type AppointmentDocumentFile = Readonly<{
  id: string;
  organizationId: string;
  appointmentId: string;
  originalFilename: string;
  storageKey: string;
  contentType: AppointmentDocumentContentType;
  sizeBytes: number;
  status: AppointmentDocumentStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  uploadedByType: "customer" | "staff" | "system";
  uploadedAt: string;
  deletedAt: string | null;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  scanStatus?: DocumentScanStatus;
  storageStatus?: DocumentStorageStatus;
  scanProvider?: string | null;
  scanRequestedAt?: string | null;
  scannedAt?: string | null;
  scanFailureCategory?: string | null;
  scanAttemptCount?: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CustomerDocumentStatus = Readonly<{ id: string; originalFilename: string; uploadedAt: string; status: "uploaded" | "approved" | "needs_replacement"; replacementReason: string | null }>;

type DocumentRow = {
  id: string; organization_id: string; appointment_request_id: string; original_filename: string; storage_key: string;
  content_type: AppointmentDocumentContentType; size_bytes: number; status: AppointmentDocumentStatus; uploaded_by_type: AppointmentDocumentFile["uploadedByType"];
  reviewed_by: string | null; reviewer: { full_name: string | null; email: string | null } | null; reviewed_at: string | null; review_notes: string | null;
  uploaded_at: string; deleted_at: string | null; metadata: AppointmentDocumentFile["metadata"] | null; created_at: string; updated_at: string;
  scan_status?: string | null; storage_status?: string | null; scan_provider?: string | null; scan_requested_at?: string | null; scanned_at?: string | null; scan_failure_category?: string | null; scan_attempt_count?: number | null;
};

type DocumentScanInput = Readonly<{
  organizationId: string;
  appointmentId: string;
  documentId: string;
  actorType: DocumentScanActor;
  now?: Date;
}>;

type DocumentStorageInput = Readonly<{
  organizationId: string;
  appointmentId: string;
  documentId: string;
  actorType: DocumentStorageActor;
  now?: Date;
}>;

const plainTextScanValuePattern = /(^|\s)(#{1,6}\s|[-*+]\s|>\s|`|\[[^\]]+\]\([^)]*\))|[<>]|\b(?:https?:\/\/|www\.)/i;

function validateDocumentSystemActor(actorType: "system"): "system" {
  if (actorType !== "system") throw new Error("Document transition requires a trusted system actor.");
  return actorType;
}

function validateDocumentScanProvider(provider: string): string {
  const normalized = provider.trim();
  if (normalized.length === 0 || normalized.length > 120 || plainTextScanValuePattern.test(normalized)) throw new Error("Document scan provider must be plain text.");
  return normalized;
}

function validateDocumentScanCategory<T extends readonly string[]>(category: string, allowed: T, label: string): T[number] {
  const normalized = category.trim();
  if (!allowed.includes(normalized)) throw new Error(`Document scan ${label} is invalid.`);
  return normalized as T[number];
}

function requiredStatus<T extends readonly string[]>(value: string | null | undefined, allowed: T, fallback: T[number], label: string): T[number] {
  if (value === null || value === undefined) return fallback;
  if (!allowed.includes(value)) throw new Error(`Document ${label} is invalid.`);
  return value as T[number];
}

export function mapDocument(row: DocumentRow): AppointmentDocumentFile {
  const scanStatus = requiredStatus(row.scan_status, documentScanStatuses, "pending", "scan status");
  const storageStatus = requiredStatus(row.storage_status, documentStorageStatuses, "quarantined", "storage status");
  const scanAttemptCount = row.scan_attempt_count ?? 0;
  if (!Number.isInteger(scanAttemptCount) || scanAttemptCount < 0) throw new Error("Document scan attempt count is invalid.");
  if (storageStatus === "active" && scanStatus !== "clean") throw new Error("Document active storage requires a clean scan.");
  return { id: row.id, organizationId: row.organization_id, appointmentId: row.appointment_request_id, originalFilename: row.original_filename, storageKey: row.storage_key, contentType: row.content_type, sizeBytes: Number(row.size_bytes), status: row.status, reviewedBy: row.reviewed_by, reviewerName: row.reviewer?.full_name ?? row.reviewer?.email ?? null, reviewedAt: row.reviewed_at, reviewNotes: row.review_notes, uploadedByType: row.uploaded_by_type, uploadedAt: row.uploaded_at, deletedAt: row.deleted_at, metadata: row.metadata ?? {}, scanStatus, storageStatus, scanProvider: row.scan_provider ?? null, scanRequestedAt: row.scan_requested_at ?? null, scannedAt: row.scanned_at ?? null, scanFailureCategory: row.scan_failure_category ?? null, scanAttemptCount, createdAt: row.created_at, updatedAt: row.updated_at };
}

const documentSelect = "*, reviewer:user_profiles(full_name,email)";
const downloadDocumentSelect = "id,organization_id,appointment_request_id,original_filename,storage_key,content_type,size_bytes,status,uploaded_by_type,uploaded_at,deleted_at,scan_status,storage_status,scan_attempt_count,created_at,updated_at";

function mapDownloadDocument(row: Omit<DocumentRow, "reviewed_by" | "reviewer" | "reviewed_at" | "review_notes" | "metadata">): AppointmentDocumentFile {
  return mapDocument({ ...row, reviewed_by: null, reviewer: null, reviewed_at: null, review_notes: null, metadata: {} });
}

export function documentUploadedAudit(document: Pick<AppointmentDocumentFile, "id" | "organizationId" | "appointmentId" | "contentType" | "sizeBytes" | "uploadedByType">) {
  return {
    organization_id: document.organizationId,
    action: "document.uploaded",
    entity_type: "appointment_request",
    entity_id: document.appointmentId,
    metadata: { documentId: document.id, contentType: document.contentType, sizeBytes: document.sizeBytes, uploadedByType: document.uploadedByType }
  };
}

export function documentDownloadedAudit(document: Pick<AppointmentDocumentFile, "id" | "organizationId" | "appointmentId">, actorType: "owner" | "admin", occurredAt = new Date().toISOString()) {
  return {
    organization_id: document.organizationId,
    action: "document.downloaded",
    entity_type: "appointment_request",
    entity_id: document.appointmentId,
    metadata: { documentId: document.id, appointmentId: document.appointmentId, organizationId: document.organizationId, actorType, occurredAt }
  };
}

export function documentPreviewedAudit(document: Pick<AppointmentDocumentFile, "id" | "organizationId" | "appointmentId">, actorType: "owner" | "admin", occurredAt = new Date().toISOString()) {
  return {
    organization_id: document.organizationId,
    action: "document.previewed",
    entity_type: "appointment_request",
    entity_id: document.appointmentId,
    metadata: { documentId: document.id, actorType, occurredAt }
  };
}

export function documentProviderHandoffDownloadedAudit(document: Pick<AppointmentDocumentFile, "id" | "organizationId" | "appointmentId">, actorType: "owner" | "admin", occurredAt = new Date().toISOString()) {
  return {
    organization_id: document.organizationId,
    action: "document.provider_handoff_downloaded",
    entity_type: "appointment_request",
    entity_id: document.appointmentId,
    metadata: { documentId: document.id, actorType, occurredAt }
  };
}

export function documentReviewedAudit(document: Pick<AppointmentDocumentFile, "id" | "organizationId" | "appointmentId">, reviewer: DocumentReviewer, action: "document.approved" | "document.rejected", occurredAt = new Date().toISOString()) {
  return {
    organization_id: document.organizationId,
    action,
    entity_type: "appointment_request",
    entity_id: document.appointmentId,
    metadata: { documentId: document.id, appointmentId: document.appointmentId, organizationId: document.organizationId, reviewerId: reviewer.id, reviewerRole: reviewer.role, occurredAt }
  };
}

export function documentReplacedAudit(input: { organizationId: string; appointmentId: string; previousDocumentId: string; replacementDocumentId: string }) {
  return { organization_id: input.organizationId, action: "document.replaced", entity_type: "appointment_request", entity_id: input.appointmentId, metadata: { previousDocumentId: input.previousDocumentId, replacementDocumentId: input.replacementDocumentId } };
}

function documentScanPendingAudit(document: AppointmentDocumentFile) {
  return documentScanAudit({ document, actorType: "system", action: "document.scan_pending", resultCategory: "upload" });
}

function documentScanAudit(input: { document: AppointmentDocumentFile; actorType: DocumentScanActor; action: "document.scan_clean" | "document.scan_blocked" | "document.scan_failed" | "document.scan_pending"; resultCategory: string; provider?: string | null }) {
  return {
    organization_id: input.document.organizationId,
    action: input.action,
    entity_type: "appointment_request",
    entity_id: input.document.appointmentId,
    metadata: {
      documentId: input.document.id,
      actorType: input.actorType,
      resultCategory: input.resultCategory,
      attemptCount: input.document.scanAttemptCount ?? 0,
      ...(input.provider ? { provider: input.provider } : {})
    }
  };
}

function documentStorageAudit(input: { document: AppointmentDocumentFile; actorType: DocumentStorageActor; action: "document.storage_activated" | "document.storage_removed"; resultCategory: "active" | "removed" }) {
  return {
    organization_id: input.document.organizationId,
    action: input.action,
    entity_type: "appointment_request",
    entity_id: input.document.appointmentId,
    metadata: {
      documentId: input.document.id,
      actorType: input.actorType,
      resultCategory: input.resultCategory,
      scanStatus: input.document.scanStatus,
      attemptCount: input.document.scanAttemptCount ?? 0
    }
  };
}

function customerDocumentStatus(document: AppointmentDocumentFile): CustomerDocumentStatus {
  return { id: document.id, originalFilename: document.originalFilename, uploadedAt: document.uploadedAt, status: document.status === "rejected" ? "needs_replacement" : document.status, replacementReason: document.status === "rejected" ? document.reviewNotes : null };
}

type ReviewDocumentInput = {
  organizationId: string;
  appointmentId: string;
  documentId: string;
  reviewer: DocumentReviewer;
  reviewNotes?: string | null;
  now?: Date;
};

async function reviewDocument(supabase: SupabaseClient, input: ReviewDocumentInput, status: "approved" | "rejected") {
  const reviewer = await resolveDocumentReviewer(supabase, input.organizationId, input.reviewer);
  const reviewNotes = validateReviewNotes(input.reviewNotes);
  const { data: existing, error: existingError } = await supabase
    .from("appointment_document_files")
    .select(documentSelect)
    .eq("organization_id", input.organizationId)
    .eq("appointment_request_id", input.appointmentId)
    .eq("id", input.documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Document is unavailable for review.");

  const current = mapDocument(existing as DocumentRow);
  assertDocumentReviewTransition(current.status, status);
  const reviewedAt = (input.now ?? new Date()).toISOString();
  const { data, error } = await supabase
    .from("appointment_document_files")
    .update({ status, reviewed_by: reviewer.id, reviewed_at: reviewedAt, review_notes: reviewNotes, updated_at: reviewedAt })
    .eq("organization_id", input.organizationId)
    .eq("appointment_request_id", input.appointmentId)
    .eq("id", input.documentId)
    .is("deleted_at", null)
    .select(documentSelect)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Document is unavailable for review.");

  const document = mapDocument(data as DocumentRow);
  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(documentReviewedAudit(document, reviewer, status === "approved" ? "document.approved" : "document.rejected", reviewedAt));
  if (auditError) throw auditError;
  return document;
}

async function resolveDocumentReviewer(supabase: SupabaseClient, organizationId: string, candidate: DocumentReviewer): Promise<DocumentReviewer> {
  const reviewer = validateDocumentReviewer(candidate);
  const { data, error } = await supabase
    .from("organization_users")
    .select("user_id,organization_id,role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", reviewer.id)
    .eq("status", "active")
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId || data.user_id !== reviewer.id || (data.role !== "owner" && data.role !== "admin")) {
    throw new Error("Document review requires active owner or admin access.");
  }
  return { id: reviewer.id, role: data.role };
}

async function getScannableDocument(supabase: SupabaseClient, input: Pick<DocumentScanInput, "organizationId" | "appointmentId" | "documentId">) {
  const { data, error } = await supabase
    .from("appointment_document_files")
    .select(documentSelect)
    .eq("organization_id", input.organizationId)
    .eq("appointment_request_id", input.appointmentId)
    .eq("id", input.documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Document is unavailable for scanning.");
  const document = mapDocument(data as DocumentRow);
  if (document.storageStatus === "removed") throw new Error("Document is unavailable for scanning.");
  return document;
}

function assertDocumentScanTransition(from: DocumentScanStatus, to: DocumentScanStatus) {
  if (from === to && to !== "pending") return "noop" as const;
  if ((from === "pending" && ["clean", "infected", "suspicious", "failed"].includes(to)) || (from === "failed" && to === "pending")) return "transition" as const;
  throw new Error("Document scan transition is not allowed.");
}

type DocumentScanTransition = Readonly<{
  target: DocumentScanStatus;
  occurredAt: string;
  provider: string | null;
  failureCategory: string | null;
  auditAction: "document.scan_clean" | "document.scan_blocked" | "document.scan_failed" | "document.scan_pending";
  resultCategory: string;
}>;

async function transitionDocumentScan(
  supabase: SupabaseClient,
  input: DocumentScanInput,
  transition: DocumentScanTransition
) {
  const actorType = validateDocumentSystemActor(input.actorType);
  const current = await getScannableDocument(supabase, input);
  if (assertDocumentScanTransition(current.scanStatus ?? "pending", transition.target) === "noop") return current;
  const fields = transition.target === "pending"
    ? { scan_status: "pending", scan_provider: null, scan_requested_at: transition.occurredAt, scanned_at: null, scan_failure_category: null, scan_attempt_count: current.scanAttemptCount ?? 0, updated_at: transition.occurredAt }
    : { scan_status: transition.target, scan_provider: transition.provider, scanned_at: transition.occurredAt, scan_failure_category: transition.failureCategory, scan_attempt_count: (current.scanAttemptCount ?? 0) + 1, updated_at: transition.occurredAt };

  const { data, error } = await supabase
    .from("appointment_document_files")
    .update(fields)
    .eq("organization_id", input.organizationId)
    .eq("appointment_request_id", input.appointmentId)
    .eq("id", input.documentId)
    .eq("scan_status", current.scanStatus ?? "pending")
    .is("deleted_at", null)
    .select(documentSelect)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const latest = await getScannableDocument(supabase, input);
    if (latest.scanStatus === transition.target) return latest;
    throw new Error("Document scan transition is not allowed.");
  }

  const document = mapDocument(data as DocumentRow);
  const { error: auditError } = await supabase.from("audit_logs").insert(documentScanAudit({ document, actorType, action: transition.auditAction, resultCategory: transition.resultCategory, provider: transition.provider }));
  if (auditError) throw auditError;
  return document;
}

async function getStorageTransitionDocument(supabase: SupabaseClient, input: Pick<DocumentStorageInput, "organizationId" | "appointmentId" | "documentId">) {
  const { data, error } = await supabase
    .from("appointment_document_files")
    .select(documentSelect)
    .eq("organization_id", input.organizationId)
    .eq("appointment_request_id", input.appointmentId)
    .eq("id", input.documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Document is unavailable for storage transition.");
  return mapDocument(data as DocumentRow);
}

function assertDocumentStorageTransition(document: AppointmentDocumentFile, target: "active" | "removed") {
  const storageStatus = document.storageStatus ?? "quarantined";
  if (storageStatus === target) return "noop" as const;
  if (target === "active" && storageStatus === "quarantined" && document.scanStatus === "clean") return "transition" as const;
  if (target === "removed" && (storageStatus === "quarantined" || storageStatus === "active")) return "transition" as const;
  throw new Error("Document storage transition is not allowed.");
}

async function transitionDocumentStorage(
  supabase: SupabaseClient,
  input: DocumentStorageInput,
  target: "active" | "removed"
) {
  const actorType = validateDocumentSystemActor(input.actorType);
  const current = await getStorageTransitionDocument(supabase, input);
  if (assertDocumentStorageTransition(current, target) === "noop") return current;
  const updatedAt = (input.now ?? new Date()).toISOString();
  const { data, error } = await supabase
    .from("appointment_document_files")
    .update({ storage_status: target, updated_at: updatedAt })
    .eq("organization_id", input.organizationId)
    .eq("appointment_request_id", input.appointmentId)
    .eq("id", input.documentId)
    .eq("storage_status", current.storageStatus ?? "quarantined")
    .is("deleted_at", null)
    .select(documentSelect)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const latest = await getStorageTransitionDocument(supabase, input);
    if (latest.storageStatus === target) return latest;
    throw new Error("Document storage transition is not allowed.");
  }
  const document = mapDocument(data as DocumentRow);
  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(documentStorageAudit({ document, actorType, action: target === "active" ? "document.storage_activated" : "document.storage_removed", resultCategory: target }));
  if (auditError) throw auditError;
  return document;
}

export function createAppointmentDocumentRepository(supabase: SupabaseClient) {
  return {
    async persistUploadedMetadata(input: { organizationId: string; appointmentId: string; uploadedByType: AppointmentDocumentFile["uploadedByType"]; metadata: unknown; documentId?: string }) {
      const metadata = validateAppointmentDocumentUploadMetadata(input.metadata);
      const { data: appointment, error: appointmentError } = await supabase.from("appointment_requests").select("id,organization_id").eq("id", input.appointmentId).eq("organization_id", input.organizationId).maybeSingle();
      if (appointmentError) throw appointmentError;
      if (!appointment || appointment.organization_id !== input.organizationId || appointment.id !== input.appointmentId) throw new Error("Appointment does not belong to this organization.");
      const id = input.documentId ?? randomUUID();
      const storageKey = appointmentDocumentStorageKey({ organizationId: input.organizationId, appointmentId: input.appointmentId, documentId: id });
      const { data, error } = await supabase.from("appointment_document_files").insert({
        id, organization_id: input.organizationId, appointment_request_id: input.appointmentId, original_filename: metadata.originalFilename,
        storage_key: storageKey, content_type: metadata.contentType, size_bytes: metadata.sizeBytes,
        ...documentMetadataCreationDefaults,
        uploaded_by_type: input.uploadedByType, metadata: {}
      }).select(documentSelect).single();
      if (error) throw error;
      const document = mapDocument(data as DocumentRow);
      const { error: auditError } = await supabase.from("audit_logs").insert(documentUploadedAudit(document));
      if (auditError) throw auditError;
      const { error: scanAuditError } = await supabase.from("audit_logs").insert(documentScanPendingAudit(document));
      if (scanAuditError) throw scanAuditError;
      return document;
    },
    async getDocument(organizationId: string, documentId: string) {
      const { data, error } = await supabase.from("appointment_document_files").select(documentSelect).eq("organization_id", organizationId).eq("id", documentId).maybeSingle();
      if (error) throw error;
      return data ? mapDocument(data as DocumentRow) : null;
    },
    async listAppointmentDocuments(organizationId: string, appointmentId: string) {
      const { data, error } = await supabase.from("appointment_document_files").select(documentSelect).eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).is("deleted_at", null).order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapDocument(row as DocumentRow));
    },
    async listReadinessSources(organizationId: string, appointmentIds: readonly string[]) {
      if (appointmentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("appointment_document_files")
        .select("organization_id,appointment_request_id,status,deleted_at")
        .eq("organization_id", organizationId)
        .in("appointment_request_id", [...appointmentIds]);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        organizationId: row.organization_id,
        appointmentId: row.appointment_request_id,
        status: row.status as AppointmentDocumentStatus,
        deletedAt: row.deleted_at
      }));
    },
    async listNextActionSources(organizationId: string, appointmentIds: readonly string[]) {
      if (appointmentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("appointment_document_files")
        .select("organization_id,appointment_request_id,status,scan_status,storage_status,deleted_at")
        .eq("organization_id", organizationId)
        .in("appointment_request_id", [...appointmentIds]);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        organizationId: String(row.organization_id),
        appointmentId: String(row.appointment_request_id),
        status: String(row.status),
        scanStatus: row.scan_status === null || row.scan_status === undefined ? null : String(row.scan_status),
        storageStatus: row.storage_status === null || row.storage_status === undefined ? null : String(row.storage_status),
        deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
      }));
    },
    async validateDocumentOwnership(organizationId: string, appointmentId: string, documentId: string) {
      const { data, error } = await supabase.from("appointment_document_files").select(documentSelect).eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).eq("id", documentId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapDocument(data as DocumentRow) : null;
    },
    async getDocumentForDownload(organizationId: string, appointmentId: string, documentId: string) {
      const { data, error } = await supabase
        .from("appointment_document_files")
        .select(downloadDocumentSelect)
        .eq("organization_id", organizationId)
        .eq("appointment_request_id", appointmentId)
        .eq("id", documentId)
        .eq("scan_status", "clean")
        .eq("storage_status", "active")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDownloadDocument(data as Omit<DocumentRow, "reviewed_by" | "reviewer" | "reviewed_at" | "review_notes" | "metadata">) : null;
    },
    async getDocumentForPreview(organizationId: string, appointmentId: string, documentId: string) {
      const { data, error } = await supabase
        .from("appointment_document_files")
        .select(downloadDocumentSelect)
        .eq("organization_id", organizationId)
        .eq("appointment_request_id", appointmentId)
        .eq("id", documentId)
        .eq("scan_status", "clean")
        .eq("storage_status", "active")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDownloadDocument(data as Omit<DocumentRow, "reviewed_by" | "reviewer" | "reviewed_at" | "review_notes" | "metadata">) : null;
    },
    async getDocumentForProviderHandoff(organizationId: string, appointmentId: string, documentId: string) {
      const { data, error } = await supabase
        .from("appointment_document_files")
        .select(downloadDocumentSelect)
        .eq("organization_id", organizationId)
        .eq("appointment_request_id", appointmentId)
        .eq("id", documentId)
        .eq("scan_status", "clean")
        .eq("storage_status", "active")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDownloadDocument(data as Omit<DocumentRow, "reviewed_by" | "reviewer" | "reviewed_at" | "review_notes" | "metadata">) : null;
    },
    async recordDocumentDownload(document: AppointmentDocumentFile, actorType: "owner" | "admin") {
      const { error } = await supabase.from("audit_logs").insert(documentDownloadedAudit(document, actorType));
      if (error) throw error;
    },
    async recordDocumentPreview(document: AppointmentDocumentFile, actorType: "owner" | "admin") {
      const { error } = await supabase.from("audit_logs").insert(documentPreviewedAudit(document, actorType));
      if (error) throw error;
    },
    async recordDocumentProviderHandoffDownload(document: AppointmentDocumentFile, actorType: "owner" | "admin") {
      const { error } = await supabase.from("audit_logs").insert(documentProviderHandoffDownloadedAudit(document, actorType));
      if (error) throw error;
    },
    async getDocumentReview(organizationId: string, appointmentId: string, documentId: string) {
      const document = await this.validateDocumentOwnership(organizationId, appointmentId, documentId);
      if (!document) return null;
      return { status: document.status, reviewedBy: document.reviewedBy, reviewedAt: document.reviewedAt, reviewNotes: document.reviewNotes };
    },
    async listPendingDocuments(organizationId: string, appointmentId?: string) {
      let query = supabase.from("appointment_document_files").select(documentSelect).eq("organization_id", organizationId).eq("status", "uploaded").is("deleted_at", null);
      if (appointmentId) query = query.eq("appointment_request_id", appointmentId);
      const { data, error } = await query.order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapDocument(row as DocumentRow));
    },
    async getCustomerDocumentStatus(organizationId: string, appointmentId: string) {
      const documents = await this.listAppointmentDocuments(organizationId, appointmentId);
      return documents.map(customerDocumentStatus);
    },
    async replaceDocument(input: { organizationId: string; appointmentId: string; rejectedDocumentId: string; uploadedByType: AppointmentDocumentFile["uploadedByType"]; metadata: unknown; documentId?: string }) {
      const previous = await this.validateDocumentOwnership(input.organizationId, input.appointmentId, input.rejectedDocumentId);
      if (!previous || previous.status !== "rejected") throw new Error("Document replacement is unavailable.");
      return this.persistUploadedMetadata({ organizationId: input.organizationId, appointmentId: input.appointmentId, uploadedByType: input.uploadedByType, metadata: input.metadata, documentId: input.documentId });
    },
    async approveDocument(input: { organizationId: string; appointmentId: string; documentId: string; reviewer: DocumentReviewer; reviewNotes?: string | null; now?: Date }) {
      return reviewDocument(supabase, input, "approved");
    },
    async rejectDocument(input: { organizationId: string; appointmentId: string; documentId: string; reviewer: DocumentReviewer; reviewNotes?: string | null; now?: Date }) {
      return reviewDocument(supabase, input, "rejected");
    },
    async markDocumentScanClean(input: DocumentScanInput & { provider: string }) {
      const provider = validateDocumentScanProvider(input.provider);
      const scannedAt = (input.now ?? new Date()).toISOString();
      return transitionDocumentScan(supabase, input, { target: "clean", occurredAt: scannedAt, provider, failureCategory: null, auditAction: "document.scan_clean", resultCategory: "clean" });
    },
    async markDocumentScanBlocked(input: DocumentScanInput & { result: "infected" | "suspicious"; provider: string; category?: string }) {
      const provider = validateDocumentScanProvider(input.provider);
      const category = input.category === undefined ? null : validateDocumentScanCategory(input.category, documentScanBlockedCategories, "blocked category");
      const scannedAt = (input.now ?? new Date()).toISOString();
      return transitionDocumentScan(supabase, input, { target: input.result, occurredAt: scannedAt, provider, failureCategory: category, auditAction: "document.scan_blocked", resultCategory: input.result });
    },
    async markDocumentScanFailed(input: DocumentScanInput & { provider?: string; category: string }) {
      const provider = input.provider === undefined ? null : validateDocumentScanProvider(input.provider);
      const category = validateDocumentScanCategory(input.category, documentScanFailureCategories, "failure category");
      const scannedAt = (input.now ?? new Date()).toISOString();
      return transitionDocumentScan(supabase, input, { target: "failed", occurredAt: scannedAt, provider, failureCategory: category, auditAction: "document.scan_failed", resultCategory: category });
    },
    async resetDocumentScanForRetry(input: DocumentScanInput) {
      const requestedAt = (input.now ?? new Date()).toISOString();
      return transitionDocumentScan(supabase, input, { target: "pending", occurredAt: requestedAt, provider: null, failureCategory: null, auditAction: "document.scan_pending", resultCategory: "retry" });
    },
    async activateCleanDocument(input: DocumentStorageInput) {
      return transitionDocumentStorage(supabase, input, "active");
    },
    async markDocumentStorageRemoved(input: DocumentStorageInput) {
      return transitionDocumentStorage(supabase, input, "removed");
    },
    async softDeletePlaceholder(organizationId: string, documentId: string) {
      const { data, error } = await supabase.from("appointment_document_files").update({ deleted_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", documentId).is("deleted_at", null).select(documentSelect).maybeSingle();
      if (error) throw error;
      return data ? mapDocument(data as DocumentRow) : null;
    }
  };
}
