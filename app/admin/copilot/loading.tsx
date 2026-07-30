import { AdminShell } from "@/components/admin-shell";

export default function AvenCopilotLoading() { return <AdminShell active="Aven"><div role="status" aria-label="Loading Aven operations brief" className="space-y-6"><div className="h-64 animate-pulse rounded-lg bg-silver/60 motion-reduce:animate-none" /><div className="h-40 animate-pulse rounded-lg bg-silver/60 motion-reduce:animate-none" /></div></AdminShell>; }
