import { createAppointmentDocumentRepository, type CustomerDocumentStatus } from "@/lib/server/document-repository";
import { createSupabaseAppointmentDocumentStorage, privateAppointmentDocumentStorage, validateAppointmentDocumentUploadMetadata, type AppointmentDocumentObjectStorage } from "@/lib/server/document-storage";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerUploadedDocument = Readonly<Pick<CustomerDocumentStatus, "id" | "originalFilename" | "uploadedAt" | "status">>;

function safeDocument(document: CustomerDocumentStatus): CustomerUploadedDocument {
  return { id: document.id, originalFilename: document.originalFilename, uploadedAt: document.uploadedAt, status: document.status };
}

/** Coordinates private object storage and metadata persistence; callers never handle bucket names or keys. */
export async function uploadCustomerAppointmentDocument(input: { organizationId: string; appointmentId: string; file: File; replacementDocumentId?: string; storage?: AppointmentDocumentObjectStorage; supabase?: SupabaseClient }) {
  if (!input.supabase && !hasSupabaseServiceConfig()) throw new Error("Document upload is unavailable.");
  const metadata = validateAppointmentDocumentUploadMetadata({ originalFilename: input.file.name, contentType: input.file.type, sizeBytes: input.file.size });
  const supabase = input.supabase ?? getSupabaseAdmin();
  const repository = createAppointmentDocumentRepository(supabase);
  const documentId = crypto.randomUUID();
  const storage = input.storage ?? createSupabaseAppointmentDocumentStorage(supabase);
  const key = privateAppointmentDocumentStorage.keyFor({ organizationId: input.organizationId, appointmentId: input.appointmentId, documentId });
  await storage.upload({ key, body: await input.file.arrayBuffer(), contentType: metadata.contentType });
  try {
    const document = input.replacementDocumentId
      ? await repository.replaceDocument({ organizationId: input.organizationId, appointmentId: input.appointmentId, rejectedDocumentId: input.replacementDocumentId, uploadedByType: "customer", documentId, metadata })
      : await repository.persistUploadedMetadata({ organizationId: input.organizationId, appointmentId: input.appointmentId, uploadedByType: "customer", documentId, metadata });
    return safeDocument({ id: document.id, originalFilename: document.originalFilename, uploadedAt: document.uploadedAt, status: "uploaded", replacementReason: null });
  } catch {
    try { await storage.remove(key); } catch { /* The original safe failure remains the response contract. */ }
    throw new Error("Document upload could not be completed.");
  }
}
