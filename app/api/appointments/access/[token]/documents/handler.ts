import { NextResponse } from "next/server";
import { consumeDistributedRateLimit, rateLimitedResponse, requestRateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import { uploadCustomerAppointmentDocument } from "@/lib/server/document-upload";
import { repository } from "@/lib/server/repository";

const noStore = { "Cache-Control": "no-store" };
type TokenAppointment = NonNullable<Awaited<ReturnType<typeof repository.getCustomerAppointmentByAccessToken>>>;
type UploadedDocument = Awaited<ReturnType<typeof uploadCustomerAppointmentDocument>>;
export type ClientDocumentUploadHandlerDependencies = Readonly<{ requestIdentity: (request: Request) => string; consumeRateLimit: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>; resolveAppointment: (token: string) => Promise<TokenAppointment | null>; upload: (input: { organizationId: string; appointmentId: string; file: File; replacementDocumentId?: string }) => Promise<UploadedDocument> }>;
const productionDependencies: ClientDocumentUploadHandlerDependencies = { requestIdentity: requestRateLimitIdentity, consumeRateLimit: consumeDistributedRateLimit, resolveAppointment: (token) => repository.getCustomerAppointmentByAccessToken(token), upload: uploadCustomerAppointmentDocument };
export function createClientDocumentUploadHandler(dependencies: ClientDocumentUploadHandlerDependencies = productionDependencies) {
  return async function handleUpload(request: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    let ipRate; try { ipRate = await dependencies.consumeRateLimit("client_document_upload_ip", dependencies.requestIdentity(request)); } catch { return rateLimitedResponse(60); }
    if (!ipRate.allowed) return rateLimitedResponse(ipRate.retryAfterSeconds);
    try {
      const appointment = await dependencies.resolveAppointment(token); if (!appointment) return unavailable(404);
      let scopedRate; try { scopedRate = await dependencies.consumeRateLimit("client_document_upload_scoped", `${appointment.organizationId}:${appointment.appointmentId}`); } catch { return rateLimitedResponse(60); }
      if (!scopedRate.allowed) return rateLimitedResponse(scopedRate.retryAfterSeconds);
      const formData = await request.formData(); const files = formData.getAll("file"); if (files.length !== 1 || !isUploadFile(files[0])) return unavailable(400);
      const replacementDocumentId = formData.get("replacementDocumentId"); if (replacementDocumentId !== null && typeof replacementDocumentId !== "string") return unavailable(400);
      const document = await dependencies.upload({ organizationId: appointment.organizationId, appointmentId: appointment.appointmentId, file: files[0], replacementDocumentId: replacementDocumentId || undefined });
      return NextResponse.json({ status: "uploaded", document: { id: document.id, originalFilename: document.originalFilename, uploadedAt: document.uploadedAt, status: document.status, replacementReason: null } }, { headers: noStore });
    } catch { return unavailable(400); }
  };
}
function unavailable(status: number) { return NextResponse.json({ status: "unavailable" }, { status, headers: noStore }); }
function isUploadFile(value: FormDataEntryValue): value is File { return typeof value !== "string" && typeof value.name === "string" && typeof value.type === "string" && typeof value.size === "number"; }
