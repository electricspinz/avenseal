"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { appointmentStatusLabels, type AppointmentRequest, type AppointmentStatus } from "@/lib/types";

const statuses = Object.entries(appointmentStatusLabels) as [AppointmentStatus, string][];

export function AdminAppointmentForm({ appointment }: { appointment: AppointmentRequest }) {
  const [status, setStatus] = useState<AppointmentStatus>(appointment.status);
  const [preferredDate, setPreferredDate] = useState(appointment.preferredDate);
  const [preferredTime, setPreferredTime] = useState(appointment.preferredTime);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  async function save() {
    setMessage("");
    const response = await fetch(`/api/admin/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, preferredDate, preferredTime, note: note || undefined })
    });
    setMessage(response.ok ? "Appointment updated. Status history and audit records are created for status changes." : "Update failed.");
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-navy">Status
        <select value={status} onChange={(event) => setStatus(event.target.value as AppointmentStatus)} className="mt-2 min-h-11 w-full rounded-md border border-silver px-3">
          {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-navy">Requested date<input type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-silver px-3" /></label>
        <label className="block text-sm font-semibold text-navy">Requested time<input type="time" value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-silver px-3" /></label>
      </div>
      <label className="block text-sm font-semibold text-navy">Internal note<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-md border border-silver px-3 py-2" /></label>
      <Button onClick={save}>Save Changes</Button>
      {message && <p className="text-sm font-semibold text-slateDeep">{message}</p>}
    </div>
  );
}

