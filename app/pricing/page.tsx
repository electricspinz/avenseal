import { PublicShell } from "@/components/public-shell";
import { TrackedScheduleAppointmentButtonLink } from "@/components/tracked-schedule-appointment-link";
import { repository } from "@/lib/server/repository";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pricing",
  description: "Review the current pricing information for Avenseal remote online notary appointment services before you request an appointment.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Avenseal Pricing",
    description: "Review current pricing information for remote online notary appointment services.",
    url: "/pricing"
  },
  twitter: {
    card: "summary",
    title: "Avenseal Pricing",
    description: "Review current pricing information for remote online notary appointment services."
  }
};

export default async function PricingPage() {
  const settings = await repository.getOrganizationSettings();
  const services = settings.services.filter(hasConfiguredPrice);
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">Pricing</h1>
        <p className="mt-5 max-w-2xl text-xl leading-8 text-slateDeep">
          Current pricing is shown before payment is requested.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {services.map((service) => (
            <div key={service.id} className="rounded-lg border border-silver p-7">
              <h2 className="text-xl font-semibold text-navy">{service.customerName}</h2>
              <p className="mt-4 text-3xl font-semibold text-navy">{formatPrice(service.basePriceCents, service.currency)}</p>
              {service.description ? <p className="mt-4 text-sm leading-6 text-slateDeep">{service.description}</p> : null}
            </div>
          ))}
          {services.length === 0 && (
            <div className="rounded-lg border border-silver p-7">
              <h2 className="text-xl font-semibold text-navy">Appointment pricing</h2>
              <p className="mt-4 text-sm leading-6 text-slateDeep">Current pricing is provided before payment is requested.</p>
            </div>
          )}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-slateDeep">{settings.business.pricingNote}</p>
        <TrackedScheduleAppointmentButtonLink href="/book" location="pricing" className="mt-10">Schedule Appointment</TrackedScheduleAppointmentButtonLink>
      </section>
    </PublicShell>
  );
}

function hasConfiguredPrice(service: Awaited<ReturnType<typeof repository.getOrganizationSettings>>["services"][number]): service is Awaited<ReturnType<typeof repository.getOrganizationSettings>>["services"][number] & { basePriceCents: number } {
  return service.isActive && service.basePriceCents !== null;
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
