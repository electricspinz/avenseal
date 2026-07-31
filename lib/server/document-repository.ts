import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appointmentDocumentStorageKey, type AppointmentDocumentContentType, validateAppointmentDocumentUploadMetadata } from "@/lib/server/document-storage";
import { assertDocumentReviewTransition, type AppointmentDocumentStatus, type DocumentReviewer, validateDocumentReviewer, validateReviewNotes } from "@/lib/server/document-review";

export type { AppointmentDocumentStatus, DocumentReviewer } from "@/lib/server/document-review";

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
  createdAt: string;
  updatedAt: string;
}>;

export type CustomerDocumentStatus = Readonly<{ id: string; originalFilename: string; uploadedAt: string; status: "uploaded" | "approved" | "needs_replacement"; replacementReason: string | null }>;

type DocumentRow = {
  id: string; organization_id: string; appointment_request_id: string; original_filename: string; storage_key: string;
  content_type: AppointmentDocumentContentType; size_bytes: number; status: AppointmentDocumentStatus; uploaded_by_type: AppointmentDocumentFile["uploadedByType"];
  reviewed_by: string | null; reviewer: { full_name: string | null; email: string | null } | null; reviewed_at: string | null; review_notes: string | null;
  uploaded_at: string; deleted_at: string | null; metadata: AppointmentDocumentFile["metadata"] | null; created_at: string; updated_at: string;
};

function mapDocument(row: DocumentRow): AppointmentDocumentFile {
  return { id: row.id, organizationId: row.organization_id, appointmentId: row.appointment_request_id, originalFilename: row.original_filename, storageKey: row.storage_key, contentType: row.content_type, sizeBytes: Number(row.size_bytes), status: row.status, reviewedBy: row.reviewed_by, reviewerName: row.reviewer?.full_name ?? row.reviewer?.email ?? null, reviewedAt: row.reviewed_at, reviewNotes: row.review_notes, uploadedByType: row.uploaded_by_type, uploadedAt: row.uploaded_at, deletedAt: row.deleted_at, metadata: row.metadata ?? {}, createdAt: row.created_at, updatedAt: row.updated_at };
}

const documentSelect = "*, reviewer:user_profiles(full_name,email)";

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
        storage_key: storageKey, content_type: metadata.contentType, size_bytes: metadata.sizeBytes, status: "uploaded", uploaded_by_type: input.uploadedByType, metadata: {}
      }).select(documentSelect).single();
      if (error) throw error;
      const document = mapDocument(data as DocumentRow);
      const { error: auditError } = await supabase.from("audit_logs").insert(documentUploadedAudit(document));
      if (auditError) throw auditError;
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
    async validateDocumentOwnership(organizationId: string, appointmentId: string, documentId: string) {
      const { data, error } = await supabase.from("appointment_document_files").select(documentSelect).eq("organization_id", organizationId).eq("appointment_request_id", appointmentId).eq("id", documentId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapDocument(data as DocumentRow) : null;
    },
    async getDocumentForDownload(organizationId: string, appointmentId: string, documentId: string) {
      return this.validateDocumentOwnership(organizationId, appointmentId, documentId);
    },
    async recordDocumentDownload(document: AppointmentDocumentFile, actorType: "owner" | "admin") {
      const { error } = await supabase.from("audit_logs").insert(documentDownloadedAudit(document, actorType));
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
      const removed = await this.softDeletePlaceholder(input.organizationId, previous.id);
      if (!removed) throw new Error("Document replacement is unavailable.");
      let replacement: AppointmentDocumentFile;
      try {
        replacement = await this.persistUploadedMetadata({ organizationId: input.organizationId, appointmentId: input.appointmentId, uploadedByType: input.uploadedByType, metadata: input.metadata, documentId: input.documentId });
      } catch (error) {
        await supabase.from("appointment_document_files").update({ deleted_at: null }).eq("organization_id", input.organizationId).eq("appointment_request_id", input.appointmentId).eq("id", previous.id).select(documentSelect).maybeSingle();
        throw error;
      }
      const { error } = await supabase.from("audit_logs").insert(documentReplacedAudit({ organizationId: input.organizationId, appointmentId: input.appointmentId, previousDocumentId: previous.id, replacementDocumentId: replacement.id }));
      if (error) throw error;
      return replacement;
    },
    async approveDocument(input: { organizationId: string; appointmentId: string; documentId: string; reviewer: DocumentReviewer; reviewNotes?: string | null; now?: Date }) {
      return reviewDocument(supabase, input, "approved");
    },
    async rejectDocument(input: { organizationId: string; appointmentId: string; documentId: string; reviewer: DocumentReviewer; reviewNotes?: string | null; now?: Date }) {
      return reviewDocument(supabase, input, "rejected");
    },
    async softDeletePlaceholder(organizationId: string, documentId: string) {
      const { data, error } = await supabase.from("appointment_document_files").update({ deleted_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", documentId).is("deleted_at", null).select(documentSelect).maybeSingle();
      if (error) throw error;
      return data ? mapDocument(data as DocumentRow) : null;
    }
  };
}
