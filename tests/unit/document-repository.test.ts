import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAppointmentDocumentRepository, documentDownloadedAudit, documentReviewedAudit, documentUploadedAudit } from "@/lib/server/document-repository";

function repositoryClient(appointmentOrganizationId = "org-1", options: { status?: "uploaded" | "approved" | "rejected"; scanStatus?: "pending" | "clean" | "infected" | "suspicious" | "failed"; storageStatus?: "quarantined" | "active" | "removed"; storageConflictTo?: "quarantined" | "active" | "removed"; scanAttemptCount?: number; deletedAt?: string | null; documentExists?: boolean; reviewerRole?: "owner" | "admin" | "staff" | null } = {}) {
  const inserts: Array<{ table: string; value: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; value: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const selects: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  let row = { id: "document-1", organization_id: "org-1", appointment_request_id: "appointment-1", original_filename: "document.pdf", storage_key: "quarantine/organizations/org-1/appointments/appointment-1/document-1", content_type: "application/pdf", size_bytes: 400, status: options.status ?? "uploaded", reviewed_by: null as string | null, reviewed_at: null as string | null, review_notes: null as string | null, uploaded_by_type: "customer", uploaded_at: "2026-08-01T10:00:00.000Z", deleted_at: options.deletedAt ?? null, metadata: {}, scan_status: options.scanStatus ?? "pending", storage_status: options.storageStatus ?? "quarantined", scan_provider: null as string | null, scan_requested_at: null as string | null, scanned_at: null as string | null, scan_failure_category: null as string | null, scan_attempt_count: options.scanAttemptCount ?? 0, created_at: "2026-08-01T10:00:00.000Z", updated_at: "2026-08-01T10:00:00.000Z" };
  let storageConflictTo = options.storageConflictTo;
  const client = {
    from(table: string) {
      let operation = "select";
      let value: Record<string, unknown> | undefined;
      const filters: Array<[string, unknown]> = [];
      let requiresActiveDocument = false;
      const result = () => {
        if (table === "appointment_requests") return { data: { id: "appointment-1", organization_id: appointmentOrganizationId }, error: null };
        if (table === "organization_users") return { data: options.reviewerRole === null ? null : { user_id: "00000000-0000-4000-8000-000000000001", organization_id: "org-1", role: options.reviewerRole ?? "admin", status: "active" }, error: null };
        if (table === "appointment_document_files" && operation === "update" && storageConflictTo) { row = { ...row, storage_status: storageConflictTo }; storageConflictTo = undefined; }
        if (table === "appointment_document_files" && filters.some(([column, filter]) => (column === "organization_id" && filter !== row.organization_id) || (column === "appointment_request_id" && filter !== row.appointment_request_id) || (column === "id" && filter !== row.id)) ) return { data: null, error: null };
        if (table === "appointment_document_files" && filters.some(([column, filter]) => column === "status" && filter !== row.status)) return { data: null, error: null };
        if (table === "appointment_document_files" && filters.some(([column, filter]) => column === "scan_status" && filter !== row.scan_status)) return { data: null, error: null };
        if (table === "appointment_document_files" && filters.some(([column, filter]) => column === "storage_status" && filter !== row.storage_status)) return { data: null, error: null };
        if (table === "appointment_document_files" && options.documentExists === false) return { data: null, error: null };
        if (table === "appointment_document_files" && requiresActiveDocument && row.deleted_at !== null) return { data: null, error: null };
        if (table === "appointment_document_files" && operation === "insert") { row = { ...row, ...value } as typeof row; return { data: row, error: null }; }
        if (table === "appointment_document_files" && operation === "update") { row = { ...row, ...value } as typeof row; return { data: row, error: null }; }
        if (table === "appointment_document_files") return { data: row, error: null };
        return { data: null, error: null };
      };
      let ordered = false;
      const chain = {
        select() { selects.push({ table, filters }); return chain; },
        insert(input: Record<string, unknown>) { operation = "insert"; value = input; inserts.push({ table, value: input }); return chain; },
        update(input: Record<string, unknown>) { operation = "update"; value = input; updates.push({ table, value: input, filters }); return chain; },
        eq(column: string, filter: unknown) { filters.push([column, filter]); return chain; }, in() { return chain; }, is(column: string, filter: unknown) { if (column === "deleted_at" && filter === null) requiresActiveDocument = true; return chain; }, order() { ordered = true; return chain; },
        maybeSingle: async () => result(), single: async () => result(),
        then<TResult1 = { data: unknown; error: null }, TResult2 = never>(onfulfilled?: ((response: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { const selected = result(); const response = table === "appointment_document_files" && operation === "select" && ordered ? { data: selected.data ? [selected.data] : [], error: null } : selected; return Promise.resolve(response).then(onfulfilled, onrejected); }
      };
      return chain;
    }
  } as unknown as SupabaseClient;
  return { client, inserts, updates, selects };
}

describe("appointment document repository", () => {
  it("persists one validated metadata record with conservative scan and storage defaults", async () => {
    const state = repositoryClient();
    const document = await createAppointmentDocumentRepository(state.client).persistUploadedMetadata({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", uploadedByType: "customer", metadata: { originalFilename: "document.pdf", contentType: "application/pdf", sizeBytes: 400 } });
    expect(document).toMatchObject({ id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", storageKey: "quarantine/organizations/org-1/appointments/appointment-1/document-1", status: "uploaded", scanStatus: "pending", storageStatus: "quarantined", scanAttemptCount: 0 });
    expect(state.inserts).toEqual(expect.arrayContaining([expect.objectContaining({ table: "appointment_document_files", value: expect.objectContaining({ organization_id: "org-1", appointment_request_id: "appointment-1", storage_key: document.storageKey, original_filename: "document.pdf", status: "uploaded", scan_status: "pending", storage_status: "quarantined", scan_attempt_count: 0 }) }), expect.objectContaining({ table: "audit_logs", value: expect.objectContaining({ action: "document.uploaded", metadata: expect.objectContaining({ documentId: "document-1", contentType: "application/pdf", sizeBytes: 400 }) }) })]));
    const metadataInsert = state.inserts.find((entry) => entry.table === "appointment_document_files")!.value;
    for (const field of ["scan_provider", "scan_requested_at", "scanned_at", "scan_failure_category"]) expect(metadataInsert).not.toHaveProperty(field);
    expect(metadataInsert).not.toMatchObject({ scan_status: "clean", storage_status: "active" });
    for (const field of ["scanner_report", "token", "url", "content", "file_contents", "credential"]) expect(metadataInsert).not.toHaveProperty(field);
    expect(document).toMatchObject({ scanProvider: null, scanRequestedAt: null, scannedAt: null, scanFailureCategory: null });
    await expect(createAppointmentDocumentRepository(state.client).getCustomerDocumentStatus("org-1", "appointment-1")).resolves.toEqual([{ id: "document-1", originalFilename: "document.pdf", uploadedAt: "2026-08-01T10:00:00.000Z", status: "uploaded", replacementReason: null }]);
    const audit = state.inserts.find((entry) => entry.table === "audit_logs")!.value;
    expect(JSON.stringify(audit)).not.toContain("document.pdf");
    expect(JSON.stringify(audit)).not.toContain("organizations/org-1");
  });

  it("uses the same conservative defaults for replacement document metadata", async () => {
    const state = repositoryClient("org-1", { status: "rejected" });
    const replacement = await createAppointmentDocumentRepository(state.client).replaceDocument({ organizationId: "org-1", appointmentId: "appointment-1", rejectedDocumentId: "document-1", documentId: "document-2", uploadedByType: "customer", metadata: { originalFilename: "replacement.pdf", contentType: "application/pdf", sizeBytes: 400 } });
    const metadataInsert = state.inserts.find((entry) => entry.table === "appointment_document_files")!.value;

    expect(metadataInsert).toMatchObject({ id: "document-2", status: "uploaded", scan_status: "pending", storage_status: "quarantined", scan_attempt_count: 0 });
    expect(replacement).toMatchObject({ id: "document-2", status: "uploaded", scanStatus: "pending", storageStatus: "quarantined", scanAttemptCount: 0 });
    expect(state.updates).toEqual([]);
    expect(state.inserts.filter((entry) => entry.table === "audit_logs").map((entry) => entry.value.action)).toEqual(["document.uploaded", "document.scan_pending"]);
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

  it("lists active appointment documents and resolves a download only through clean active ownership", async () => {
    const state = repositoryClient("org-1", { scanStatus: "clean", storageStatus: "active" });
    const documents = await createAppointmentDocumentRepository(state.client).listAppointmentDocuments("org-1", "appointment-1");
    expect(documents).toHaveLength(1);
    await expect(createAppointmentDocumentRepository(state.client).getDocumentForDownload("org-1", "appointment-1", "document-1")).resolves.toMatchObject({ id: "document-1", appointmentId: "appointment-1", deletedAt: null, scanStatus: "clean", storageStatus: "active", scanProvider: null, scanFailureCategory: null });
    expect(state.selects).toEqual(expect.arrayContaining([expect.objectContaining({ table: "appointment_document_files", filters: expect.arrayContaining([["organization_id", "org-1"], ["appointment_request_id", "appointment-1"], ["id", "document-1"], ["scan_status", "clean"], ["storage_status", "active"]]) })]));
  });

  it("fails closed for every non-downloadable scan, storage, or ownership state", async () => {
    for (const options of [
      { scanStatus: "pending" as const },
      { scanStatus: "infected" as const },
      { scanStatus: "suspicious" as const },
      { scanStatus: "failed" as const },
      { scanStatus: "clean" as const, storageStatus: "quarantined" as const },
      { scanStatus: "clean" as const, storageStatus: "removed" as const },
      { scanStatus: "clean" as const, storageStatus: "active" as const, deletedAt: "2026-08-03T12:00:00.000Z" },
      { scanStatus: "unknown" as never, storageStatus: "active" as const },
      { scanStatus: "clean" as const, storageStatus: "unknown" as never }
    ]) {
      await expect(createAppointmentDocumentRepository(repositoryClient("org-1", options).client).getDocumentForDownload("org-1", "appointment-1", "document-1")).resolves.toBeNull();
    }
    for (const [state, organizationId, appointmentId, documentId] of [
      [repositoryClient("org-1", { scanStatus: "clean", storageStatus: "active" }), "org-2", "appointment-1", "document-1"],
      [repositoryClient("org-1", { scanStatus: "clean", storageStatus: "active" }), "org-1", "appointment-2", "document-1"],
      [repositoryClient("org-1", { scanStatus: "clean", storageStatus: "active", documentExists: false }), "org-1", "appointment-1", "document-1"]
    ] as const) {
      await expect(createAppointmentDocumentRepository(state.client).getDocumentForDownload(organizationId, appointmentId, documentId)).resolves.toBeNull();
    }
  });

  it("persists each supported scan transition without changing storage state", async () => {
    const now = new Date("2026-08-03T10:00:00.000Z");
    const input = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const, now };
    const clean = repositoryClient();
    await expect(createAppointmentDocumentRepository(clean.client).markDocumentScanClean({ ...input, provider: "Scanner One" })).resolves.toMatchObject({ scanStatus: "clean", storageStatus: "quarantined", scanProvider: "Scanner One", scannedAt: now.toISOString(), scanFailureCategory: null, scanAttemptCount: 1 });
    expect(clean.updates[0]?.value).toMatchObject({ scan_status: "clean", scan_attempt_count: 1 });

    const infected = repositoryClient();
    await expect(createAppointmentDocumentRepository(infected.client).markDocumentScanBlocked({ ...input, result: "infected", provider: "Scanner One", category: "policy_blocked" })).resolves.toMatchObject({ scanStatus: "infected", storageStatus: "quarantined", scanFailureCategory: "policy_blocked", scanAttemptCount: 1 });
    const suspicious = repositoryClient();
    await expect(createAppointmentDocumentRepository(suspicious.client).markDocumentScanBlocked({ ...input, result: "suspicious", provider: "Scanner One", category: "suspicious_content" })).resolves.toMatchObject({ scanStatus: "suspicious", storageStatus: "quarantined", scanFailureCategory: "suspicious_content", scanAttemptCount: 1 });

    const failed = repositoryClient("org-1", { scanAttemptCount: 2 });
    const repository = createAppointmentDocumentRepository(failed.client);
    await expect(repository.markDocumentScanFailed({ ...input, provider: "Scanner One", category: "provider_timeout" })).resolves.toMatchObject({ scanStatus: "failed", storageStatus: "quarantined", scanProvider: "Scanner One", scannedAt: now.toISOString(), scanFailureCategory: "provider_timeout", scanAttemptCount: 3 });
    await expect(repository.resetDocumentScanForRetry(input)).resolves.toMatchObject({ scanStatus: "pending", storageStatus: "quarantined", scanProvider: null, scanRequestedAt: now.toISOString(), scannedAt: null, scanFailureCategory: null, scanAttemptCount: 3 });
    expect(failed.updates).toHaveLength(2);
    expect(failed.updates.every((entry) => !("storage_status" in entry.value))).toBe(true);
    expect(failed.inserts.filter((entry) => entry.table === "audit_logs").map((entry) => entry.value.action)).toEqual(["document.scan_failed", "document.scan_pending"]);
  });

  it("rejects invalid scan transitions and scoped absences without writing audits", async () => {
    const input = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const, provider: "Scanner One" };
    for (const state of [
      repositoryClient("org-1", { scanStatus: "infected" }),
      repositoryClient("org-1", { scanStatus: "suspicious" })
    ]) {
      await expect(createAppointmentDocumentRepository(state.client).markDocumentScanClean(input)).rejects.toThrow("not allowed");
      expect(state.updates).toEqual([]); expect(state.inserts).toEqual([]);
    }
    for (const state of [
      repositoryClient("org-1", { scanStatus: "clean" }),
      repositoryClient("org-1", { scanStatus: "infected" }),
      repositoryClient("org-1", { scanStatus: "suspicious" })
    ]) {
      await expect(createAppointmentDocumentRepository(state.client).resetDocumentScanForRetry({ ...input, provider: undefined } as never)).rejects.toThrow("not allowed");
      expect(state.updates).toEqual([]); expect(state.inserts).toEqual([]);
    }
    const clean = repositoryClient("org-1", { scanStatus: "clean" });
    await expect(createAppointmentDocumentRepository(clean.client).markDocumentScanFailed({ ...input, category: "provider_timeout" })).rejects.toThrow("not allowed");
    expect(clean.inserts).toEqual([]);

    for (const [state, scopedInput] of [
      [repositoryClient("org-1", { deletedAt: "2026-08-03T10:00:00.000Z" }), input],
      [repositoryClient("org-1", { storageStatus: "removed" }), input],
      [repositoryClient("org-1", { documentExists: false }), input],
      [repositoryClient(), { ...input, organizationId: "org-2" }],
      [repositoryClient(), { ...input, appointmentId: "appointment-2" }]
    ] as const) {
      await expect(createAppointmentDocumentRepository(state.client).markDocumentScanClean(scopedInput)).rejects.toThrow("unavailable for scanning");
      expect(state.updates).toEqual([]); expect(state.inserts).toEqual([]);
    }
  });

  it("makes duplicate terminal scan results no-ops and records only durable safe audits", async () => {
    const now = new Date("2026-08-03T10:00:00.000Z");
    const input = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const, now, provider: "Scanner One" };
    for (const result of ["clean", "infected", "suspicious", "failed"] as const) {
      const state = repositoryClient("org-1", { scanStatus: result });
      const repository = createAppointmentDocumentRepository(state.client);
      const call = result === "clean"
        ? () => repository.markDocumentScanClean(input)
        : result === "failed"
          ? () => repository.markDocumentScanFailed({ ...input, category: "provider_timeout" })
          : () => repository.markDocumentScanBlocked({ ...input, result, category: result === "infected" ? "policy_blocked" : "suspicious_content" });
      await expect(call()).resolves.toMatchObject({ scanStatus: result });
      expect(state.updates).toEqual([]); expect(state.inserts).toEqual([]);
    }

    const state = repositoryClient();
    const repository = createAppointmentDocumentRepository(state.client);
    await repository.markDocumentScanClean(input);
    await expect(repository.markDocumentScanBlocked({ ...input, result: "infected" })).rejects.toThrow("not allowed");
    expect(state.inserts.filter((entry) => entry.table === "audit_logs")).toHaveLength(1);
    const audit = state.inserts.find((entry) => entry.table === "audit_logs")!.value;
    expect(audit).toMatchObject({ action: "document.scan_clean", metadata: { documentId: "document-1", actorType: "system", resultCategory: "clean", provider: "Scanner One", attemptCount: 1 } });
    for (const privateValue of ["document.pdf", "organizations/org-1", "scanner_report", "token", "https://", "credential"]) expect(JSON.stringify(audit)).not.toContain(privateValue);
  });

  it("validates trusted system scan inputs before mutating a document", async () => {
    const state = repositoryClient();
    const repository = createAppointmentDocumentRepository(state.client);
    const base = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const };
    await expect(repository.markDocumentScanClean({ ...base, provider: " <b>unsafe</b> " })).rejects.toThrow("plain text");
    await expect(repository.markDocumentScanFailed({ ...base, category: "https://unsafe.example" })).rejects.toThrow("invalid");
    await expect(repository.markDocumentScanClean({ ...base, actorType: "staff" as never, provider: "Scanner One" })).rejects.toThrow("trusted system actor");
    expect(state.updates).toEqual([]); expect(state.inserts).toEqual([]);
  });

  it("activates only clean quarantined document storage with a guarded update and safe audit", async () => {
    const now = new Date("2026-08-03T11:00:00.000Z");
    const input = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const, now };
    const state = repositoryClient("org-1", { scanStatus: "clean" });
    const document = await createAppointmentDocumentRepository(state.client).activateCleanDocument(input);

    expect(document).toMatchObject({ scanStatus: "clean", storageStatus: "active", scanAttemptCount: 0 });
    expect(state.updates).toEqual([expect.objectContaining({ table: "appointment_document_files", value: { storage_status: "active", updated_at: now.toISOString() }, filters: expect.arrayContaining([["organization_id", "org-1"], ["appointment_request_id", "appointment-1"], ["id", "document-1"], ["storage_status", "quarantined"]]) })]);
    const audit = state.inserts.find((entry) => entry.table === "audit_logs")!.value;
    expect(audit).toMatchObject({ action: "document.storage_activated", metadata: { documentId: "document-1", actorType: "system", resultCategory: "active", scanStatus: "clean", attemptCount: 0 } });
    for (const privateValue of ["document.pdf", "organizations/org-1", "scanner_report", "https://", "token", "credential"]) expect(JSON.stringify(audit)).not.toContain(privateValue);
  });

  it("rejects non-clean or unavailable document activation without mutation or audit", async () => {
    const input = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const };
    for (const scanStatus of ["pending", "infected", "suspicious", "failed"] as const) {
      const state = repositoryClient("org-1", { scanStatus });
      await expect(createAppointmentDocumentRepository(state.client).activateCleanDocument(input)).rejects.toThrow("not allowed");
      expect(state.updates).toEqual([]); expect(state.inserts).toEqual([]);
    }
    const removed = repositoryClient("org-1", { scanStatus: "clean", storageStatus: "removed" });
    await expect(createAppointmentDocumentRepository(removed.client).activateCleanDocument(input)).rejects.toThrow("not allowed");
    expect(removed.updates).toEqual([]); expect(removed.inserts).toEqual([]);
    for (const [state, scopedInput] of [
      [repositoryClient("org-1", { scanStatus: "clean", deletedAt: "2026-08-03T11:00:00.000Z" }), input],
      [repositoryClient("org-1", { scanStatus: "clean", documentExists: false }), input],
      [repositoryClient("org-1", { scanStatus: "clean" }), { ...input, organizationId: "org-2" }],
      [repositoryClient("org-1", { scanStatus: "clean" }), { ...input, appointmentId: "appointment-2" }]
    ] as const) {
      await expect(createAppointmentDocumentRepository(state.client).activateCleanDocument(scopedInput)).rejects.toThrow("unavailable for storage transition");
      expect(state.updates).toEqual([]); expect(state.inserts).toEqual([]);
    }
  });

  it("treats duplicate activation and removal as no-ops while allowing both removable states", async () => {
    const input = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const };
    const active = repositoryClient("org-1", { scanStatus: "clean", storageStatus: "active" });
    await expect(createAppointmentDocumentRepository(active.client).activateCleanDocument(input)).resolves.toMatchObject({ storageStatus: "active", scanStatus: "clean" });
    expect(active.updates).toEqual([]); expect(active.inserts).toEqual([]);

    for (const storageStatus of ["quarantined", "active"] as const) {
      const state = repositoryClient("org-1", { scanStatus: storageStatus === "active" ? "clean" : "pending", storageStatus });
      await expect(createAppointmentDocumentRepository(state.client).markDocumentStorageRemoved(input)).resolves.toMatchObject({ storageStatus: "removed", scanStatus: storageStatus === "active" ? "clean" : "pending" });
      expect(state.updates[0]?.value).toMatchObject({ storage_status: "removed" });
      expect(state.inserts.find((entry) => entry.table === "audit_logs")?.value).toMatchObject({ action: "document.storage_removed" });
    }

    const removed = repositoryClient("org-1", { storageStatus: "removed" });
    const repository = createAppointmentDocumentRepository(removed.client);
    await expect(repository.markDocumentStorageRemoved(input)).resolves.toMatchObject({ storageStatus: "removed" });
    await expect(repository.activateCleanDocument(input)).rejects.toThrow("not allowed");
    expect(removed.updates).toEqual([]); expect(removed.inserts).toEqual([]);
  });

  it("handles optimistic storage races without an unguarded write or duplicate audit", async () => {
    const input = { organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", actorType: "system" as const };
    const activationRace = repositoryClient("org-1", { scanStatus: "clean", storageConflictTo: "removed" });
    await expect(createAppointmentDocumentRepository(activationRace.client).activateCleanDocument(input)).rejects.toThrow("not allowed");
    expect(activationRace.updates[0]?.filters).toContainEqual(["storage_status", "quarantined"]);
    expect(activationRace.inserts).toEqual([]);

    const removalRace = repositoryClient("org-1", { scanStatus: "clean", storageStatus: "active", storageConflictTo: "removed" });
    await expect(createAppointmentDocumentRepository(removalRace.client).markDocumentStorageRemoved(input)).resolves.toMatchObject({ storageStatus: "removed" });
    expect(removalRace.updates[0]?.filters).toContainEqual(["storage_status", "active"]);
    expect(removalRace.inserts).toEqual([]);
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
