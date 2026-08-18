import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { repository } from "@/lib/server/repository";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireAdminOrganizationContext(), params]);
    const appointment = await repository.getAppointment(id);
    if (!appointment || appointment.organizationId !== context.organizationId) return unavailable(404);
    const history = await repository.getFloridaRonHistory(context.organizationId, appointment.id);
    return NextResponse.json({ history }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(403); }
}

function unavailable(status: number) { return NextResponse.json({ error: "Session Assistant history is unavailable." }, { status, headers: { "Cache-Control": "no-store" } }); }
