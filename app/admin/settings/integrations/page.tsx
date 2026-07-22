import { AdminCard, AdminShell } from "@/components/admin-shell";
import { Button, ButtonLink } from "@/components/button";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  gmail_smtp: "Gmail SMTP"
};

const resultMessages: Record<string, string> = {
  connected: "Google Calendar is connected.",
  disconnected: "Google Calendar was disconnected.",
  denied: "Google authorization was not approved.",
  invalid_callback: "Google returned an incomplete callback.",
  invalid_state: "Google connection state expired or could not be verified.",
  not_configured: "Google OAuth is not configured for this environment.",
  unauthorized: "You are not authorized to manage Google Calendar.",
  error: "Google Calendar could not be connected. Try again."
};

export default async function IntegrationsPage({ searchParams }: { searchParams?: Promise<{ google?: string }> }) {
  const params = await searchParams;
  const integrations = await repository.listIntegrations();
  const googleMessage = params?.google ? resultMessages[params.google] : null;
  return (
    <AdminShell active="Settings">
      <h1 className="text-3xl font-semibold text-navy">Integrations</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slateDeep">
        Owner/admin controls for production integrations. Credentials remain server-side and are never displayed here.
      </p>
      {googleMessage && (
        <p className="mt-4 rounded-md border border-silver bg-white p-3 text-sm font-semibold text-slateDeep" role="status">
          {googleMessage}
        </p>
      )}
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
            {integration.provider === "google_calendar" ? (
              <div className="mt-5 space-y-3">
                <p className="rounded-md bg-mist p-3 text-xs font-semibold leading-5 text-slateDeep">
                  Calendar access uses Google OAuth and stores tokens encrypted server-side. Static Google access tokens are deprecated.
                </p>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/api/admin/integrations/google/connect" variant={integration.status === "connected" ? "secondary" : "primary"} className="px-4">
                    {integration.status === "connected" ? "Reconnect" : "Connect Google"}
                  </ButtonLink>
                  {integration.status !== "disconnected" && (
                    <form action="/api/admin/integrations/google/disconnect" method="post">
                      <Button type="submit" variant="ghost" className="px-4">Disconnect</Button>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-5 rounded-md bg-mist p-3 text-xs font-semibold leading-5 text-slateDeep">
                Connect, reconnect, and disconnect actions require provider credentials in the deployment environment.
              </p>
            )}
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
