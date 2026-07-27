import type { ReactNode } from "react";
import { AdminCard } from "@/components/admin-shell";

export function MetricCard({ label, value, detail }: { label: string; value: number; detail?: ReactNode }) {
  return (
    <AdminCard className="p-4">
      <p className="text-sm font-semibold text-slateDeep">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-navy">{value}</p>
      {detail && <p className="mt-2 text-xs leading-5 text-slateDeep">{detail}</p>}
    </AdminCard>
  );
}
