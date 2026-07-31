import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = await repository.getCustomerAppointmentByAccessToken(token);
  if (!status) return NextResponse.json({ status: "unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (status.paymentStatus === "paid") return NextResponse.json({ status: "already_paid" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const result = await repository.createPaymentLink(status.appointmentId);
    if (!result.payment.checkoutUrl) return NextResponse.json({ status: "unavailable" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ status: "checkout_ready", checkoutUrl: result.payment.checkoutUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
}
