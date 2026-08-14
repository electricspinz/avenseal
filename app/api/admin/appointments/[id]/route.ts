import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";
import { adminUpdateSchema } from "@/lib/validation";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import {
  classifyAdminAppointmentUpdateWriteError,
  logAdminAppointmentUpdateDiagnostic,
} from "@/lib/server/admin-appointment-update-diagnostics";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let context: Awaited<ReturnType<typeof requireAdminOrganizationContext>>;
  try {
    context = await requireAdminOrganizationContext();
  } catch (error) {
    logAdminAppointmentUpdateDiagnostic("admin_context_rejected");
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    logAdminAppointmentUpdateDiagnostic("invalid_update");
    throw error;
  }

  const parsed = adminUpdateSchema.safeParse(body);
  if (!parsed.success) {
    logAdminAppointmentUpdateDiagnostic("invalid_update");
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }

  let existing: Awaited<ReturnType<typeof repository.getAppointment>>;
  try {
    existing = await repository.getAppointment(id);
  } catch (error) {
    logAdminAppointmentUpdateDiagnostic(classifyAdminAppointmentUpdateWriteError(error));
    throw error;
  }
  if (!existing || existing.organizationId !== context.organizationId) {
    logAdminAppointmentUpdateDiagnostic("appointment_missing_or_wrong_tenant");
    return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  }

  let appointment: Awaited<ReturnType<typeof repository.updateAppointment>>;
  try {
    appointment = await repository.updateAppointment(id, parsed.data);
  } catch (error) {
    logAdminAppointmentUpdateDiagnostic(classifyAdminAppointmentUpdateWriteError(error));
    throw error;
  }
  if (!appointment) {
    logAdminAppointmentUpdateDiagnostic("appointment_missing_or_wrong_tenant");
    return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  }

  return NextResponse.json({ appointment });
}
