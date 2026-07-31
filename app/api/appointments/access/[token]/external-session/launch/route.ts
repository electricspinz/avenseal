import { NextRequest, NextResponse } from "next/server";
import { isCustomerVisibleExternalSession } from "@/lib/server/external-sessions";
import { repository } from "@/lib/server/repository";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const appointment = await repository.getCustomerAppointmentByAccessToken(token);
    if (!appointment) return unavailable();
    const session = await repository.getExternalSession(appointment.organizationId, appointment.appointmentId);
    if (!isCustomerVisibleExternalSession({ paymentStatus: appointment.paymentStatus, appointmentStatus: appointment.status, organizationId: appointment.organizationId, appointmentId: appointment.appointmentId, session }) || !session?.launchUrl) return unavailable();
    await repository.recordExternalSessionOpened(appointment.organizationId, appointment.appointmentId, session.provider);
    const response = NextResponse.redirect(session.launchUrl, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch { return unavailable(); }
}

function unavailable() { return NextResponse.json({ status: "unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } }); }
