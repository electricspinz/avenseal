import Link from "next/link";
import { AlertTriangle, BrainCircuit, CalendarDays, CheckCircle2, CircleAlert, Info, MessageSquareMore, Settings2, Waypoints } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";
import { ButtonLink } from "@/components/button";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { OperationsFeedItem, OperationsFeedViewModel } from "@/lib/server/operations-feed";

const severityIcon = { info: Info, success: CheckCircle2, warning: CircleAlert, error: AlertTriangle };
const severityClass = { info: "text-slateDeep", success: "text-emerald-800", warning: "text-amber-900", error: "text-red-800" };

export function OperationsFeedFoundation({ feed }: { feed: OperationsFeedViewModel }) {
  return (
    <AdminCard className="mt-6">
      <SectionHeader id="operations-feed-heading" title="Operations feed" />
      {feed.unavailableSources.length > 0 && <p className="mt-4 text-sm leading-6 text-slateDeep">Some activity sources are unavailable: {feed.unavailableSources.join(", ")}. Available activity is shown below.</p>}
      {feed.items.length === 0 ? <MissionControlEmptyState>No recent activity.</MissionControlEmptyState> : <ol className="mt-5 divide-y divide-silver">{feed.items.map((item) => <OperationsFeedRow key={item.id} item={item} />)}</ol>}
    </AdminCard>
  );
}

function OperationsFeedRow({ item }: { item: OperationsFeedItem }) {
  const Icon = severityIcon[item.severity];
  return <li className="flex gap-3 py-4"><Icon className={`mt-0.5 shrink-0 ${severityClass[item.severity]}`} size={18} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="font-semibold text-navy">{item.title}</p><p className="mt-1 text-sm leading-6 text-slateDeep">{item.description}{item.customerName ? ` Customer: ${item.customerName}.` : ""}</p><p className="mt-1 text-xs text-slateDeep">{formatFeedTimestamp(item.timestamp)} · {item.source}</p>{item.destinationUrl && <Link href={item.destinationUrl} className="focus-ring mt-2 inline-block text-sm font-semibold text-emeraldAction underline underline-offset-4">Open details</Link>}</div></li>;
}

function formatFeedTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

export function RecommendationsFoundation() {
  return (
    <AdminCard className="mt-6">
      <SectionHeader id="recommendations-heading" title="AI recommendations" />
      <div className="mt-5 flex gap-3 rounded-md bg-mist p-5 text-sm leading-6 text-slateDeep">
        <BrainCircuit className="mt-0.5 shrink-0 text-slateDeep" size={20} aria-hidden="true" />
        <p>No recommendation is available from the current operational data. Recommendations will appear only when they are supported by auditable evidence and a reversible action.</p>
      </div>
    </AdminCard>
  );
}

export function QuickActionFoundation() {
  const actions = [
    { href: "/admin/appointments", label: "Review appointments", Icon: CalendarDays, primary: true },
    { href: "/admin/communications", label: "Open communications", Icon: MessageSquareMore, primary: false },
    { href: "/admin/settings", label: "Open settings", Icon: Settings2, primary: false },
    { href: "/admin/settings/integrations", label: "Open integrations", Icon: Waypoints, primary: false }
  ];

  return (
    <section className="mt-8" aria-labelledby="quick-actions-heading">
      <SectionHeader id="quick-actions-heading" title="Quick actions" />
      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map((action) => (
          <ButtonLink key={action.href} href={action.href} variant={action.primary ? "primary" : "secondary"} className="min-h-11 gap-2 px-4">
            <action.Icon size={17} aria-hidden="true" />{action.label}
          </ButtonLink>
        ))}
      </div>
    </section>
  );
}
