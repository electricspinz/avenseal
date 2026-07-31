import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAppointmentDocumentRepository, documentDownloadedAudit, documentReviewedAudit, documentUploadedAudit } from "@/lib/server/document-repository";

function repositoryClient(appointmentOrganizationId = "org-1", options: { status?: "uploaded" | "approved" | "rejected"; deletedAt?: string | null; documentExists?: boolean; reviewerRole?: "owner" | "admin" | "staff" | null } = {}) {
  const inserts: Array<{ table: string; value: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; value: Record<string, unknown> }> = [];
  let row = { id: "document-1", organization_id: "org-1", appointment_request_id: "appointment-1", original_filename: "document.pdf", storage_key: "organizations/org-1/appointments/appointment-1/documents/document-1", content_type: "application/pdf", size_bytes: 400, status: options.status ?? "uploaded", reviewed_by: null as string | null, reviewed_at: null as string | null, review_notes: null as string | null, uploaded_by_type: "customer", uploaded_at: "2026-08-01T10:00:00.000Z", deleted_at: options.deletedAt ?? null, metadata: {}, created_at: "2026-08-01T10:00:00.000Z", updated_at: "2026-08-01T10:00:00.000Z" };
  const client = {
    from(table: string) {
      let operation = "select";
      let value: Record<string, unknown> | undefined;
      const filters: Array<[string, unknown]> = [];
      let requiresActiveDocument = false;
      const result = () => {
        if (table === "appointment_requests") return { data: { id: "appointment-1", organization_id: appointmentOrganizationId }, error: null };
        if (table === "organization_users") return { data: options.reviewerRole === null ? null : { user_id: "00000000-0000-4000-8000-000000000001", organization_id: "org-1", role: options.reviewerRole ?? "admin", status: "active" }, error: null };
        if (table === "appointment_document_files" && filters.some(([column, filter]) => (column === "organization_id" && filter !== row.organization_id) || (column === "appointment_request_id" && filter !== row.appointment_request_id) || (column === "id" && filter !== row.id)) ) return { data: null, error: null };
        if (table === "appointment_document_files" && filters.some(([column, filter]) => column === "status" && filter !== row.status)) return { data: null, error: null };
        if (table === "appointment_document_files" && options.documentExists === false) return { data: null, error: null };
        if (table === "appointment_document_files" && requiresActiveDocument && row.deleted_at !== null) return { data: null, error: null };
        if (table === "appointment_document_files" && operation === "insert") { row = { ...row, ...value } as typeof row; return { data: row, error: null }; }
        if (table === "appointment_document_files" && operation === "update") { row = { ...row, ...value } as typeof row; return { data: row, error: null }; }
        if (table === "appointment_document_files") return { data: row, error: null };
        return { data: null, error: null };
      };
      let ordered = false;
      const chain = {
        select() { return chain; },
        insert(input: Record<string, unknown>) { operation = "insert"; value = input; inserts.push({ table, value: input }); return chain; },
        update(input: Record<string, unknown>) { operation = "update"; value = input; updates.push({ table, value: input }); return chain; },
        eq(column: string, filter: unknown) { filters.push([column, filter]); return chain; }, in() { return chain; }, is(column: string, filter: unknown) { if (column === "deleted_at" && filter === null) requiresActiveDocument = true; return chain; }, order() { ordered = true; return chain; },
        maybeSingle: async () => result(), single: async () => result(),
        then<TResult1 = { data: unknown; error: null }, TResult2 = never>(onfulfilled?: ((response: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { const selected = result(); const response = table === "appointment_document_files" && operation === "select" && ordered ? { data: selected.data ? [selected.data] : [], error: null } : selected; return Promise.resolve(response).then(onfulfilled, onrejected); }
      };
      return chain;
    }
  } as unknown as SupabaseClient;
  return { client, inserts, updates };
}

describe("appointment document repository", () => {
  it("persists one validated metadata record, generated key, and safe upload audit", async () => {
    const state = repositoryClient();
    const document = await createAppointmentDocumentRepository(state.client).persistUploadedMetadata({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", uploadedByType: "customer", metadata: { originalFilename: "document.pdf", contentType: "application/pdf", sizeBytes: 400 } });
    expect(document).toMatchObject({ id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", storageKey: "organizations/org-1/appointments/appointment-1/documents/document-1", status: "uploaded" });
    expect(state.inserts).toEqual(expect.arrayContaining([expect.objectContaining({ table: "appointment_document_files", value: expect.objectContaining({ organization_id: "org-1", appointment_request_id: "appointment-1", storage_key: document.storageKey, original_filename: "document.pdf" }) }), expect.objectContaining({ table: "audit_logs", value: expect.objectContaining({ action: "document.uploaded", metadata: expect.objectContaining({ documentId: "document-1", contentType: "application/pdf", sizeBytes: 400 }) }) })]));
    const audit = state.inserts.find((entry) => entry.table === "audit_logs")!.value;
    expect(JSON.stringify(audit)).not.toContain("document.pdf");
    expect(JSON.stringify(audit)).not.toContain("organizations/org-1");
  });

  it("refuses to persist metadata when the appointment is outside the organization", async () => {
    const state = repositoryClient("org-2");
    await expect(createAppointmentDocumentRepository(state.client).persistUploadedMetadata({ organizationId: "org-1", appointmentId: "appointment-1", uploadedByType: "customer", metadata: { originalFilename: "document.pdf", contentType: "application/pdf", sizeBytes: 400 } })).rejects.toThrow("Appointment does not belong to this organization.");
    expect(state.inserts).toEqual([]);
  });

  it("keeps soft deletion tenant-scoped as a repository placeholder", async () => {
    const state = repositoryClient();
    const document = await createAppointmentDocumentRepository(state.client).softDeletePlaceholder("org-1", "document-1");
    expect(document?.deletedAt).toEqual(expect.any(String));
    expect(state.updates).toEqual([expect.objectContaining({ table: "appointment_document_files", value: expect.objectContaining({ deleted_at: expect.any(String) }) })]);
  });

  it("lists active appointment documents and resolves a download only through matching ownership", async () => {
    const state = repositoryClient();
    const documents = await createAppointmentDocumentRepository(state.client).listAppointmentDocuments("org-1", "appointment-1");
    expect(documents).toHaveLength(1);
    await expect(createAppointmentDocumentRepository(state.client).getDocumentForDownload("org-1", "appointment-1", "document-1")).resolves.toMatchObject({ id: "document-1", appointmentId: "appointment-1", deletedAt: null });
  });

  it("creates audit metadata without filenames, object keys, URLs, tokens, or contents", () => {
    const audit = documentUploadedAudit({ id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", contentType: "application/pdf", sizeBytes: 400, uploadedByType: "customer" });
    expect(audit).toEqual({ organization_id: "org-1", action: "document.uploaded", entity_type: "appointment_request", entity_id: "appointment-1", metadata: { documentId: "document-1", contentType: "application/pdf", sizeBytes: 400, uploadedByType: "customer" } });
  });

  it("creates a safe download audit with only scoped identifiers, actor type, and timestamp", () => {
    const audit = documentDownloadedAudit({ id: "document-1", organizationId: "org-1", appointmentId: "appointment-1" }, "admin", "2026-08-01T10:00:00.000Z");
    expect(audit).toEqual({ organization_id: "org-1", action: "document.downloaded", entity_type: "appointment_request", entity_id: "appointment-1", metadata: { documentId: "document-1", appointmentId: "appointment-1", organizationId: "org-1", actorType: "admin", occurredAt: "2026-08-01T10:00:00.000Z" } });
    expect(JSON.stringify(audit)).not.toContain("storage_key");
    expect(JSON.stringify(audit)).not.toContain("document.pdf");
  });

  it("approves an uploaded document, persists review metadata, and records safe audit data", async () => {
    const state = repositoryClient();
    const document = await createAppointmentDocumentRepository(state.client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer: { id: "00000000-0000-4000-8000-000000000001", role: "admin" }, reviewNotes: "  Complete and readable.  ", now: new Date("2026-08-02T10:00:00.000Z") });
    expect(document).toMatchObject({ id: "document-1", status: "approved", reviewedBy: "00000000-0000-4000-8000-000000000001", reviewedAt: "2026-08-02T10:00:00.000Z", reviewNotes: "Complete and readable." });
    expect(state.updates).toEqual([expect.objectContaining({ table: "appointment_document_files", value: expect.objectContaining({ status: "approved", reviewed_by: "00000000-0000-4000-8000-000000000001", reviewed_at: "2026-08-02T10:00:00.000Z", review_notes: "Complete and readable." }) })]);
    const audit = state.inserts.find((entry) => entry.table === "audit_logs")!.value;
    expect(audit).toMatchObject({ action: "document.approved", metadata: expect.objectContaining({ documentId: "document-1", reviewerRole: "admin" }) });
    expect(JSON.stringify(audit)).not.toContain("Complete and readable.");
    expect(JSON.stringify(audit)).not.toContain("organizations/org-1");
    await expect(createAppointmentDocumentRepository(state.client).getDocumentReview("org-1", "appointment-1", "document-1")).resolves.toEqual({ status: "approved", reviewedBy: "00000000-0000-4000-8000-000000000001", reviewedAt: "2026-08-02T10:00:00.000Z", reviewNotes: "Complete and readable." });
    await expect(createAppointmentDocumentRepository(state.client).listPendingDocuments("org-1")).resolves.toEqual([]);
  });

  it("supports each permitted review transition and rejects a duplicate transition", async () => {
    const reviewer = { id: "00000000-0000-4000-8000-000000000001", role: "owner" } as const;
    await expect(createAppointmentDocumentRepository(repositoryClient().client).rejectDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer })).resolves.toMatchObject({ status: "rejected" });
    await expect(createAppointmentDocumentRepository(repositoryClient("org-1", { status: "rejected" }).client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer })).resolves.toMatchObject({ status: "approved" });
    await expect(createAppointmentDocumentRepository(repositoryClient("org-1", { status: "approved" }).client).rejectDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer })).resolves.toMatchObject({ status: "rejected" });
    await expect(createAppointmentDocumentRepository(repositoryClient("org-1", { status: "approved" }).client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer })).rejects.toThrow("already approved");
  });

  it("does not review missing, deleted, or cross-tenant documents", async () => {
    const reviewer = { id: "00000000-0000-4000-8000-000000000001", role: "admin" } as const;
    for (const { state, organizationId, error } of [
      { state: repositoryClient("org-1", { documentExists: false }), organizationId: "org-1", error: "Document is unavailable for review." },
      { state: repositoryClient("org-1", { deletedAt: "2026-08-01T10:00:00.000Z" }), organizationId: "org-1", error: "Document is unavailable for review." },
      { state: repositoryClient(), organizationId: "org-2", error: "Document review requires active owner or admin access." }
    ]) {
      await expect(createAppointmentDocumentRepository(state.client).approveDocument({ organizationId, appointmentId: "appointment-1", documentId: "document-1", reviewer })).rejects.toThrow(error);
      expect(state.updates).toEqual([]);
    }
  });

  it("lists pending documents and keeps review notes plain text and bounded", async () => {
    const state = repositoryClient();
    await expect(createAppointmentDocumentRepository(state.client).listPendingDocuments("org-1")).resolves.toHaveLength(1);
    const reviewer = { id: "00000000-0000-4000-8000-000000000001", role: "admin" } as const;
    await expect(createAppointmentDocumentRepository(state.client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer, reviewNotes: "<b>unsafe</b>" })).rejects.toThrow("plain text");
    await expect(createAppointmentDocumentRepository(state.client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer, reviewNotes: "a".repeat(2_001) })).rejects.toThrow("2,000");
    await expect(createAppointmentDocumentRepository(state.client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer: { id: reviewer.id, role: "staff" } as never })).rejects.toThrow();
    await expect(createAppointmentDocumentRepository(repositoryClient("org-1", { reviewerRole: "staff" }).client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer })).rejects.toThrow("active owner or admin");
    await expect(createAppointmentDocumentRepository(repositoryClient("org-1", { reviewerRole: null }).client).approveDocument({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer })).rejects.toThrow("active owner or admin");
  });

  it("creates a safe rejected review audit without notes or document internals", () => {
    const audit = documentReviewedAudit({ id: "document-1", organizationId: "org-1", appointmentId: "appointment-1" }, { id: "00000000-0000-4000-8000-000000000001", role: "owner" }, "document.rejected", "2026-08-02T10:00:00.000Z");
    expect(audit).toMatchObject({ action: "document.rejected", metadata: { documentId: "document-1", appointmentId: "appointment-1", organizationId: "org-1", reviewerId: "00000000-0000-4000-8000-000000000001", reviewerRole: "owner", occurredAt: "2026-08-02T10:00:00.000Z" } });
    expect(JSON.stringify(audit)).not.toContain("review_notes");
    expect(JSON.stringify(audit)).not.toContain("storage_key");
  });
});
