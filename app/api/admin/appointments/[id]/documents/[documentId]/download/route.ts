import { NextResponse } from "next/server";
import { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import { createSupabaseAppointmentDocumentStorage } from "@/lib/server/document-storage";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const [{ id: appointmentId, documentId }, context] = await Promise.all([params, requireAdminOrganizationContext()]);
    const supabase = getSupabaseAdmin();
    const documents = createAppointmentDocumentRepository(supabase);
    const document = await documents.getDocumentForDownload(context.organizationId, appointmentId, documentId);
    if (!document) return unavailable(404);
    const body = await createSupabaseAppointmentDocumentStorage(supabase).download(document.storageKey);
    await documents.recordDocumentDownload(document, context.role);
    return new NextResponse(body, { headers: { "Cache-Control": "no-store", "Content-Type": document.contentType, "Content-Disposition": `attachment; filename="${downloadFilename(document.originalFilename)}"`, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return unavailable(403);
  }
}

function unavailable(status: number) {
  return NextResponse.json({ error: "Document download is unavailable." }, { status, headers: { "Cache-Control": "no-store" } });
}

function downloadFilename(filename: string) {
  return filename.replaceAll(/["\\\r\n]/g, "_");
}
