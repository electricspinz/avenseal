import React from "react";
import { AdminCard } from "@/components/admin-shell";
import { ButtonLink } from "@/components/button";
import type { AppointmentNextAction } from "@/lib/server/appointment-next-action";

const toneClasses: Record<AppointmentNextAction["tone"], string> = { neutral: "border-zinc-300 bg-zinc-50 text-zinc-700", warning: "border-amber-300 bg-amber-50 text-amber-950", danger: "border-red-300 bg-red-50 text-red-950", success: "border-emerald-300 bg-emerald-50 text-emerald-950", info: "border-blue-300 bg-blue-50 text-blue-950" };

export function AdminAppointmentNextActionPanel({ action }: { action: AppointmentNextAction }) {
  const href = action.href ?? (action.targetId ? `#${action.targetId}` : undefined);
  return <AdminCard><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-navy">Next Action</h2><h3 className="mt-3 text-base font-semibold text-navy">{action.title}</h3><p className="mt-2 max-w-2xl text-sm text-slateDeep">{action.description}</p></div><span className={`inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClasses[action.tone]}`}>{action.title}</span></div>{action.context && <p className="mt-3 text-xs text-slateDeep">{action.context}</p>}{action.ctaLabel && href && <div className="mt-4"><ButtonLink href={href} variant="secondary">{action.ctaLabel}</ButtonLink></div>}</AdminCard>;
}
