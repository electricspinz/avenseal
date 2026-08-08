import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Understand how to request an Avenseal appointment, complete provider identity verification, and join a commissioned notary online.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How Remote Online Notary Appointments Work",
    description: "Request an appointment, complete identity verification with the online notarization provider, and meet with a commissioned notary.",
    url: "/how-it-works"
  },
  twitter: {
    card: "summary",
    title: "How Remote Online Notary Appointments Work",
    description: "Request an appointment, complete identity verification with the online notarization provider, and meet with a commissioned notary."
  }
};

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">How It Works</h1>
        <div className="mt-10 space-y-8">
          {[
            ["Request and schedule", "Share the administrative details needed for appointment review and select a requested time."],
            ["Complete identity verification", "Identity verification takes place with the online notarization provider before the remote session."],
            ["Join the online session", "Meet through the provider-hosted session with a commissioned notary. Bring your government-issued ID and follow the notary’s instructions."]
          ].map(([title, body], index) => (
            <div key={title} className="border-l-2 border-emeraldAction pl-6">
              <p className="text-sm font-semibold text-slateDeep">Step {index + 1}</p>
              <h2 className="mt-1 text-2xl font-semibold text-navy">{title}</h2>
              <p className="mt-2 text-lg leading-8 text-slateDeep">{body}</p>
            </div>
          ))}
        </div>
        <ButtonLink href="/book" className="mt-10">Request an Appointment</ButtonLink>
      </section>
    </PublicShell>
  );
}
