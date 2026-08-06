import type { Metadata } from "next";
import { ButtonLink } from "@/components/button";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "About",
  description: "Learn how Avenseal coordinates Florida remote online notary appointment requests, preparation, and secure customer access.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Avenseal",
    description: "Avenseal coordinates remote online notary appointment requests, preparation, and secure customer access.",
    url: "/about"
  }
};

export default function AboutPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-5 py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">About Avenseal</p>
        <h1 className="mt-3 text-5xl font-semibold leading-tight text-navy">A clear, customer-centered path to a remote notarization appointment.</h1>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <section className="rounded-lg border border-silver bg-white p-7">
            <h2 className="text-2xl font-semibold text-navy">What Avenseal does</h2>
            <p className="mt-4 leading-7 text-slateDeep">Avenseal helps customers find the service, request or schedule an appointment, complete payment when available, and prepare through a secure appointment workspace.</p>
          </section>
          <section className="rounded-lg border border-silver bg-mist p-7">
            <h2 className="text-2xl font-semibold text-navy">What happens in the session</h2>
            <p className="mt-4 leading-7 text-slateDeep">Identity verification and the remote notarization session take place through the online notarization provider. The notarization is completed with a commissioned notary.</p>
          </section>
        </div>
        <section className="mt-10 border-l-2 border-emeraldAction pl-6">
          <h2 className="text-2xl font-semibold text-navy">Our role is coordination, not legal advice.</h2>
          <p className="mt-3 max-w-3xl leading-7 text-slateDeep">Avenseal does not select notarial acts, certificates, or provide legal advice. A commissioned notary reviews the request and makes all notarial determinations during the session.</p>
        </section>
        <ButtonLink href="/book" className="mt-10">Request an Appointment</ButtonLink>
      </section>
    </PublicShell>
  );
}
