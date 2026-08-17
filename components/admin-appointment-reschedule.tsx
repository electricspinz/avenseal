"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";

const terminalStatuses = new Set(["cancelled", "declined", "completed", "no_show"]);

export function AdminAppointmentReschedule({ appointment }: { appointment: { id: string; preferredDate: string; preferredTime: string; status: string; timezone: string } }) {
  const router = useRouter();
  const [preferredDate, setPreferredDate] = useState(appointment.preferredDate);
  const [preferredTime, setPreferredTime] = useState(appointment.preferredTime);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const unavailable = terminalStatuses.has(appointment.status);

  async function submit() {
    if (!confirmed || pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointment.id)}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredDate, preferredTime })
      });
      if (!response.ok) {
        setMessage("The appointment could not be rescheduled. Review the selected slot and try again.");
        return;
      }
      const payload = await response.json().catch(() => null) as { calendarSyncStatus?: string } | null;
      setMessage(payload?.calendarSyncStatus === "failed"
        ? "Appointment rescheduled. Calendar synchronization will retry; reminders have been updated."
        : "Appointment rescheduled. Calendar and reminders are being updated.");
      router.refresh();
    } catch {
      setMessage("The appointment could not be rescheduled. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <section className="rounded-lg border border-silver bg-white p-5 shadow-sm" aria-labelledby="reschedule-heading">
    <h2 id="reschedule-heading" className="text-xl font-semibold text-navy">Reschedule appointment</h2>
    <p className="mt-2 text-sm leading-6 text-slateDeep">Current schedule: {appointment.preferredDate} at {appointment.preferredTime} ({appointment.timezone}). Calendar and reminders will be updated after a valid reschedule.</p>
    {unavailable ? <p className="mt-4 text-sm text-slateDeep">This appointment is not eligible for rescheduling.</p> : <div className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-navy">New date<input type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-silver px-3" disabled={pending} /></label>
        <label className="block text-sm font-semibold text-navy">New time<input type="time" value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-silver px-3" disabled={pending} /></label>
      </div>
      <label className="flex items-start gap-3 text-sm text-slateDeep"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} className="mt-1" /><span>I confirm this changes the customer’s appointment schedule and updates Calendar and reminders.</span></label>
      <Button onClick={submit} disabled={!confirmed || pending}>{pending ? "Rescheduling…" : "Confirm reschedule"}</Button>
    </div>}
    {message ? <p role="status" className="mt-3 text-sm font-semibold text-slateDeep">{message}</p> : null}
  </section>;
}

