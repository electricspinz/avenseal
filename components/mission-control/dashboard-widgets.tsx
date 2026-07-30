import React from "react";
import Link from "next/link";
import { Bot, CircleAlert, MailWarning, UsersRound } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { MissionControlDashboard } from "@/lib/server/mission-control-dashboard";

export function CommunicationsAttentionWidget({ communications }: { communications: MissionControlDashboard["communications"] }) {
  const items = [
    { label: "Failed", value: communications.failed },
    { label: "Queued", value: communications.queued },
    { label: "Pending", value: communications.pending },
    { label: "Delivered today", value: communications.deliveredToday }
  ];
  return <AdminCard><SectionHeader id="communications-attention-heading" title="Communications requiring attention" action={<Link href="/admin/communications" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Open center</Link>} /><div className="mt-5 grid grid-cols-2 gap-3">{items.map((item) => <div key={item.label} className="rounded-md border border-silver bg-mist p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slateDeep">{item.label}</p><p className="mt-2 text-2xl font-semibold text-navy">{item.value ?? "Unavailable"}</p></div>)}</div><p className="mt-4 text-sm leading-6 text-slateDeep">Counts use the available normalized communications read model. Delivery-today and pending counts remain unavailable until their repository queries exist.</p></AdminCard>;
}

export function AutomationAttentionWidget({ automation }: { automation: MissionControlDashboard["automation"] }) {
  const items = [
    { label: "Manual review", value: automation.manualReview },
    { label: "Skipped", value: automation.skipped },
    { label: "Duplicate blocked", value: automation.duplicateBlocked },
    { label: "Recent failures", value: automation.recentFailures }
  ];
  return <AdminCard><SectionHeader id="automation-attention-heading" title="Automation attention" /><div className="mt-5 flex gap-3"><Bot className="mt-0.5 shrink-0 text-slateDeep" size={20} aria-hidden="true" /><p className="text-sm leading-6 text-slateDeep">Automation audit records are not yet available through a repository-owned dashboard query. No execution controls are shown.</p></div><div className="mt-4 grid grid-cols-2 gap-3">{items.map((item) => <div key={item.label} className="rounded-md border border-silver bg-mist p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slateDeep">{item.label}</p><p className="mt-2 text-xl font-semibold text-navy">{item.value ?? "Unavailable"}</p></div>)}</div></AdminCard>;
}

export function RecentCustomerActivityWidget({ timeline }: { timeline: MissionControlDashboard["timeline"] }) {
  return <AdminCard><SectionHeader id="customer-activity-heading" title="Recent customer activity" action={<Link href="/admin/customers" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Open customers</Link>} />{timeline.available ? <div className="mt-5 flex gap-3 text-sm text-slateDeep"><UsersRound size={18} aria-hidden="true" />Customer timeline activity is available.</div> : <MissionControlEmptyState>{timeline.message}</MissionControlEmptyState>}</AdminCard>;
}

export function RecentTimelineActivityWidget({ timeline }: { timeline: MissionControlDashboard["timeline"] }) {
  return <AdminCard><SectionHeader id="timeline-activity-heading" title="Recent timeline activity" />{timeline.available ? <div className="mt-5 flex gap-3 text-sm text-slateDeep"><MailWarning size={18} aria-hidden="true" />Timeline events are available.</div> : <MissionControlEmptyState>{timeline.message}</MissionControlEmptyState>}</AdminCard>;
}

export function DashboardErrorState() { return <section role="alert" className="rounded-lg border border-silver bg-white p-5"><div className="flex gap-3"><CircleAlert className="mt-0.5 text-amber-900" aria-hidden="true" /><div><h1 className="text-2xl font-semibold text-navy">Mission Control is unavailable</h1><p className="mt-2 text-sm leading-6 text-slateDeep">We couldn’t load the dashboard right now. No operational actions were taken.</p></div></div></section>; }
