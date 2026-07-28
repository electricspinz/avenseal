import Link from "next/link";
import { AlertTriangle, BrainCircuit, CalendarDays, CheckCircle2, CircleAlert, Info, MessageSquareMore, Settings2, Waypoints } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";
import { ButtonLink } from "@/components/button";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { OperationsFeedItem, OperationsFeedViewModel } from "@/lib/server/operations-feed";
import type { Recommendation } from "@/lib/server/recommendation-engine";

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

export function RecommendationsFoundation({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <AdminCard className="mt-6">
      <SectionHeader id="recommendations-heading" title="AI recommendations" />
      {recommendations.length === 0 ? <div className="mt-5 flex gap-3 rounded-md bg-mist p-5 text-sm leading-6 text-slateDeep"><BrainCircuit className="mt-0.5 shrink-0 text-slateDeep" size={20} aria-hidden="true" /><p>No recommendation is available from the current operational data.</p></div> : <ol className="mt-5 space-y-4">{recommendations.slice(0, 3).map((recommendation) => <RecommendationRow key={recommendation.id} recommendation={recommendation} />)}</ol>}
    </AdminCard>
  );
}

function RecommendationRow({ recommendation }: { recommendation: Recommendation }) {
  return <li className="rounded-md bg-mist p-4"><p className="font-semibold text-navy">{recommendation.title}</p><p className="mt-1 text-sm leading-6 text-slateDeep">{recommendation.summary}</p><details className="mt-3 text-sm text-slateDeep"><summary className="focus-ring cursor-pointer font-semibold text-emeraldAction underline underline-offset-4">Why am I seeing this?</summary><p className="mt-2 leading-6">{recommendation.rationale}</p><ul className="mt-2 list-disc space-y-1 pl-5">{recommendation.evidence.map((evidence) => <li key={`${evidence.source}-${evidence.label}`}>{evidence.detail}</li>)}</ul></details>{recommendation.href && recommendation.actionLabel && <Link href={recommendation.href} className="focus-ring mt-3 inline-block text-sm font-semibold text-emeraldAction underline underline-offset-4">{recommendation.actionLabel}</Link>}</li>;
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
