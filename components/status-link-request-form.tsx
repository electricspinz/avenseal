"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/button";

export function StatusLinkRequestForm() {
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/appointments/status-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reference })
      });
      const result = await response.json().catch(() => null);
      setMessage(result?.message ?? "If we find a matching appointment, we will send a secure status link.");
    } catch {
      setMessage("If we find a matching appointment, we will send a secure status link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block text-sm font-semibold text-navy">
        Email used for booking
        <input
          className="input mt-2"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label className="block text-sm font-semibold text-navy">
        Appointment reference
        <input
          className="input mt-2"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          required
        />
      </label>
      <Button type="submit" disabled={loading} aria-disabled={loading}>
        {loading ? "Sending..." : "Send Secure Status Link"}
      </Button>
      {message && <p className="text-sm font-semibold text-slateDeep" role="status">{message}</p>}
    </form>
  );
}
