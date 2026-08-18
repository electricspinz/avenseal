import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrganizationContext, type AdminOrganizationContext } from "@/lib/server/admin-context";
import type { FloridaRonPreparedAttempt } from "@/lib/server/florida-ron-session-assistant";
import { repository } from "@/lib/server/repository";

type Appointment = NonNullable<Awaited<ReturnType<typeof repository.getAppointment>>>;

export type FloridaRonSessionAssistantReadDependencies = Readonly<{
  context: () => Promise<AdminOrganizationContext>;
  getAppointment: (id: string) => Promise<Appointment | null>;
  getPreparedAttempt: (organizationId: string, appointmentId: string) => Promise<FloridaRonPreparedAttempt | null>;
}>;

const productionDependencies: FloridaRonSessionAssistantReadDependencies = {
  context: requireAdminOrganizationContext,
  getAppointment: (id) => repository.getAppointment(id),
  getPreparedAttempt: (organizationId, appointmentId) => repository.getFloridaRonPreparedAttempt(organizationId, appointmentId)
};

export function createFloridaRonSessionAssistantReadHandler(dependencies: FloridaRonSessionAssistantReadDependencies = productionDependencies) {
  return async function handle(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let context: AdminOrganizationContext;
    try {
      context = await dependencies.context();
    } catch {
      return NextResponse.json({ error: "Admin organization access is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    try {
      const { id } = await params;
      const appointment = await dependencies.getAppointment(id);
      if (!appointment || appointment.organizationId !== context.organizationId) return notFound();

      const attempt = await dependencies.getPreparedAttempt(context.organizationId, appointment.id);
      if (!attempt) return notFound();

      return NextResponse.json({ attempt }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Session preparation is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  };
}

function notFound() {
  return NextResponse.json({ error: "Prepared session not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
