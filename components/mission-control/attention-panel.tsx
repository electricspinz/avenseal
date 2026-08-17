"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock3 } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { AttentionIssue } from "@/lib/server/attention-engine";

const priorityLabel = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const filters = ["all", "today", "documents", "payments", "sessions", "communications"] as const;
type AttentionFilter = (typeof filters)[number];

export function AttentionPanel({ items, todayAppointmentIds = [] }: { items: readonly AttentionIssue[]; todayAppointmentIds?: readonly string[] }) {
  const [filter, setFilter] = useState<AttentionFilter>("all");
  const visibleItems = useMemo(() => items.filter((item) => matchesFilter(item, filter, todayAppointmentIds)), [filter, items, todayAppointmentIds]);
  const actionable = visibleItems.filter((item) => item.presentation !== "waiting");
  const waiting = visibleItems.filter((item) => item.presentation === "waiting");
  return (
    <AdminCard className="border-amber-200 bg-amber-50/40">
      <SectionHeader id="attention-heading" title="Needs attention" />
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter items requiring attention">
        {filters.map((option) => (
          <button key={option} type="button" onClick={() => setFilter(option)} aria-pressed={filter === option} className={`focus-ring rounded-md border px-3 py-2 text-sm font-semibold capitalize ${filter === option ? "border-navy bg-navy text-white" : "border-silver bg-white text-navy hover:border-navy"}`}>
            {filterLabel(option)}
          </button>
        ))}
      </div>
      {visibleItems.length === 0 ? (
        <MissionControlEmptyState>{filter === "all" ? "No action is required from the available data." : "No items match this filter."}</MissionControlEmptyState>
      ) : (
        <div className="mt-5 space-y-5" aria-describedby="attention-heading">
          {actionable.length > 0 ? <AttentionList title="Action required" items={actionable} /> : null}
          {waiting.length > 0 ? <AttentionList title="Waiting / processing" items={waiting} waiting /> : null}
        </div>
      )}
    </AdminCard>
  );
}

function AttentionList({ title, items, waiting = false }: { title: string; items: readonly AttentionIssue[]; waiting?: boolean }) {
  return <section aria-label={title}><h3 className="text-sm font-semibold uppercase tracking-wide text-slateDeep">{title}</h3><ul className="mt-2 divide-y divide-amber-200 border-y border-amber-200 bg-white/70">{items.map((item) => <li key={item.id} className="flex gap-3 px-3 py-3 text-sm leading-5 text-navy"><span className={`mt-0.5 shrink-0 ${waiting ? "text-slateDeep" : "text-amber-800"}`}>{waiting ? <Clock3 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}</span><div className="min-w-0 flex-1"><p className="font-semibold">{item.customerName ? `${item.customerName} · ` : ""}{item.title}</p><p className="mt-1 text-slateDeep">{item.description}</p><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slateDeep">{priorityLabel[item.priority]} priority{item.appointmentTime ? ` · ${formatTime(item.appointmentTime)}` : ""}</p></div><Link href={item.href} className="focus-ring shrink-0 self-center text-sm font-semibold text-emeraldAction underline underline-offset-4">{item.actionLabel}</Link></li>)}</ul></section>;
}

function matchesFilter(item: AttentionIssue, filter: AttentionFilter, todayAppointmentIds: readonly string[]) {
  if (filter === "all") return true;
  if (filter === "today") return Boolean(item.appointmentId && todayAppointmentIds.includes(item.appointmentId));
  if (filter === "communications") return item.category === "communications" || actionKind(item) === "session_communication_failed" || actionKind(item) === "session_communication_processing";
  if (filter === "documents") return ["waiting_for_customer_document", "waiting_for_replacement_document", "security_processing", "review_document_security", "review_uploaded_document"].includes(actionKind(item));
  if (filter === "payments") return ["review_payment", "review_payment_status"].includes(actionKind(item));
  return ["prepare_session", "review_session_communication", "session_communication_failed", "resolve_cancelled_session", "confirm_appointment_outcome"].includes(actionKind(item));
}

function actionKind(item: AttentionIssue) { const parts = item.id.split(":"); return item.id.startsWith("appointment-next-action:") ? parts[parts.length - 1] ?? "" : ""; }
function filterLabel(filter: AttentionFilter) { return filter === "all" ? "All" : filter === "today" ? "Today" : filter[0].toUpperCase() + filter.slice(1); }
function formatTime(time: string) { const match = /^(\d{2}):(\d{2})/.exec(time); if (!match) return "Time unavailable"; return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(new Date(Date.UTC(2026, 0, 1, Number(match[1]), Number(match[2])))); }
