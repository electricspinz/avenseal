"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { trackPartnerInterestStarted, trackPartnerInterestSubmitted, trackPartnerPageView } from "@/lib/analytics";

const initialForm = {
  firstName: "",
  lastName: "",
  organization: "",
  workEmail: "",
  phone: "",
  industry: "",
  website: "",
  message: "",
  noCommissionAcknowledged: false
};

export function PartnerInterestForm() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);
  const update = <K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    trackPartnerPageView();
  }, []);

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackPartnerInterestStarted();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/partners/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error ?? "We couldn’t submit your request right now. Please try again.");
        return;
      }
      trackPartnerInterestSubmitted();
      setMessage(result?.message ?? "Thank you. We’ll review your information and follow up about the Avenseal Professional Partner Network.");
      setForm(initialForm);
    } catch {
      setMessage("We couldn’t submit your request right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-5 sm:grid-cols-2" onFocusCapture={markStarted}>
      <Field label="First name"><input required autoComplete="given-name" className="input mt-2" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></Field>
      <Field label="Last name"><input required autoComplete="family-name" className="input mt-2" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></Field>
      <Field label="Organization"><input required autoComplete="organization" className="input mt-2" value={form.organization} onChange={(event) => update("organization", event.target.value)} /></Field>
      <Field label="Work email"><input required type="email" autoComplete="email" className="input mt-2" value={form.workEmail} onChange={(event) => update("workEmail", event.target.value)} /></Field>
      <Field label="Phone (optional)"><input type="tel" autoComplete="tel" className="input mt-2" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></Field>
      <Field label="Industry / organization type"><select required className="input mt-2" value={form.industry} onChange={(event) => update("industry", event.target.value)}><option value="">Select one</option><option value="estate-planning-or-elder-law">Estate planning or elder law</option><option value="family-law">Family law</option><option value="title-or-real-estate">Title or real estate</option><option value="mortgage">Mortgage</option><option value="financial-advisory">Financial advisory</option><option value="accounting">Accounting</option><option value="insurance">Insurance</option><option value="other">Other</option></select></Field>
      <Field label="Website (optional)"><input type="url" inputMode="url" placeholder="https://" className="input mt-2" value={form.website} onChange={(event) => update("website", event.target.value)} /></Field>
      <Field label="Short message (optional)"><textarea className="input mt-2 min-h-28" value={form.message} onChange={(event) => update("message", event.target.value)} /></Field>
      <label className="sm:col-span-2 flex items-start gap-3 rounded-lg border border-silver bg-mist p-4 text-sm leading-6 text-slateDeep">
        <input required type="checkbox" checked={form.noCommissionAcknowledged} onChange={(event) => update("noCommissionAcknowledged", event.target.checked)} className="mt-1" />
        I understand that the Avenseal Professional Partner Network does not provide referral commissions.
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Request Partner Information"}</Button>
        {message ? <p className="mt-4 text-sm font-semibold text-slateDeep" role="status">{message}</p> : null}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-navy">{label}{children}</label>;
}
