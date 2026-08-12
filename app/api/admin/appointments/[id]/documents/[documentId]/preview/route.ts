import { NextResponse } from "next/server";
import { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import { adminDocumentPreviewExpiresInSeconds, createSupabaseAppointmentDocumentPreviewStorage } from "@/lib/server/document-storage";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const previewContentTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const [{ id: appointmentId, documentId }, context] = await Promise.all([params, requireAdminOrganizationContext()]);
    const supabase = getSupabaseAdmin();
    const documents = createAppointmentDocumentRepository(supabase);
    const document = await documents.getDocumentForPreview(context.organizationId, appointmentId, documentId);
    if (!document || !previewContentTypes.has(document.contentType)) return unavailable(404);

    const previewUrl = await createSupabaseAppointmentDocumentPreviewStorage(supabase).createSignedUrl(document.storageKey, adminDocumentPreviewExpiresInSeconds);
    await documents.recordDocumentPreview(document, context.role);
    return NextResponse.json({ previewUrl, contentType: document.contentType, expiresAt: new Date(Date.now() + adminDocumentPreviewExpiresInSeconds * 1_000).toISOString() }, {
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }
    });
  } catch {
    return unavailable(403);
  }
}

function unavailable(status: number) {
  return NextResponse.json({ error: "Preview unavailable." }, { status, headers: { "Cache-Control": "no-store" } });
}
