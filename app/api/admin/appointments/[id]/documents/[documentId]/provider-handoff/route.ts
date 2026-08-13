import { NextResponse } from "next/server";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import { createSupabaseAppointmentDocumentStorage } from "@/lib/server/document-storage";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const [{ id: appointmentId, documentId }, context] = await Promise.all([params, requireAdminOrganizationContext()]);
    const supabase = getSupabaseAdmin();
    const documents = createAppointmentDocumentRepository(supabase);
    const document = await documents.getDocumentForProviderHandoff(context.organizationId, appointmentId, documentId);
    if (!document) return unavailable(404);

    const body = await createSupabaseAppointmentDocumentStorage(supabase).download(document.storageKey);
    await documents.recordDocumentProviderHandoffDownload(document, context.role);
    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Type": document.contentType,
        "Content-Disposition": `attachment; filename="${providerHandoffFilename(document.originalFilename)}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return unavailable(403);
  }
}

function unavailable(status: number) {
  return NextResponse.json({ error: "Provider handoff download is unavailable." }, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }
  });
}

function providerHandoffFilename(filename: string) {
  const normalized = filename.normalize("NFKC").replace(/[\/\\\u0000-\u001f\u007f"]/g, "_").trim();
  return normalized || "document";
}
