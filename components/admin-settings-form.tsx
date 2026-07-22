"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { weekdays } from "@/lib/availability";
import type { BusinessMode, OrganizationSettings } from "@/lib/types";

type DayState = {
  open: boolean;
  startTime: string;
  endTime: string;
};

export function AdminSettingsForm({ settings }: { settings: OrganizationSettings }) {
  const service = settings.services[0];
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<DayState[]>(() =>
    weekdays.map((_, weekday) => {
      const interval = settings.intervals.find((item) => item.weekday === weekday);
      return {
        open: Boolean(interval),
        startTime: interval?.startTime ?? "09:30",
        endTime: interval?.endTime ?? "18:00"
      };
    })
  );
  const [form, setForm] = useState({
    businessName: settings.business.businessName,
    supportEmail: settings.business.supportEmail,
    supportPhone: settings.business.supportPhone,
    website: settings.business.website ?? "",
    description: settings.business.description ?? "",
    timezone: settings.business.timezone,
    businessMode: settings.business.businessMode ?? "solo",
    defaultDeliveryMethod: settings.business.defaultDeliveryMethod ?? "remote_online_notarization",
    pricingHeadline: settings.business.pricingHeadline,
    pricingNote: settings.business.pricingNote,
    defaultDurationMinutes: settings.rules.defaultDurationMinutes,
    bufferBeforeMinutes: settings.rules.bufferBeforeMinutes ?? "",
    bufferAfterMinutes: settings.rules.bufferAfterMinutes ?? "",
    minimumBookingNoticeMinutes: settings.rules.minimumBookingNoticeMinutes ?? "",
    maximumAdvanceBookingDays: settings.rules.maximumAdvanceBookingDays ?? "",
    sameDayEnabled: settings.rules.sameDayEnabled,
    maximumAppointmentsPerDay: settings.rules.maximumAppointmentsPerDay ?? "",
    customerReschedulingEnabled: settings.rules.customerReschedulingEnabled ?? false,
    customerCancellationEnabled: settings.rules.customerCancellationEnabled ?? false,
    emergencyAppointmentEnabled: settings.rules.emergencyAppointmentEnabled ?? false,
    automaticApprovalEnabled: settings.rules.automaticApprovalEnabled,
    serviceCustomerName: service?.customerName ?? "Remote online notarization appointment",
    serviceDescription: service?.description ?? "",
    serviceBasePriceCents: service?.basePriceCents ?? "",
    serviceCurrency: service?.currency ?? "USD",
    serviceActive: service?.isActive ?? true,
    senderName: settings.communications.senderName,
    replyToEmail: settings.communications.replyToEmail ?? "",
    communicationSupportPhone: settings.communications.supportPhone ?? "",
    emailRemindersEnabled: settings.communications.emailRemindersEnabled,
    smsRemindersEnabled: settings.communications.smsRemindersEnabled,
    reviewRequestsEnabled: settings.communications.reviewRequestsEnabled,
    confirmationMessagingEnabled: settings.communications.confirmationMessagingEnabled,
    conciergeEnabled: settings.concierge.conciergeEnabled,
    conciergeDisplayName: settings.concierge.displayName,
    conciergeGreeting: settings.concierge.greeting,
    conciergeTonePreset: settings.concierge.tonePreset,
    conciergeEscalationMessage: settings.concierge.escalationMessage,
    humanSupportDestination: settings.concierge.humanSupportDestination ?? "",
    bookingAssistanceEnabled: settings.concierge.bookingAssistanceEnabled,
    faqAssistanceEnabled: settings.concierge.faqAssistanceEnabled
  });

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const modeCopy = useMemo(() => {
    if (form.businessMode === "solo") return "One primary notary, one primary schedule, organization-level pricing and communications.";
    if (form.businessMode === "team") return "Prepared for multiple notaries, assignment, and role-based operations. Full team scheduling is deferred.";
    return "Prepared for locations, advanced roles, policies, reporting, and custom branding. Enterprise hierarchy is deferred.";
  }, [form.businessMode]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage("");
    setError("");
  }

  function updateDay(index: number, next: Partial<DayState>) {
    setDays((current) => current.map((day, dayIndex) => (dayIndex === index ? { ...day, ...next } : day)));
    setDirty(true);
    setMessage("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        intervals: days
          .map((day, weekday) => ({ ...day, weekday }))
          .filter((day) => day.open)
          .map((day) => ({ weekday: day.weekday, startTime: day.startTime, endTime: day.endTime, displayOrder: 0 }))
      })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error ?? "Settings could not be saved.");
      return;
    }
    setDirty(false);
    setMessage("Settings saved. Important configuration changes are recorded in the audit log.");
  }

  return (
    <div className="space-y-6">
      <Section title="Business Profile" description="Organization-level identity used by the customer experience and future SaaS tenant model.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Business display name"><input className="admin-input" value={form.businessName} onChange={(event) => update("businessName", event.target.value)} /></Field>
          <Field label="Business email"><input type="email" className="admin-input" value={form.supportEmail} onChange={(event) => update("supportEmail", event.target.value)} /></Field>
          <Field label="Business phone"><input className="admin-input" value={form.supportPhone} onChange={(event) => update("supportPhone", event.target.value)} /></Field>
          <Field label="Website"><input className="admin-input" value={form.website} onChange={(event) => update("website", event.target.value)} /></Field>
          <Field label="Timezone"><input className="admin-input" value={form.timezone} onChange={(event) => update("timezone", event.target.value)} /></Field>
          <Field label="Delivery method">
            <select className="admin-input" value={form.defaultDeliveryMethod} onChange={(event) => update("defaultDeliveryMethod", event.target.value as "remote_online_notarization")}>
              <option value="remote_online_notarization">Remote Online Notarization</option>
            </select>
          </Field>
          <Field label="Customer-facing description"><textarea className="admin-input min-h-24 lg:col-span-2" value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Business Mode" description={modeCopy}>
        <div className="grid gap-3 md:grid-cols-3">
          {(["solo", "team", "enterprise"] as BusinessMode[]).map((mode) => (
            <label key={mode} className="rounded-lg border border-silver p-4 text-sm font-semibold text-navy">
              <input className="mr-2" type="radio" checked={form.businessMode === mode} onChange={() => update("businessMode", mode)} />
              {mode[0].toUpperCase() + mode.slice(1)}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Hours and Availability" description="Avenseal-specific operating hours. The data model supports multiple intervals per weekday later.">
        <div className="divide-y divide-silver rounded-lg border border-silver">
          {days.map((day, index) => (
            <div key={weekdays[index]} className="grid gap-3 p-4 md:grid-cols-[150px_120px_1fr] md:items-center">
              <label className="flex items-center gap-2 text-sm font-semibold text-navy">
                <input type="checkbox" checked={day.open} onChange={(event) => updateDay(index, { open: event.target.checked })} />
                {weekdays[index]}
              </label>
              <span className="text-sm font-semibold text-slateDeep">{day.open ? "Open" : "Closed"}</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <input aria-label={`${weekdays[index]} opening time`} type="time" className="admin-input" disabled={!day.open} value={day.startTime} onChange={(event) => updateDay(index, { startTime: event.target.value })} />
                <input aria-label={`${weekdays[index]} closing time`} type="time" className="admin-input" disabled={!day.open} value={day.endTime} onChange={(event) => updateDay(index, { endTime: event.target.value })} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Appointment Rules" description="Undecided operational settings are left empty instead of silently assumed. Manual review remains required.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Default duration, minutes"><input type="number" className="admin-input" value={form.defaultDurationMinutes} onChange={(event) => update("defaultDurationMinutes", Number(event.target.value))} /></Field>
          <Field label="Buffer before, minutes"><input type="number" className="admin-input" value={form.bufferBeforeMinutes} onChange={(event) => update("bufferBeforeMinutes", event.target.value)} /></Field>
          <Field label="Buffer after, minutes"><input type="number" className="admin-input" value={form.bufferAfterMinutes} onChange={(event) => update("bufferAfterMinutes", event.target.value)} /></Field>
          <Field label="Minimum notice, minutes"><input type="number" className="admin-input" value={form.minimumBookingNoticeMinutes} onChange={(event) => update("minimumBookingNoticeMinutes", event.target.value)} /></Field>
          <Field label="Advance window, days"><input type="number" className="admin-input" value={form.maximumAdvanceBookingDays} onChange={(event) => update("maximumAdvanceBookingDays", event.target.value)} /></Field>
          <Field label="Max appointments/day"><input type="number" className="admin-input" value={form.maximumAppointmentsPerDay} onChange={(event) => update("maximumAppointmentsPerDay", event.target.value)} /></Field>
        </div>
        <Toggle label="Same-day appointments enabled" checked={form.sameDayEnabled} onChange={(value) => update("sameDayEnabled", value)} />
        <Toggle label="Automatic approval enabled" checked={form.automaticApprovalEnabled} onChange={(value) => update("automaticApprovalEnabled", value)} />
      </Section>

      <Section title="Services and Pricing" description="Stored in minor currency units. Stripe is intentionally not connected in this sprint.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Customer-facing service name"><input className="admin-input" value={form.serviceCustomerName} onChange={(event) => update("serviceCustomerName", event.target.value)} /></Field>
          <Field label="Base price in cents"><input type="number" className="admin-input" value={form.serviceBasePriceCents} onChange={(event) => update("serviceBasePriceCents", event.target.value)} placeholder="Needs configuration" /></Field>
          <Field label="Currency"><input className="admin-input" value={form.serviceCurrency} onChange={(event) => update("serviceCurrency", event.target.value.toUpperCase())} /></Field>
          <Toggle label="Service active" checked={form.serviceActive} onChange={(value) => update("serviceActive", value)} />
          <Field label="Pricing headline"><input className="admin-input" value={form.pricingHeadline} onChange={(event) => update("pricingHeadline", event.target.value)} /></Field>
          <Field label="Pricing note"><textarea className="admin-input min-h-24" value={form.pricingNote} onChange={(event) => update("pricingNote", event.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Communications" description="Configuration only. No email or SMS is sent by Sprint 2.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Sender name"><input className="admin-input" value={form.senderName} onChange={(event) => update("senderName", event.target.value)} /></Field>
          <Field label="Reply-to email"><input className="admin-input" value={form.replyToEmail} onChange={(event) => update("replyToEmail", event.target.value)} /></Field>
          <Field label="Support phone"><input className="admin-input" value={form.communicationSupportPhone} onChange={(event) => update("communicationSupportPhone", event.target.value)} /></Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Email reminders enabled" checked={form.emailRemindersEnabled} onChange={(value) => update("emailRemindersEnabled", value)} />
          <Toggle label="SMS reminders enabled" checked={form.smsRemindersEnabled} onChange={(value) => update("smsRemindersEnabled", value)} />
          <Toggle label="Review requests enabled" checked={form.reviewRequestsEnabled} onChange={(value) => update("reviewRequestsEnabled", value)} />
          <Toggle label="Confirmation messaging enabled" checked={form.confirmationMessagingEnabled} onChange={(value) => update("confirmationMessagingEnabled", value)} />
        </div>
      </Section>

      <Section title="AI Concierge" description="Ava settings cannot disable platform guardrails. No live AI model is connected in this sprint.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Display name"><input className="admin-input" value={form.conciergeDisplayName} onChange={(event) => update("conciergeDisplayName", event.target.value)} /></Field>
          <Field label="Tone preset">
            <select className="admin-input" value={form.conciergeTonePreset} onChange={(event) => update("conciergeTonePreset", event.target.value as typeof form.conciergeTonePreset)}>
              <option value="professional_and_warm">Professional and warm</option>
              <option value="formal">Formal</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
            </select>
          </Field>
          <Field label="Greeting"><textarea className="admin-input min-h-24" value={form.conciergeGreeting} onChange={(event) => update("conciergeGreeting", event.target.value)} /></Field>
          <Field label="Escalation message"><textarea className="admin-input min-h-24" value={form.conciergeEscalationMessage} onChange={(event) => update("conciergeEscalationMessage", event.target.value)} /></Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle label="Concierge enabled" checked={form.conciergeEnabled} onChange={(value) => update("conciergeEnabled", value)} />
          <Toggle label="Booking assistance enabled" checked={form.bookingAssistanceEnabled} onChange={(value) => update("bookingAssistanceEnabled", value)} />
          <Toggle label="FAQ assistance enabled" checked={form.faqAssistanceEnabled} onChange={(value) => update("faqAssistanceEnabled", value)} />
        </div>
      </Section>

      <Section title="Integrations" description="Future service boundaries are visible but inactive.">
        <div className="grid gap-4 md:grid-cols-3">
          {["Stripe payments", "Google Calendar", "BlueNotary"].map((name) => (
            <div key={name} className="rounded-lg border border-dashed border-silver bg-mist p-4">
              <h3 className="font-semibold text-navy">{name}</h3>
              <p className="mt-2 text-sm text-slateDeep">Coming Soon</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="sticky bottom-4 rounded-lg border border-silver bg-white p-4 shadow-quiet">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {message && <p className="text-sm font-semibold text-emeraldAction">{message}</p>}
            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
            {!message && !error && <p className="text-sm font-semibold text-slateDeep">{dirty ? "Unsaved changes" : "Settings are up to date"}</p>}
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
        </div>
      </div>
      <style jsx global>{`
        .admin-input {
          min-height: 44px;
          width: 100%;
          border-radius: 6px;
          border: 1px solid #d9e2ec;
          background: #ffffff;
          padding: 0.65rem 0.8rem;
          color: #102a43;
          outline: none;
        }
        .admin-input:focus-visible {
          border-color: #2bb673;
          box-shadow: 0 0 0 3px rgba(43, 182, 115, 0.18);
        }
        .admin-input:disabled {
          background: #f5f8fb;
          color: #66788a;
        }
      `}</style>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-silver bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-navy">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slateDeep">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-navy">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 rounded-md border border-silver px-4 text-sm font-semibold text-navy">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
