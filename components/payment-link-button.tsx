"use client";

import { useState } from "react";
import { Button } from "@/components/button";

export function PaymentLinkButton({ appointmentId }: { appointmentId: string }) {
  const [message, setMessage] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  async function createPaymentLink() {
    if (loading) return;
    setLoading(true);
    setMessage("");
    setCopyMessage("");

    try {
      const response = await fetch(`/api/admin/appointments/${appointmentId}/payment-link`, { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error ?? "Payment link could not be created.");
        return;
      }

      const nextUrl = result?.result?.payment?.checkoutUrl ?? "";
      if (!nextUrl) {
        setMessage("Payment record was returned without a checkout URL.");
        return;
      }

      const customerEmail = result?.result?.customerEmail ?? "the customer";
      const deliveryStatus = result?.result?.delivery?.status;
      setCheckoutUrl(nextUrl);
      if (deliveryStatus === "sent") {
        setMessage(`Payment request emailed to ${customerEmail}`);
      } else if (deliveryStatus === "skipped") {
        setMessage("Payment link created. Email delivery is not configured.");
      } else {
        setMessage("Payment link created, but the email could not be sent.");
      }
    } catch {
      setMessage("Network error while creating the payment link.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPaymentLink() {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopyMessage("Payment link copied.");
    } catch {
      setCopyMessage("Could not copy the payment link.");
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={createPaymentLink} disabled={loading} aria-disabled={loading}>
        {loading ? "Creating..." : "Approve and Send Payment Link"}
      </Button>
      {message && <p className="text-sm font-semibold text-slateDeep" role="status">{message}</p>}
      {checkoutUrl && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
          <a
            className="focus-ring rounded-md text-navy underline decoration-silver underline-offset-4 hover:text-emeraldAction"
            href={checkoutUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Payment Link
          </a>
          <button
            type="button"
            onClick={copyPaymentLink}
            className="focus-ring rounded-md text-slateDeep underline decoration-silver underline-offset-4 hover:text-navy"
          >
            Copy Payment Link
          </button>
        </div>
      )}
      {copyMessage && <p className="text-xs font-semibold text-slateDeep" role="status">{copyMessage}</p>}
    </div>
  );
}
