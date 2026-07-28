import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";
import type { AttentionItem } from "@/components/admin-dashboard/dashboard-helpers";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";

export function AttentionPanel({ items, unavailable = false }: { items: AttentionItem[]; unavailable?: boolean }) {
  return (
    <AdminCard>
      <SectionHeader id="attention-heading" title="Attention required" />
      {unavailable ? (
        <MissionControlEmptyState>Attention information is unavailable. Appointment and other available operational information remains visible.</MissionControlEmptyState>
      ) : items.length === 0 ? (
        <MissionControlEmptyState>No action is required from the available data.</MissionControlEmptyState>
      ) : (
        <ul className="mt-5 space-y-3" aria-describedby="attention-heading">
          {items.slice(0, 5).map((item, index) => (
            <li key={item.id} className={`gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 ${index >= 3 ? "hidden sm:flex" : "flex"}`}>
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-800" size={18} aria-hidden="true" />
              <p><span className="font-semibold">Standard · Configuration</span><br /><span className="font-semibold">{item.title}</span> {item.description} <Link href={item.href} className="focus-ring font-semibold underline underline-offset-4">Open settings</Link></p>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}
