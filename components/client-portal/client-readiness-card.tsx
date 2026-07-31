import React from "react";
import type { CustomerReadiness } from "@/lib/server/client-portal";

const tones: Record<CustomerReadiness["tone"], string> = { neutral: "border-silver bg-mist text-slateDeep", warning: "border-amber-300 bg-amber-50 text-amber-900", success: "border-emerald-300 bg-emerald-50 text-emerald-900" };

export function ClientReadinessCard({ readiness }: { readiness: CustomerReadiness }) {
  return <section className="rounded-lg border border-silver bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold text-navy">Your Appointment Status</h2><div className={`mt-4 inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${tones[readiness.tone]}`}>{readiness.label}</div><p className="mt-3 text-sm leading-6 text-slateDeep">{readiness.explanation}</p><p className="mt-2 text-sm font-semibold leading-6 text-navy">{readiness.nextStep}</p></section>;
}
