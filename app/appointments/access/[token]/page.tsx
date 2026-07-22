import { ButtonLink } from "@/components/button";
import { CustomerAppointmentPortal } from "@/components/customer-appointment-portal";
import { PublicShell } from "@/components/public-shell";
import { repository } from "@/lib/server/repository";

export default async function AppointmentAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = await repository.getCustomerAppointmentByAccessToken(token);

  if (!status) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-3xl px-5 py-20 text-center lg:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-navy">Secure link unavailable</h1>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-slateDeep">
            This appointment status link may be expired or no longer active. You can request a fresh secure link.
          </p>
          <div className="mt-8">
            <ButtonLink href="/appointments/status">Request Status Link</ButtonLink>
          </div>
        </section>
      </PublicShell>
    );
  }

  const canPay = Boolean(status.checkoutUrl && status.paymentStatus === "payment_link_created");
  const safeStatus = { ...status, checkoutUrl: null };

  return (
    <PublicShell>
      <CustomerAppointmentPortal
        status={safeStatus}
        paymentHref={`/api/appointments/access/${encodeURIComponent(token)}/payment`}
        canPay={canPay}
      />
    </PublicShell>
  );
}
