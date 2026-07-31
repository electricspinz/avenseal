import React from "react";
import { cn } from "@/lib/utils";
import type { AdminCommunicationStatus } from "@/lib/types";

export const communicationTypeLabels: Record<string, string> = {
  booking_confirmation: "Booking confirmation",
  appointment_confirmation: "Booking confirmation",
  appointment_reminder_24h: "24-hour reminder",
  appointment_reminder_2h: "2-hour reminder",
  appointment_followup: "Follow-up",
  appointment_review_request: "Review request",
  appointment_cancelled: "Appointment cancelled",
  appointment_rescheduled: "Appointment rescheduled",
  payment_required: "Payment required",
  payment_confirmed: "Payment confirmed",
  external_session_available: "External Session Available",
  document_replacement_requested: "Document Replacement Requested",
  documents_approved: "Documents Approved",
  appointment_updated: "Appointment updated"
};

const statusLabels: Record<AdminCommunicationStatus, string> = {
  scheduled: "Scheduled",
  ready_to_queue: "Ready to queue",
  queued: "Queued",
  sent: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled"
};

const statusStyles: Record<AdminCommunicationStatus, string> = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-900",
  ready_to_queue: "border-amber-300 bg-amber-50 text-amber-900",
  queued: "border-slate-300 bg-slate-50 text-slate-800",
  sent: "border-emerald-300 bg-emerald-50 text-emerald-900",
  failed: "border-red-300 bg-red-50 text-red-900",
  cancelled: "border-zinc-300 bg-zinc-50 text-zinc-700"
};

export function communicationTypeLabel(type: string) {
  return communicationTypeLabels[type] ?? type.replaceAll("_", " ");
}

export function CommunicationStatusBadge({ status }: { status: AdminCommunicationStatus }) {
  return <span className={cn("inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold", statusStyles[status])}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{statusLabels[status]}</span>;
}

export function formatCommunicationTime(value: string | null, timezone: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
