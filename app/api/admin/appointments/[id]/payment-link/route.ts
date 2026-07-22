import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await repository.createPaymentLink(id);
    const appointment = await repository.getAppointment(id);
    const customerEmail = appointment?.customer.email ?? null;
    return NextResponse.json({ result: { ...result, customerEmail } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create payment link." }, { status: 400 });
  }
}
