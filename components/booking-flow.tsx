"use client";

import { useEffect, useMemo, useState } from "react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/button";
import { icons } from "@/components/icons";

type Draft = {
  fullName: string;
  email: string;
  mobilePhone: string;
  documentCategory: string;
  documentCount: number;
  signerCount: number;
  estimatedNotarizations: number | null;
  notarizationsNotSure: boolean;
  hasWitnessLines: boolean | null;
  witnessesAvailable: boolean | null;
  signerLocation: string;
  allSignersHaveGovernmentId: boolean;
  preferredDate: string;
  preferredTime: string;
  urgency: "same_day" | "next_available" | "specific_date" | "not_urgent";
  administrativeNotes: string;
  consentAccepted: boolean;
};

const defaultDraft: Draft = {
  fullName: "",
  email: "",
  mobilePhone: "",
  documentCategory: "not_sure",
  documentCount: 1,
  signerCount: 1,
  estimatedNotarizations: null,
  notarizationsNotSure: true,
  hasWitnessLines: null,
  witnessesAvailable: null,
  signerLocation: "Florida, USA",
  allSignersHaveGovernmentId: true,
  preferredDate: new Date().toISOString().slice(0, 10),
  preferredTime: "14:00",
  urgency: "same_day",
  administrativeNotes: "",
  consentAccepted: false
};

const steps = [
  "Your Details",
  "About Your Documents",
  "Participants & Location",
  "ID & Requirements",
  "Appointment Preferences",
  "Notes & Consent",
  "Review"
];

const categories = [
  ["affidavit", "Affidavit"],
  ["power_of_attorney", "Power of Attorney"],
  ["estate_planning", "Estate-planning document"],
  ["business_document", "Business document"],
  ["consent_or_authorization", "Consent or authorization form"],
  ["real_estate_related", "Real-estate-related document"],
  ["school_or_travel", "School or travel form"],
  ["other", "Other"],
  ["not_sure", "Not sure"]
];

export function BookingFlow() {
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("avenseal-booking-draft");
    if (saved) setDraft({ ...defaultDraft, ...JSON.parse(saved) });
  }, []);

  useEffect(() => {
    window.localStorage.setItem("avenseal-booking-draft", JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    let active = true;
    async function loadAvailability() {
      if (!draft.preferredDate) return;
      setAvailabilityLoading(true);
      const response = await fetch(`/api/availability?date=${encodeURIComponent(draft.preferredDate)}`);
      const result = await response.json();
      if (!active) return;
      const nextSlots = response.ok ? result.slots ?? [] : [];
      setSlots(nextSlots);
      setAvailabilityMessage(nextSlots.length === 0 ? "No booking slots are available for this date." : `Times shown use ${result.timezone}.`);
      if (nextSlots.length > 0 && !nextSlots.includes(draft.preferredTime)) {
        update("preferredTime", nextSlots[0]);
      }
      setAvailabilityLoading(false);
    }
    loadAvailability();
    return () => {
      active = false;
    };
  }, [draft.preferredDate, draft.preferredTime]);

  const progress = Math.round(((step + 1) / steps.length) * 100);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function validateCurrentStep() {
    if (step === 0 && (!draft.fullName.trim() || !draft.email.includes("@") || draft.mobilePhone.length < 10)) {
      setError("Enter your full name, email, and mobile phone number.");
      return false;
    }
    if (step === 1 && (!draft.documentCategory || draft.documentCount < 1 || draft.signerCount < 1)) {
      setError("Complete the document and signer counts.");
      return false;
    }
    if (step === 2 && !draft.signerLocation.trim()) {
      setError("Enter the signer location.");
      return false;
    }
    if (step === 4 && (!draft.preferredDate || !slots.includes(draft.preferredTime))) {
      setError("Choose an available appointment slot.");
      return false;
    }
    if (step === 5 && !draft.consentAccepted) {
      setError("Accept the Privacy Policy and Terms before continuing.");
      return false;
    }
    return true;
  }

  function next() {
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        administrativeNotes: draft.administrativeNotes || null,
        privacyPolicyVersion: "legal-review-placeholder-2026-07",
        termsVersion: "legal-review-placeholder-2026-07"
      })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result.error ?? "Please review your answers and try again.");
      setSubmitting(false);
      return;
    }
    window.localStorage.removeItem("avenseal-booking-draft");
    window.location.assign("/booking/confirmation");
  }

  const stepContent = useMemo(() => {
    switch (step) {
      case 0:
        return (
          <Question title="Let's start with your contact information." description="We'll use this to contact you about your appointment.">
            <Field label="Full name"><input value={draft.fullName} onChange={(event) => update("fullName", event.target.value)} className="input" autoFocus /></Field>
            <Field label="Email"><input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} className="input" /></Field>
            <Field label="Mobile phone number"><input value={draft.mobilePhone} onChange={(event) => update("mobilePhone", event.target.value)} className="input" /></Field>
          </Question>
        );
      case 1:
        return (
          <Question title="What type of document are you requesting to notarize?" description="Choose the general category that best fits. The software will not select a notarial act.">
            <Field label="General document category">
              <select value={draft.documentCategory} onChange={(event) => update("documentCategory", event.target.value)} className="input">
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Number of documents"><input type="number" min={1} value={draft.documentCount} onChange={(event) => update("documentCount", Number(event.target.value))} className="input" /></Field>
              <Field label="Number of signers"><input type="number" min={1} value={draft.signerCount} onChange={(event) => update("signerCount", Number(event.target.value))} className="input" /></Field>
            </div>
            <Field label="Estimated number of notarizations">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input type="number" min={1} disabled={draft.notarizationsNotSure} value={draft.estimatedNotarizations ?? ""} onChange={(event) => update("estimatedNotarizations", Number(event.target.value))} className="input" />
                <label className="flex items-center gap-2 rounded-md border border-silver px-3 text-sm font-semibold text-navy">
                  <input type="checkbox" checked={draft.notarizationsNotSure} onChange={(event) => update("notarizationsNotSure", event.target.checked)} />
                  I am not sure
                </label>
              </div>
            </Field>
          </Question>
        );
      case 2:
        return (
          <Question title="Tell us about witnesses and signer location." description="If you are unsure, choose I'm not sure so a human can review it.">
            <Choice label="Do witness lines appear?" value={draft.hasWitnessLines} onChange={(value) => update("hasWitnessLines", value)} />
            <Choice label="Are witnesses already available?" value={draft.witnessesAvailable} onChange={(value) => update("witnessesAvailable", value)} />
            <Field label="Signer’s current U.S. state or country"><input value={draft.signerLocation} onChange={(event) => update("signerLocation", event.target.value)} className="input" /></Field>
          </Question>
        );
      case 3:
        return (
          <Question title="Confirm identification readiness." description="Do not enter ID numbers or upload ID images.">
            <label className="flex items-start gap-3 rounded-lg border border-silver p-4 text-sm text-slateDeep">
              <input type="checkbox" checked={draft.allSignersHaveGovernmentId} onChange={(event) => update("allSignersHaveGovernmentId", event.target.checked)} className="mt-1" />
              Each signer has current government-issued identification available for the notary session.
            </label>
          </Question>
        );
      case 4:
        return (
          <Question title="Request an appointment time." description="Times are requested appointment times and remain subject to review.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Requested appointment date"><input type="date" value={draft.preferredDate} onChange={(event) => update("preferredDate", event.target.value)} className="input" /></Field>
              <Field label="Requested appointment time">
                <select value={draft.preferredTime} onChange={(event) => update("preferredTime", event.target.value)} className="input" disabled={availabilityLoading || slots.length === 0}>
                  {slots.map((slot) => <option key={slot} value={slot}>{formatSlot(slot)}</option>)}
                </select>
              </Field>
            </div>
            <p className="rounded-md bg-mist p-3 text-sm font-semibold text-slateDeep">{availabilityLoading ? "Loading availability..." : availabilityMessage}</p>
            <Field label="Urgency">
              <select value={draft.urgency} onChange={(event) => update("urgency", event.target.value as Draft["urgency"])} className="input">
                <option value="same_day">Same-day</option>
                <option value="next_available">Next available</option>
                <option value="specific_date">Specific date</option>
                <option value="not_urgent">Not urgent</option>
              </select>
            </Field>
          </Question>
        );
      case 5:
        return (
          <Question title="Add notes and consent." description="Only share administrative notes. Do not paste document contents or sensitive ID details.">
            <Field label="Administrative notes"><textarea value={draft.administrativeNotes} onChange={(event) => update("administrativeNotes", event.target.value)} className="input min-h-28" /></Field>
            <label className="flex items-start gap-3 rounded-lg border border-silver p-4 text-sm text-slateDeep">
              <input type="checkbox" checked={draft.consentAccepted} onChange={(event) => update("consentAccepted", event.target.checked)} className="mt-1" />
              I agree to the Privacy Policy and Terms.
            </label>
          </Question>
        );
      default:
        return <Review draft={draft} />;
    }
  }, [availabilityLoading, availabilityMessage, draft, slots, step]);

  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[300px_1fr]">
        <aside className="hidden bg-navy p-8 text-white lg:block">
          <Brand dark />
          <h1 className="mt-12 text-3xl font-semibold leading-tight">Remote Online Notary Appointments Made Simple</h1>
          <div className="mt-12 space-y-7 text-sm text-white/78">
            <Assurance icon={icons.lock} title="Privacy first" body="No document contents or sensitive ID details are collected." />
            <Assurance icon={icons.user} title="Human review" body="Every request is reviewed by a commissioned notary." />
            <Assurance icon={icons.fileCheck} title="Clear preparation" body="Know what to have ready before the session." />
          </div>
        </aside>
        <section className="mx-auto w-full max-w-4xl px-5 py-7 lg:px-10">
          <div className="flex items-center justify-between">
            <Brand />
            <span className="text-xs font-semibold text-slateDeep">Draft saved locally</span>
          </div>
          <div className="mt-8">
            <div className="h-2 rounded-full bg-silver">
              <div className="h-2 rounded-full bg-emeraldAction transition-all" style={{ width: `${progress}%` }} />
            </div>
            <ol className="mt-4 hidden grid-cols-7 gap-2 text-xs font-semibold text-slateDeep md:grid" aria-label="Booking progress">
              {steps.map((label, index) => (
                <li key={label} className={index <= step ? "text-navy" : ""}>{index + 1}. {label}</li>
              ))}
            </ol>
          </div>
          <div className="mt-8 flex gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-navy text-2xl font-semibold text-white">A</div>
            <div>
              <p className="font-semibold text-navy">Hi, I&rsquo;m Ava, Avenseal&rsquo;s virtual booking assistant.</p>
              <p className="mt-1 text-sm leading-6 text-slateDeep">I&rsquo;ll help you prepare and request a remote online notary appointment.</p>
            </div>
          </div>
          <div className="mt-6 rounded-lg border border-silver bg-mist p-4 text-sm font-semibold leading-6 text-navy">
            Do not sign your document until instructed by the notary. Every request is subject to review before the appointment is confirmed.
          </div>
          <div className="mt-6 rounded-lg border border-silver bg-white p-6 shadow-quiet">
            {stepContent}
            {error && <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
            <div className="mt-8 flex items-center justify-between gap-4">
              <Button variant="secondary" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0}>Back</Button>
              {step === steps.length - 1 ? (
                <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting..." : "Submit Request"}</Button>
              ) : (
                <Button onClick={next}>Next</Button>
              )}
            </div>
          </div>
        </section>
      </div>
      <style jsx global>{`
        .input {
          min-height: 44px;
          width: 100%;
          border-radius: 6px;
          border: 1px solid #d9e2ec;
          background: #fff;
          padding: 0.65rem 0.8rem;
          color: #102a43;
          font-size: 0.95rem;
          outline: none;
        }
        .input:focus-visible {
          border-color: #2bb673;
          box-shadow: 0 0 0 3px rgba(43, 182, 115, 0.18);
        }
        .input:disabled {
          background: #f5f8fb;
          color: #6b7c8f;
        }
      `}</style>
    </main>
  );
}

function formatSlot(slot: string) {
  const [hours, minutes] = slot.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-navy">{label}</span>
      {children}
    </label>
  );
}

function Question({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-navy">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slateDeep">{description}</p>
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}

function Choice({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-navy">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Yes", true],
          ["No", false],
          ["I'm not sure", null]
        ].map(([text, next]) => (
          <button
            key={text as string}
            type="button"
            onClick={() => onChange(next as boolean | null)}
            className={`focus-ring rounded-md border px-4 py-3 text-sm font-semibold ${(value === next || (value === null && next === null)) ? "border-emeraldAction bg-emeraldAction/10 text-navy" : "border-silver text-slateDeep"}`}
          >
            {text as string}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Review({ draft }: { draft: Draft }) {
  const rows = [
    ["Full name", draft.fullName],
    ["Email", draft.email],
    ["Mobile phone", draft.mobilePhone],
    ["Document category", categories.find(([value]) => value === draft.documentCategory)?.[1] ?? draft.documentCategory],
    ["Documents", String(draft.documentCount)],
    ["Signers", String(draft.signerCount)],
    ["Estimated notarizations", draft.notarizationsNotSure ? "I'm not sure" : String(draft.estimatedNotarizations)],
    ["Witness lines appear", draft.hasWitnessLines === null ? "I'm not sure" : draft.hasWitnessLines ? "Yes" : "No"],
    ["Witnesses already available", draft.witnessesAvailable === null ? "I'm not sure" : draft.witnessesAvailable ? "Yes" : "No"],
    ["Signer location", draft.signerLocation],
    ["Government-issued ID ready", draft.allSignersHaveGovernmentId ? "Yes" : "No"],
    ["Requested appointment time", `${draft.preferredDate} at ${draft.preferredTime}`],
    ["Urgency", draft.urgency.replaceAll("_", " ")]
  ];
  return (
    <Question title="Review your request." description="Please review your information before submitting.">
      <dl className="divide-y divide-silver rounded-lg border border-silver">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-2 p-4 sm:grid-cols-[220px_1fr]">
            <dt className="text-sm font-semibold text-slateDeep">{label}</dt>
            <dd className="text-sm font-medium text-navy">{value}</dd>
          </div>
        ))}
      </dl>
    </Question>
  );
}

function Assurance({ icon: Icon, title, body }: { icon: typeof icons.lock; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <Icon className="mt-1 text-emeraldAction" size={22} strokeWidth={1.7} />
      <div>
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mt-1 leading-6">{body}</p>
      </div>
    </div>
  );
}
