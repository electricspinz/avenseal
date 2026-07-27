import { CalendarDays, MessageSquareMore, Settings2, Waypoints } from "lucide-react";
import { ButtonLink } from "@/components/button";

const actions = [
  { href: "/admin/appointments", label: "Review appointments", Icon: CalendarDays },
  { href: "/admin/settings", label: "Open settings", Icon: Settings2 },
  { href: "/admin/settings", label: "Communication settings", Icon: MessageSquareMore },
  { href: "/admin/settings/integrations", label: "Integration settings", Icon: Waypoints }
];

export function QuickActions() {
  return (
    <section className="mt-8" aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="text-xl font-semibold text-navy">Quick actions</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map(({ href, label, Icon }, index) => (
          <ButtonLink key={label} href={href} variant={index === 0 ? "primary" : "secondary"} className="gap-2 px-4"><Icon size={17} aria-hidden="true" />{label}</ButtonLink>
        ))}
      </div>
    </section>
  );
}
