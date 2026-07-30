import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { AdminCard } from "@/components/admin-shell";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { AttentionIssue } from "@/lib/server/attention-engine";

const priorityLabel = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export function AttentionPanel({ items }: { items: readonly AttentionIssue[] }) {
  return (
    <AdminCard>
      <SectionHeader id="attention-heading" title="Attention required" />
      {items.length === 0 ? (
        <MissionControlEmptyState>No action is required from the available data.</MissionControlEmptyState>
      ) : (
        <ul className="mt-5 space-y-3" aria-describedby="attention-heading">
          {items.slice(0, 5).map((item, index) => (
            <li key={item.id} className={`gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 ${index >= 3 ? "hidden sm:flex" : "flex"}`}>
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-800" size={18} aria-hidden="true" />
              <p><span className="font-semibold">{priorityLabel[item.priority]} · {item.category}</span><br /><span className="font-semibold">{item.title}</span> {item.description} <Link href={item.href} className="focus-ring font-semibold underline underline-offset-4">{item.actionLabel}</Link></p>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}
