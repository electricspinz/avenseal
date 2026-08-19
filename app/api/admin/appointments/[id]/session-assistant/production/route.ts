import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { assistantStopReasons } from "@/lib/server/florida-ron-session-assistant";
import { isProductionStopApplicable, productionApplicableStopReasons, productionRequirementId, unresolvedProductionRequirements } from "@/lib/server/florida-ron-production";
import { repository } from "@/lib/server/repository";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("confirm"), requirementId: z.string().min(1).max(160), principalIndex: z.number().int().min(0).max(19).nullable().optional() }),
  z.object({ action: z.literal("advance") }),
  z.object({ action: z.literal("stop"), stopReason: z.enum(assistantStopReasons) })
]);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const [context, { id }] = await Promise.all([requireAdminOrganizationContext(), params]); const appointment = await repository.getAppointment(id); if (!appointment || appointment.organizationId !== context.organizationId) return unavailable(404); const attempt = await repository.getFloridaRonProductionAttempt(context.organizationId, appointment.id); if (!attempt) return unavailable(404); const evidence = await repository.getFloridaRonProductionEvidence(context.organizationId, attempt.id); return NextResponse.json(success(attempt, { evidence }), { headers: { "Cache-Control": "no-store" } }); } catch { return unavailable(403); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }, body] = await Promise.all([requireAdminOrganizationContext(), params, request.json()]);
    const parsed = requestSchema.safeParse(body); if (!parsed.success) return unavailable(400);
    const appointment = await repository.getAppointment(id); if (!appointment || appointment.organizationId !== context.organizationId) return unavailable(404);
    const action = parsed.data;
    if (action.action === "start") {
      const prepared = await repository.getFloridaRonPreparedAttempt(context.organizationId, appointment.id);
      if (!prepared || prepared.specificationStatus !== "candidate" || prepared.stopReason || prepared.modules.length === 0) return unavailable(409, "A prepared, unblocked Candidate route is required.");
      const existing = await repository.getFloridaRonProductionAttempt(context.organizationId, appointment.id); if (existing) return NextResponse.json(success(existing), { headers: { "Cache-Control": "no-store" } });
      const attempt = await repository.createFloridaRonProductionAttempt({ organizationId: context.organizationId, appointmentId: appointment.id, preparedSessionId: prepared.sessionId, workflowVersion: prepared.workflowVersion, preparedParameters: prepared.parameters, modules: [...prepared.modules], state: "in_progress", currentModuleIndex: 0, stopReason: null, createdBy: context.userId });
      return NextResponse.json(success(attempt), { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    const attempt = await repository.getFloridaRonProductionAttempt(context.organizationId, appointment.id); if (!attempt) return unavailable(404);
    const current = attempt.modules[attempt.currentModuleIndex]; if (!current) return unavailable(409, "Production completion is not enabled in this implementation stage.");
    if (action.action === "confirm") {
      if (action.requirementId !== productionRequirementId(current)) return unavailable(409, "The submitted confirmation is not applicable to the current module.");
      const evidence = { id: randomUUID(), attemptId: attempt.id, moduleId: current.id, moduleVersion: current.version, requirementId: action.requirementId, principalIndex: action.principalIndex ?? null, value: true, source: "NOTARY_CONFIRMED" as const, actorId: context.userId, createdAt: new Date().toISOString() };
      await repository.addFloridaRonProductionEvidence(context.organizationId, evidence); return NextResponse.json(success(attempt, { evidence }), { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (action.action === "stop") {
      if (!assistantStopReasons.includes(action.stopReason) || !isProductionStopApplicable(current, action.stopReason)) return unavailable(409, "The submitted STOP reason is not applicable to the current module.");
      const updated = await repository.transitionFloridaRonProductionAttempt({ attemptId: attempt.id, organizationId: context.organizationId, state: "stopped", currentModuleIndex: attempt.currentModuleIndex, stopReason: action.stopReason, actorId: context.userId, eventType: "attempt_stopped", payload: { workflowVersion: attempt.workflowVersion, activeModule: current, stopReason: action.stopReason } });
      return updated ? NextResponse.json(success(updated), { headers: { "Cache-Control": "no-store" } }) : unavailable(409);
    }
    const evidence = await repository.getFloridaRonProductionEvidence(context.organizationId, attempt.id); const unresolved = unresolvedProductionRequirements(attempt, evidence);
    if (unresolved.length) return NextResponse.json({ error: "Current module requirements remain unresolved.", unresolvedRequirementIds: unresolved }, { status: 409, headers: { "Cache-Control": "no-store" } });
    if (attempt.currentModuleIndex + 1 >= attempt.modules.length) return unavailable(409, "Production completion is not enabled in this implementation stage.");
    const updated = await repository.transitionFloridaRonProductionAttempt({ attemptId: attempt.id, organizationId: context.organizationId, state: "in_progress", currentModuleIndex: attempt.currentModuleIndex + 1, stopReason: null, actorId: context.userId, eventType: "module_advanced", payload: { workflowVersion: attempt.workflowVersion, previousModule: current, nextModule: attempt.modules[attempt.currentModuleIndex + 1] } });
    return updated ? NextResponse.json(success(updated), { headers: { "Cache-Control": "no-store" } }) : unavailable(409);
  } catch { return unavailable(403); }
}
function unavailable(status: number, error = "Production Session Assistant is unavailable.") { return NextResponse.json({ error, productionCompletionEnabled: false }, { status, headers: { "Cache-Control": "no-store" } }); }
function success(attempt: { state: string; currentModuleIndex: number; modules: readonly { id: string; version: string; classification?: string }[] }, extra: Record<string, unknown> = {}) { const current = attempt.state === "in_progress" ? attempt.modules[attempt.currentModuleIndex] : null; return { attempt, ...extra, applicableStopReasons: current ? productionApplicableStopReasons(current as Parameters<typeof productionApplicableStopReasons>[0]) : [], productionCompletionEnabled: false }; }
