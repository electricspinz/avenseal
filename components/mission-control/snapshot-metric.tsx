import { AdminCard } from "@/components/admin-shell";

export function SnapshotMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <AdminCard className="p-4">
      <p className="text-sm font-semibold text-slateDeep">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-navy">{value ?? "Unavailable"}</p>
    </AdminCard>
  );
}
