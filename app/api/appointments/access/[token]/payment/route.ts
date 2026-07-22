import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = await repository.getCustomerAppointmentByAccessToken(token);

  if (!status?.checkoutUrl || status.paymentStatus !== "payment_link_created") {
    return NextResponse.redirect(new URL(`/appointments/access/${encodeURIComponent(token)}`, _request.url));
  }

  return NextResponse.redirect(status.checkoutUrl);
}
