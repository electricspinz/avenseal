import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { verifyStripeSignature } from "@/lib/milestone3/stripe";
import { repository } from "@/lib/server/repository";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const secret = getServerEnv().STRIPE_WEBHOOK_SECRET;

  if (!secret || !verifyStripeSignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const event = JSON.parse(payload);
  const type = String(event.type ?? "");
  const object = event.data?.object ?? {};

  try {
    if (type === "checkout.session.completed" || type === "payment_intent.succeeded") {
      const result = await repository.confirmPaymentFromStripe({
        providerEventId: String(event.id),
        eventType: type,
        checkoutSessionId: object.object === "checkout.session" ? object.id : object.checkout_session,
        paymentIntentId: object.payment_intent ?? object.id
      });
      return NextResponse.json({ received: true, result });
    }
    return NextResponse.json({ received: true, ignored: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, { status: 500 });
  }
}
