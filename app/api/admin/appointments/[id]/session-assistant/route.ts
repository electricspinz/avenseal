import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrganizationContext, type AdminOrganizationContext } from "@/lib/server/admin-context";
import { floridaRonWorkflowVersion11, prepareFloridaRonSessionForWorkflow, routeFloridaRonSessionForWorkflow } from "@/lib/server/florida-ron-session-assistant";
import { repository } from "@/lib/server/repository";
import { createFloridaRonSessionAssistantReadHandler } from "./handler";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let context: AdminOrganizationContext;
  try {
    context = await requireAdminOrganizationContext();
  } catch {
    return NextResponse.json({ error: "Admin organization access is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const { id } = await params;
  const appointment = await repository.getAppointment(id);
  if (!appointment || appointment.organizationId !== context.organizationId) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  const parsed = prepareFloridaRonSessionForWorkflowSafe(floridaRonWorkflowVersion11, await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Session configuration is invalid." }, { status: 400 });
  const route = routeFloridaRonSessionForWorkflow(floridaRonWorkflowVersion11, parsed.data);
  const moduleVersions = route.modules.map((entry) => ({ id: entry.id, version: entry.version, classification: entry.classification }));
  try {
    const session = await repository.createFloridaRonPreparedAttempt({ organizationId: context.organizationId, appointmentId: appointment.id, actorId: context.userId, workflowVersion: floridaRonWorkflowVersion11, parameters: parsed.data, modules: moduleVersions, stopReason: route.stopReason });
    return NextResponse.json({ sessionId: session.id, state: "prepared", productionEnabled: false, stopReason: route.stopReason, controlType: route.controlType, modules: moduleVersions }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Session preparation is unavailable." }, { status: 503 }); }
}

export const GET = createFloridaRonSessionAssistantReadHandler();

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let context: AdminOrganizationContext;
  try {
    context = await requireAdminOrganizationContext();
  } catch {
    return NextResponse.json({ error: "Admin organization access is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const { id } = await params;
  const appointment = await repository.getAppointment(id);
  if (!appointment || appointment.organizationId !== context.organizationId) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  const existing = await repository.getFloridaRonPreparedAttempt(context.organizationId, appointment.id);
  if (!existing) return NextResponse.json({ error: "Prepared session not found." }, { status: 404 });
  const parsed = prepareFloridaRonSessionForWorkflowSafe(existing.workflowVersion, await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Session configuration is invalid." }, { status: 400 });
  const route = routeFloridaRonSessionForWorkflow(existing.workflowVersion, parsed.data);
  const moduleVersions = route.modules.map((entry) => ({ id: entry.id, version: entry.version, classification: entry.classification }));
  try {
    const session = await repository.updateFloridaRonPreparedAttempt({ organizationId: context.organizationId, appointmentId: appointment.id, actorId: context.userId, parameters: parsed.data, modules: moduleVersions, stopReason: route.stopReason });
    if (!session) return NextResponse.json({ error: "Prepared session not found." }, { status: 404 });
    return NextResponse.json({ sessionId: session.id, productionEnabled: false, stopReason: route.stopReason, controlType: route.controlType, modules: moduleVersions }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Session preparation is unavailable." }, { status: 503 }); }
}

function prepareFloridaRonSessionForWorkflowSafe(workflowVersion: string, body: unknown) {
  try { return { success: true as const, data: prepareFloridaRonSessionForWorkflow(workflowVersion, body) }; } catch { return { success: false as const }; }
}
