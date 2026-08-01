import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { repository } from "@/lib/server/repository";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { const context = await requireAdminOrganizationContext(); const appointment = await repository.getAppointment((await params).id); if (!appointment || appointment.organizationId !== context.organizationId) return NextResponse.json({ error: "Appointment not found." }, { status: 404 }); const access = await repository.rotateClientWorkspaceToken(appointment, "admin_generate"); return NextResponse.json({ access: access.record, url: `${getServerEnv().NEXT_PUBLIC_SITE_URL}/appointments/access/${encodeURIComponent(access.token)}` }, { headers: { "Cache-Control": "no-store" } }); }
