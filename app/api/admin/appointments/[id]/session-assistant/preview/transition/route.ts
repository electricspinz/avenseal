import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { assistantStopReasons } from "@/lib/server/florida-ron-session-assistant";
import { requiredFloridaRonCandidateCompletionConfirmations } from "@/lib/server/florida-ron-candidate-preview";
import { repository } from "@/lib/server/repository";

const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stop"), stopReason: z.enum(assistantStopReasons), moduleId: z.string().min(1).max(80), principalIndex: z.number().int().min(0).max(19).nullable().optional(), witnessIndex: z.number().int().min(0).max(19).nullable().optional() }),
  z.object({ action: z.literal("preview_complete"), moduleId: z.literal("FL-COMPLETE"), confirmations: z.array(z.string().min(1).max(500)).min(1).max(50) })
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }, body] = await Promise.all([requireAdminOrganizationContext(), params, request.json()]);
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) return response(400);
    const appointment = await repository.getAppointment(id);
    if (!appointment || appointment.organizationId !== context.organizationId) return response(404);
    const current = await repository.getFloridaRonPreparedAttempt(context.organizationId, appointment.id);
    if (!current || current.specificationStatus !== "candidate") return response(404);
    const transition = parsed.data;
    if (transition.action === "stop") {
      const payload = { workflowVersion: current.workflowVersion, activeModuleId: transition.moduleId, moduleVersions: current.modules, stopReason: transition.stopReason, principalIndex: transition.principalIndex ?? null, witnessIndex: transition.witnessIndex ?? null, parameters: current.parameters };
      const updated = await repository.transitionFloridaRonPreparedAttempt({ organizationId: context.organizationId, appointmentId: appointment.id, actorId: context.userId, state: "stopped", outcome: "stopped", stopReason: transition.stopReason, eventType: "preview_stopped", payload });
      if (!updated) return response(404);
      return NextResponse.json({ sessionId: updated.id, state: "stopped", outcome: "stopped", stopReason: transition.stopReason, productionEnabled: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const requiredConfirmations = await requiredFloridaRonCandidateCompletionConfirmations(current.workflowVersion, current.parameters);
    const missingConfirmations = requiredConfirmations.filter((confirmation) => !transition.confirmations.includes(confirmation));
    if (missingConfirmations.length > 0) return blockCompletion(missingConfirmations);
    const payload = { workflowVersion: current.workflowVersion, activeModuleId: "FL-COMPLETE", moduleVersions: current.modules, confirmations: transition.confirmations, parameters: current.parameters };
    const updated = await repository.transitionFloridaRonPreparedAttempt({ organizationId: context.organizationId, appointmentId: appointment.id, actorId: context.userId, state: "preview_completed", outcome: "preview_completed", stopReason: null, eventType: "preview_completed", payload });
    if (!updated) return response(404);
    return NextResponse.json({ sessionId: updated.id, state: "preview_completed", outcome: "preview_completed", stopReason: null, productionEnabled: false }, { headers: { "Cache-Control": "no-store" } });
  } catch { return response(403); }
}

function response(status: number, error = "Candidate preview transition is unavailable.") { return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } }); }

function blockCompletion(missingConfirmations: readonly string[]) {
  return NextResponse.json({ error: "Candidate final-compliance review remains unresolved.", controlType: "block_completion", missingConfirmations }, { status: 409, headers: { "Cache-Control": "no-store" } });
}
