import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import { repository } from "@/lib/server/repository";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { queueDocumentReviewOutcome } from "@/lib/server/document-review-communications";

const reviewRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNotes: z.string().optional()
}).superRefine((value, context) => {
  if (value.action === "reject" && !value.reviewNotes?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewNotes"], message: "A rejection reason is required." });
  }
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const [{ id: appointmentId, documentId }, context, body] = await Promise.all([params, requireAdminOrganizationContext(), request.json()]);
    const parsed = reviewRequestSchema.safeParse(body);
    if (!parsed.success) return unavailable(400);
    const appointment = await repository.getAppointment(appointmentId);
    if (!appointment || appointment.organizationId !== context.organizationId) return unavailable(404);

    const documents = createAppointmentDocumentRepository(getSupabaseAdmin());
    const input = { organizationId: context.organizationId, appointmentId: appointment.id, documentId, reviewer: { id: context.userId, role: context.role }, reviewNotes: parsed.data.reviewNotes };
    const document = parsed.data.action === "approve" ? await documents.approveDocument(input) : await documents.rejectDocument(input);
    try { await queueDocumentReviewOutcome(document); } catch { /* Review outcome remains durable if notification queueing is temporarily unavailable. */ }
    return NextResponse.json({ document: { id: document.id, status: document.status, reviewerName: document.reviewerName, reviewedAt: document.reviewedAt, reviewNotes: document.reviewNotes } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable(403);
  }
}

function unavailable(status: number) {
  return NextResponse.json({ error: "Document review is unavailable." }, { status, headers: { "Cache-Control": "no-store" } });
}
