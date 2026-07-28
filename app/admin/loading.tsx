import { AdminShell } from "@/components/admin-shell";

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-silver/60 motion-reduce:animate-none ${className}`} aria-hidden="true" />;
}

export default function AdminDashboardLoading() {
  return (
    <AdminShell active="Dashboard">
      <div role="status" aria-label="Loading Mission Control" className="space-y-8">
        <div className="space-y-3"><Skeleton className="h-9 w-52" /><Skeleton className="h-6 w-full max-w-xl" /><Skeleton className="h-4 w-44" /></div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.9fr)]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.9fr)]"><Skeleton className="h-80" /><Skeleton className="h-48" /></div>
      </div>
    </AdminShell>
  );
}
