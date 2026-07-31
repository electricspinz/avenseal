"use client";

import React, { useState } from "react";
import { Button } from "@/components/button";
import type { ClientPortalViewModel } from "@/lib/server/client-portal";

export function ClientPaymentCard({ token, payment }: { token: string; payment: ClientPortalViewModel["payment"] }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(payment.status !== "paid" && payment.availability === "available");
  const amount = payment.amountDueCents === null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency }).format(payment.amountDueCents / 100);
  async function beginPayment() { if (pending || !available) return; setPending(true); setMessage(""); try { const response = await fetch(`/api/appointments/access/${encodeURIComponent(token)}/payment`, { method: "POST" }); const result = await response.json().catch(() => null); if (result?.status === "checkout_ready" && typeof result.checkoutUrl === "string") { window.location.assign(result.checkoutUrl); return; } if (result?.status === "already_paid") { setAvailable(false); setMessage("Payment has already been completed."); return; } if (result?.status === "unavailable") { setAvailable(false); setMessage("Payment is not currently available."); return; } setMessage("We couldn't start secure checkout. Please try again."); } catch { setMessage("We couldn't start secure checkout. Please try again."); } finally { setPending(false); } }
  if (payment.status === "paid" || message.includes("completed")) return <section className="rounded-lg border border-silver bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold text-navy">Payment Complete</h2><p className="mt-3 text-sm text-slateDeep">Payment has already been completed.</p></section>;
  return <section className="rounded-lg border border-silver bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold text-navy">Complete Payment</h2><p className="mt-3 text-sm text-slateDeep">Payment is required before your online notarization appointment.</p>{amount && <p className="mt-3 text-lg font-semibold text-navy">Amount due: {amount}</p>}{available ? <div className="mt-4"><Button onClick={beginPayment} disabled={pending}>{pending ? "Creating secure checkout..." : "Pay Securely"}</Button></div> : <p className="mt-3 text-sm text-slateDeep" role="status">{message || "Payment is not currently available."}</p>}{message && available && <p className="mt-3 text-sm text-slateDeep" role="status">{message}</p>}</section>;
}
