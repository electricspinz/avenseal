import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { readFloridaRonCandidatePreviewModules } from "@/lib/server/florida-ron-candidate-preview";
import { repository } from "@/lib/server/repository";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireAdminOrganizationContext(), params]);
    const appointment = await repository.getAppointment(id);
    if (!appointment || appointment.organizationId !== context.organizationId) return unavailable(404);
    const attempt = await repository.getFloridaRonPreparedAttempt(context.organizationId, appointment.id);
    if (!attempt || attempt.state !== "prepared") return unavailable(404);
    const modules = await readFloridaRonCandidatePreviewModules(attempt.modules);
    return NextResponse.json({ attempt: { sessionId: attempt.sessionId, state: attempt.state, workflowVersion: attempt.workflowVersion, specificationStatus: attempt.specificationStatus, parameters: attempt.parameters, productionEnabled: attempt.productionEnabled }, modules }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable(403);
  }
}

function unavailable(status: number) {
  return NextResponse.json({ error: "Candidate preview is unavailable." }, { status, headers: { "Cache-Control": "no-store" } });
}
