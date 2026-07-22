import { AdminCard, AdminShell } from "@/components/admin-shell";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  gmail_smtp: "Gmail SMTP"
};

export default async function IntegrationsPage() {
  const integrations = await repository.listIntegrations();
  return (
    <AdminShell active="Settings">
      <h1 className="text-3xl font-semibold text-navy">Integrations</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slateDeep">
        Owner/admin controls for production integrations. Credentials remain server-side and are never displayed here.
      </p>
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {integrations.map((integration) => (
          <AdminCard key={integration.provider}>
            <h2 className="text-xl font-semibold text-navy">{labels[integration.provider] ?? integration.provider}</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Status" value={integration.status.replaceAll("_", " ")} />
              <Row label="Account" value={integration.accountLabel ?? "Not connected"} />
              <Row label="Last connected" value={integration.lastConnectedAt ? new Date(integration.lastConnectedAt).toLocaleString() : "Never"} />
              <Row label="Last sync" value={integration.lastSyncedAt ? new Date(integration.lastSyncedAt).toLocaleString() : "Never"} />
              <Row label="Error" value={integration.lastError ?? "None"} />
            </dl>
            <p className="mt-5 rounded-md bg-mist p-3 text-xs font-semibold leading-5 text-slateDeep">
              Connect, reconnect, and disconnect actions require provider credentials in the deployment environment.
            </p>
          </AdminCard>
        ))}
      </div>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-silver/70 pb-2">
      <dt className="font-semibold text-slateDeep">{label}</dt>
      <dd className="text-right font-medium capitalize text-navy">{value}</dd>
    </div>
  );
}
