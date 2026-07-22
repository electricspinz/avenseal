import { icons } from "@/components/icons";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/button";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

const trust = [
  ["Commissioned Florida Remote Online Notary", icons.user],
  ["Same-Day Appointments", icons.calendar],
  ["Secure Online Session", icons.lock],
  ["Clear Pricing", icons.tag]
] as const;

const faqs = [
  "What is a Florida remote online notary?",
  "What do I need for my appointment?",
  "How long does an appointment take?",
  "When will I receive my notarized document?"
];

const howItWorks = [
  {
    title: "Schedule",
    body: "Choose a requested appointment time that works for you. Same-day appointments may be available.",
    Icon: icons.calendar
  },
  {
    title: "Meet Online",
    body: "Join your secure online session with a commissioned Florida notary.",
    Icon: icons.monitor
  },
  {
    title: "Complete",
    body: "Review, sign, and notarize your documents during the session.",
    Icon: icons.fileCheck
  }
];

export default async function HomePage() {
  const settings = await repository.getOrganizationSettings();
  const service = settings.services.find((item) => item.internalName === "florida_remote_online_notarial_act" && item.isActive) ?? settings.services.find((item) => item.isActive);
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 md:grid-cols-[0.95fr_1.05fr] md:py-24 lg:px-8">
          <div>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.03] tracking-normal text-navy md:text-6xl">
              Need a Document Notarized Online?
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-8 text-slateDeep">
              Book a same-day appointment with a commissioned Florida remote online notary.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <ButtonLink href="/book">Schedule Appointment</ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary">How It Works</ButtonLink>
            </div>
          </div>
          <HeroSessionIllustration />
        </div>
      </section>

      <section aria-label="Trust indicators" className="border-y border-silver/70 bg-white">
        <div className="mx-auto grid max-w-7xl gap-0 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {trust.map(([label, Icon]) => (
            <div key={label} className="flex items-center gap-4 border-silver/70 py-4 sm:px-6 lg:border-r lg:first:pl-0 lg:last:border-r-0">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mist text-navy">
                <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold leading-5 text-navy">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h2 className="text-center text-4xl font-semibold text-navy">How It Works</h2>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {howItWorks.map(({ title, body, Icon }, index) => (
              <div key={title} className="text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-navy text-sm font-semibold text-white">{index + 1}</div>
                <div className="mx-auto mt-7 grid h-20 w-20 place-items-center rounded-md border border-navy/25 bg-white text-navy">
                  <Icon size={34} strokeWidth={1.6} aria-hidden="true" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-navy">{title}</h3>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slateDeep">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 md:grid-cols-2 lg:px-8">
          <div>
            <h2 className="text-4xl font-semibold leading-tight text-navy">Same-Day Appointments. Real People. Real Convenience.</h2>
            <p className="mt-5 text-lg leading-8 text-slateDeep">
              We make getting your documents notarized simple and calm. Book online, meet with a commissioned Florida remote online notary, and finish with confidence, often in just one appointment.
            </p>
            <ul className="mt-7 space-y-3 text-sm font-medium text-slateDeep">
              {["Flexible appointment windows", "No printing or scanning in many cases", "Customers can request appointments from anywhere", "Questions are reviewed by people"].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="text-emeraldAction">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-silver bg-white p-4 shadow-quiet">
            <div className="aspect-[4/3] rounded-md bg-mist p-8">
              <div className="mx-auto flex h-full max-w-md flex-col justify-between rounded-md border border-navy/20 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3 border-b border-silver pb-4">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="h-3 w-3 rounded-full bg-yellow-400" />
                  <span className="h-3 w-3 rounded-full bg-emeraldAction" />
                  <span className="ml-auto text-xs font-semibold text-slateDeep">Requested appointment time</span>
                </div>
                <div className="grid flex-1 place-items-center">
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-navy text-white">
                    <icons.user size={52} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 text-white">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-navy/85"><icons.monitor size={18} /></span>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-navy/85"><icons.lock size={18} /></span>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-emeraldAction"><icons.check size={18} /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="text-center">
            <h2 className="text-4xl font-semibold text-navy">Transparent Pricing Preview</h2>
            <p className="mt-3 text-slateDeep">{settings.business.pricingHeadline}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              [service?.customerName ?? "Remote online notarization appointment", service?.basePriceCents === null || !service ? "Needs configuration" : formatPrice(service.basePriceCents, service.currency), service?.description ?? settings.business.pricingNote],
              ["Additional notarizations", "Shown before confirmation", "Configured by organization settings later"],
              ["Witness coordination review", "Shown before confirmation", "When witness questions require review"]
            ].map(([title, line, note]) => (
              <div key={title} className="rounded-lg border border-silver bg-white p-8 text-center">
                <icons.file className="mx-auto text-navy" size={34} strokeWidth={1.5} />
                <h3 className="mt-5 text-lg font-semibold text-navy">{title}</h3>
                <p className="mt-4 text-sm font-medium text-slateDeep">{line}</p>
                <p className="mt-2 text-xs text-slateDeep/80">{note}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-slateDeep">{settings.business.pricingNote}</p>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 md:grid-cols-[1fr_0.7fr] lg:px-8">
          <div>
            <h2 className="text-3xl font-semibold text-navy">Frequently Asked Questions</h2>
            <div className="mt-7 divide-y divide-silver rounded-lg border border-silver">
              {faqs.map((question) => (
                <details key={question} className="group p-5">
                  <summary className="focus-ring cursor-pointer rounded-md text-sm font-semibold text-navy">{question}</summary>
                  <p className="mt-3 text-sm leading-6 text-slateDeep">
                    A commissioned notary will review your request and make all notarial determinations during the session.
                  </p>
                </details>
              ))}
            </div>
          </div>
          <div className="grid place-items-center rounded-lg bg-mist p-10">
            <div className="grid h-32 w-32 place-items-center rounded-md border border-navy/25 bg-white text-emeraldAction">
              <icons.fileCheck size={58} strokeWidth={1.4} />
            </div>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-7xl px-5 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-navy p-8 text-white md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Ready to get started?</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/74">Book your same-day appointment with a commissioned Florida remote online notary.</p>
            </div>
            <ButtonLink href="/book">Schedule Appointment</ButtonLink>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function HeroSessionIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute right-0 top-4 h-72 w-72 rounded-full border border-silver/80" aria-hidden="true" />
      <div className="relative rounded-lg border border-silver bg-white p-4 shadow-quiet">
        <div className="rounded-md bg-mist p-5">
          <div className="rounded-md border border-navy/15 bg-white">
            <div className="flex items-center gap-2 border-b border-silver px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emeraldAction" />
              <span className="ml-auto text-xs font-semibold text-slateDeep">Remote online session</span>
            </div>
            <div className="grid aspect-video place-items-center bg-[#eef4f8]">
              <div className="grid h-28 w-28 place-items-center rounded-full bg-navy text-white">
                <icons.user size={50} strokeWidth={1.5} />
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 border-t border-silver px-4 py-4 text-white">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-navy"><icons.monitor size={17} /></span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-navy"><icons.lock size={17} /></span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-emeraldAction"><icons.check size={17} /></span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-8 right-5 hidden w-32 rounded-lg border border-silver bg-white p-4 shadow-quiet sm:block">
        <div className="space-y-2">
          <span className="block h-2 rounded bg-silver" />
          <span className="block h-2 rounded bg-silver" />
          <span className="block h-2 w-2/3 rounded bg-silver" />
          <span className="mt-6 block h-8 rounded border border-navy/25" />
        </div>
        <span className="absolute -right-3 -top-3 grid h-8 w-8 place-items-center rounded-full bg-emeraldAction text-white">✓</span>
      </div>
    </div>
  );
}
