import { NextResponse } from "next/server";
import { uploadCustomerAppointmentDocument } from "@/lib/server/document-upload";
import { repository } from "@/lib/server/repository";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const appointment = await repository.getCustomerAppointmentByAccessToken(token);
    if (!appointment) return unavailable(404);
    const formData = await request.formData();
    const files = formData.getAll("file");
    if (files.length !== 1 || !isUploadFile(files[0])) return unavailable(400);
    const replacementDocumentId = formData.get("replacementDocumentId");
    if (replacementDocumentId !== null && typeof replacementDocumentId !== "string") return unavailable(400);
    const document = await uploadCustomerAppointmentDocument({ organizationId: appointment.organizationId, appointmentId: appointment.appointmentId, file: files[0], replacementDocumentId: replacementDocumentId || undefined });
    return NextResponse.json({ status: "uploaded", document: { id: document.id, originalFilename: document.originalFilename, uploadedAt: document.uploadedAt, status: document.status, replacementReason: null } }, { headers: noStore });
  } catch {
    return unavailable(400);
  }
}

function unavailable(status: number) {
  return NextResponse.json({ status: "unavailable" }, { status, headers: noStore });
}

function isUploadFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && typeof value.name === "string" && typeof value.type === "string" && typeof value.size === "number";
}
