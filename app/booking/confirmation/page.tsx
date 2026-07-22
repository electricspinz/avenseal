import Link from "next/link";
import { Brand } from "@/components/brand";
import { ButtonLink } from "@/components/button";
import { icons } from "@/components/icons";
import { PublicShell } from "@/components/public-shell";

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference } = await searchParams;
  const displayReference = reference?.trim() || "Sent securely by email";

  return (
    <PublicShell>
      <section className="bg-white px-5 py-16 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-silver bg-white shadow-quiet">
          <div className="border-b border-silver/80 p-6 sm:p-8">
            <Brand />
          </div>
          <div className="grid gap-0 lg:grid-cols-[1fr_0.8fr]">
            <div className="p-6 sm:p-8">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-emeraldAction/12 text-emeraldAction">
                <icons.check size={34} strokeWidth={1.8} />
              </div>
              <h1 className="mt-7 text-4xl font-semibold tracking-tight text-navy sm:text-5xl">Thank you. Your request was received.</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slateDeep">
                A commissioned notary will review your request and make all notarial determinations during the session.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/appointments/status" className="min-h-12 sm:min-w-60">Check Appointment Status</ButtonLink>
                <Link className="focus-ring inline-flex min-h-12 items-center justify-center rounded-md border border-navy/55 px-6 text-sm font-semibold text-navy sm:min-w-56" href="/how-it-works">
                  Review Preparation Steps
                </Link>
              </div>
            </div>
            <aside className="border-t border-silver bg-mist/70 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="rounded-lg bg-white p-5 shadow-quiet">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateDeep">Appointment reference</p>
                <p className="mt-2 text-xl font-semibold text-navy">{displayReference}</p>
              </div>
              <div className="mt-4 rounded-lg bg-white p-5 shadow-quiet">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateDeep">Estimated review time</p>
                <p className="mt-2 font-semibold leading-6 text-navy">Usually within one business hour during posted availability.</p>
              </div>
              <div className="mt-4 rounded-lg bg-white p-5 shadow-quiet">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateDeep">Current status</p>
                <p className="mt-2 font-semibold leading-6 text-navy">Awaiting Review</p>
              </div>
              <p className="mt-5 text-sm leading-6 text-slateDeep">
                If email delivery is configured, we will send a secure link to check appointment status.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
