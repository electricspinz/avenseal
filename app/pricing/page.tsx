import { PublicShell } from "@/components/public-shell";
import { TrackedMarketingLink, TrackedScheduleAppointmentButtonLink } from "@/components/tracked-schedule-appointment-link";
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
    url: "/pricing",
    images: [{ url: "/brand/avenseal-og-social.png", width: 1734, height: 907, alt: "Avenseal — Trust Every Signature." }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avenseal Pricing",
    description: "Review current pricing information for remote online notary appointment services.",
    images: ["/brand/avenseal-og-social.png"]
  }
};

export default async function PricingPage() {
  const settings = await repository.getOrganizationSettings();
  const services = settings.services.filter(hasConfiguredPrice);
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-5 py-12 sm:py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">Clear pricing before payment</p>
        <h1 className="mt-3 text-4xl font-semibold text-navy sm:text-5xl">Pricing</h1>
        <p className="mt-5 max-w-2xl text-xl leading-8 text-slateDeep">
          Review the current service price, then request an appointment when you&apos;re ready.
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
        <div className="mt-6 rounded-lg border border-silver bg-mist px-5 py-4 text-sm leading-6 text-slateDeep">
          <p className="font-semibold text-navy">What to expect</p>
          <p className="mt-1">Your total is shown before you complete secure payment. After booking, your appointment email includes a secure Client Workspace link for preparation and next steps.</p>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <TrackedScheduleAppointmentButtonLink href="/book" location="pricing" className="w-full sm:w-auto">Schedule Appointment</TrackedScheduleAppointmentButtonLink>
          <TrackedMarketingLink href="/how-it-works" cta="view_how_it_works" location="pricing" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-navy/55 bg-white px-6 text-sm font-semibold text-navy transition hover:bg-mist">
            Review how it works
          </TrackedMarketingLink>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-navy">
          <TrackedMarketingLink href="/faq" cta="view_faq" location="pricing" className="focus-ring rounded-md underline decoration-emeraldAction decoration-2 underline-offset-4 hover:text-emeraldAction">Questions about your appointment?</TrackedMarketingLink>
          <TrackedMarketingLink href="/about" cta="view_about" location="pricing" className="focus-ring rounded-md underline decoration-emeraldAction decoration-2 underline-offset-4 hover:text-emeraldAction">About Avenseal&apos;s role</TrackedMarketingLink>
        </div>
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
