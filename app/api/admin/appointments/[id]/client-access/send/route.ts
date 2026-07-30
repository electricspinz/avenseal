import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { const appointment = await repository.getAppointment((await params).id); if (!appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 }); const result = await repository.sendClientWorkspaceAccess(appointment, "admin_send"); return NextResponse.json({ access: result.record, delivery: result.delivery.status }); }
