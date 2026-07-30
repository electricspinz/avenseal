import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { const appointment = await repository.getAppointment((await params).id); if (!appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 }); await repository.revokeClientWorkspaceTokensForAppointment(appointment.organizationId, appointment.id); return NextResponse.json({ revoked: true }); }
