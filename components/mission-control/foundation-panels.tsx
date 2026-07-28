import { BrainCircuit, CalendarDays, MessageSquareMore, Settings2, Waypoints } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";
import { ButtonLink } from "@/components/button";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";

export function OperationsFeedFoundation() {
  return (
    <AdminCard className="mt-6">
      <SectionHeader id="operations-feed-heading" title="Operations feed" />
      <MissionControlEmptyState>
        A unified operations feed will appear here when a paginated event source is available. Existing appointment and communication records remain available from their operational pages.
      </MissionControlEmptyState>
    </AdminCard>
  );
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
