import { NextRequest, NextResponse } from "next/server";
import { adminRescheduleSchema } from "@/lib/validation";
import { requireAdminOrganizationContext, type AdminOrganizationContext } from "@/lib/server/admin-context";
import { consumeDistributedRateLimit, rateLimitedResponse, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import {
  AdminAppointmentRescheduleDiagnosticError,
  repository,
  type AdminAppointmentRescheduleDiagnosticCategory
} from "@/lib/server/repository";

type Appointment = NonNullable<Awaited<ReturnType<typeof repository.getAppointment>>>;
type Result = Awaited<ReturnType<typeof repository.rescheduleAppointment>>;

export type AdminAppointmentRescheduleDependencies = Readonly<{
  context: () => Promise<AdminOrganizationContext>;
  getAppointment: (id: string) => Promise<Appointment | null>;
  consume: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>;
  reschedule: (input: { appointmentId: string; organizationId: string; actorUserId: string; preferredDate: string; preferredTime: string }) => Promise<Result>;
}>;

const productionDependencies: AdminAppointmentRescheduleDependencies = {
  context: requireAdminOrganizationContext,
  getAppointment: (id) => repository.getAppointment(id),
  consume: consumeDistributedRateLimit,
  reschedule: repository.rescheduleAppointment
};

export function createAdminAppointmentRescheduleHandler(dependencies: AdminAppointmentRescheduleDependencies = productionDependencies) {
  return async function handle(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
      const [{ id }, context, body] = await Promise.all([params, dependencies.context(), request.json()]);
      const parsed = adminRescheduleSchema.safeParse(body);
      if (!parsed.success) {
        logDiagnostic("availability_preflight_failed");
        return unavailable(400);
      }
      const appointment = await dependencies.getAppointment(id);
      if (!appointment || appointment.organizationId !== context.organizationId) {
        logDiagnostic("rpc_not_found");
        return unavailable(404);
      }
      let rate: RateLimitResult;
      try {
        rate = await dependencies.consume("admin_appointment_reschedule", `${context.organizationId}:${context.userId}:${appointment.id}`);
      } catch {
        return rateLimitedResponse(60);
      }
      if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
      const result = await dependencies.reschedule({
        appointmentId: appointment.id,
        organizationId: context.organizationId,
        actorUserId: context.userId,
        preferredDate: parsed.data.preferredDate,
        preferredTime: parsed.data.preferredTime
      });
      return NextResponse.json({ appointment: result.appointment, calendarSyncStatus: result.calendarSyncStatus }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      logDiagnostic(error instanceof AdminAppointmentRescheduleDiagnosticError ? error.category : "unexpected_database_error");
      return unavailable(400);
    }
  };
}

function logDiagnostic(category: AdminAppointmentRescheduleDiagnosticCategory) {
  // Temporary production diagnosis instrumentation. Remove after the failed reschedule is reproduced and reviewed.
  console.error("[admin-reschedule]", { category });
}

function unavailable(status: number) {
  return NextResponse.json({ error: "Appointment rescheduling is unavailable." }, { status, headers: { "Cache-Control": "no-store" } });
}
