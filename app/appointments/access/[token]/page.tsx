import { ButtonLink } from "@/components/button";
import { ClientPortalHome } from "@/components/client-portal/client-portal-home";
import { ClientPaymentCard } from "@/components/client-portal/client-payment-card";
import { PublicShell } from "@/components/public-shell";
import { queryClientPortal } from "@/lib/server/client-portal";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppointmentAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await queryClientPortal(token);

  if (!portal) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-3xl px-5 py-20 text-center lg:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-navy">We couldn’t open this appointment</h1>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-slateDeep">
            The link may be incomplete, expired, or no longer active.
          </p>
          <div className="mt-8">
            <ButtonLink href="/appointments/access/request">Request a New Link</ButtonLink>
          </div>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <ClientPortalHome portal={portal} paymentCard={<ClientPaymentCard token={token} payment={portal.payment} />} externalSessionLaunchPath={`/api/appointments/access/${encodeURIComponent(token)}/external-session/launch`} />
    </PublicShell>
  );
}
