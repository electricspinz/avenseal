import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/button";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const settings = await repository.getOrganizationSettings();
  const services = settings.services.filter((service) => service.isActive);
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">Pricing</h1>
        <p className="mt-5 max-w-2xl text-xl leading-8 text-slateDeep">
          {settings.business.pricingHeadline}
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {services.map((service) => (
            <div key={service.id} className="rounded-lg border border-silver p-7">
              <h2 className="text-xl font-semibold text-navy">{service.customerName}</h2>
              <p className="mt-4 text-3xl font-semibold text-navy">
                {service.basePriceCents === null ? "Needs configuration" : formatPrice(service.basePriceCents, service.currency)}
              </p>
              <p className="mt-4 text-sm leading-6 text-slateDeep">{service.description ?? settings.business.pricingNote}</p>
            </div>
          ))}
          {services.length === 0 && (
            <div className="rounded-lg border border-silver p-7">
              <h2 className="text-xl font-semibold text-navy">Remote online notarization</h2>
              <p className="mt-4 text-sm leading-6 text-slateDeep">{settings.business.pricingNote}</p>
            </div>
          )}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-slateDeep">{settings.business.pricingNote}</p>
        <ButtonLink href="/book" className="mt-10">Schedule Appointment</ButtonLink>
      </section>
    </PublicShell>
  );
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
