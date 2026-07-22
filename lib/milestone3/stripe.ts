import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string, toleranceSeconds = 300) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function createStripeCheckoutSession(input: {
  apiKey: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
  lineItem: { name: string; amountCents: number; currency: string; quantity: number };
  metadata: Record<string, string>;
  expiresAt?: number;
}) {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("customer_email", input.customerEmail);
  body.set("line_items[0][quantity]", String(input.lineItem.quantity));
  body.set("line_items[0][price_data][currency]", input.lineItem.currency);
  body.set("line_items[0][price_data][unit_amount]", String(input.lineItem.amountCents));
  body.set("line_items[0][price_data][product_data][name]", input.lineItem.name);
  if (input.expiresAt) body.set("expires_at", String(input.expiresAt));
  for (const [key, value] of Object.entries(input.metadata)) body.set(`metadata[${key}]`, value);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": input.idempotencyKey
    },
    body
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Stripe checkout session failed.");
  return json as { id: string; url: string; payment_intent?: string; expires_at?: number };
}
