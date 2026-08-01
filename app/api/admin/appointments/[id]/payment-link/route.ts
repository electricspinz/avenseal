import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const context = await requireAdminOrganizationContext();
    const existing = await repository.getAppointment(id);
    if (!existing || existing.organizationId !== context.organizationId) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    const result = await repository.createPaymentLink(id);
    const appointment = existing;
    const customerEmail = appointment?.customer.email ?? null;
    return NextResponse.json({ result: { ...result, customerEmail } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create payment link." }, { status: 400 });
  }
}
