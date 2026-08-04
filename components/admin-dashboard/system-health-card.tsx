import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";

export type HealthStatus = "healthy" | "connected" | "attention" | "needs_verification" | "manual" | "disabled" | "unconfigured" | "unavailable" | "unknown";

const statusCopy: Record<HealthStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  healthy: { label: "Healthy", className: "text-emerald-800", Icon: CheckCircle2 },
  connected: { label: "Connected", className: "text-emerald-800", Icon: CheckCircle2 },
  attention: { label: "Needs attention", className: "text-amber-900", Icon: CircleAlert },
  needs_verification: { label: "Needs verification", className: "text-amber-900", Icon: CircleAlert },
  manual: { label: "Manual workflow", className: "text-slateDeep", Icon: CircleDashed },
  disabled: { label: "Disabled", className: "text-slateDeep", Icon: CircleDashed },
  unconfigured: { label: "Not configured", className: "text-slateDeep", Icon: CircleDashed },
  unavailable: { label: "Status unavailable", className: "text-slateDeep", Icon: CircleDashed },
  unknown: { label: "Unknown", className: "text-slateDeep", Icon: CircleDashed }
};

export function SystemHealthCard({ name, status, detail, href, linkLabel = "Open settings" }: { name: string; status: HealthStatus; detail: string; href: string; linkLabel?: string }) {
  const state = statusCopy[status];
  const Icon = state.Icon;
  return (
    <AdminCard className="flex min-h-44 flex-col p-4">
      <h3 className="font-semibold text-navy">{name}</h3>
      <p className={`mt-3 flex items-center gap-2 text-sm font-semibold ${state.className}`}><Icon size={17} aria-hidden="true" />{state.label}</p>
      <p className="mt-2 text-sm leading-5 text-slateDeep">{detail}</p>
      <Link href={href} className="focus-ring mt-auto pt-4 text-sm font-semibold text-emeraldAction underline underline-offset-4">{linkLabel}</Link>
    </AdminCard>
  );
}
