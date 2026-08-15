import React from "react";
import { PublicShell } from "@/components/public-shell";
import { TrackedScheduleAppointmentButtonLink } from "@/components/tracked-schedule-appointment-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Understand how to request an Avenseal appointment, complete provider identity verification, and join a commissioned notary online.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How Remote Online Notary Appointments Work",
    description: "Request an appointment, complete identity verification with the online notarization provider, and meet with a commissioned notary.",
    url: "/how-it-works",
    images: [{ url: "/brand/avenseal-og-social.png", width: 1734, height: 907, alt: "Avenseal — Trust Every Signature." }]
  },
  twitter: {
    card: "summary_large_image",
    title: "How Remote Online Notary Appointments Work",
    description: "Request an appointment, complete identity verification with the online notarization provider, and meet with a commissioned notary.",
    images: ["/brand/avenseal-og-social.png"]
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
        <section className="mt-12 rounded-lg border border-silver bg-mist p-6 sm:p-8" aria-labelledby="what-youll-need">
          <h2 id="what-youll-need" className="text-2xl font-semibold text-navy">What you&apos;ll need</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slateDeep">
            <li>• The document you plan to have notarized.</li>
            <li>• A government-issued photo ID, if required by the online notarization provider or commissioned notary.</li>
            <li>• A device with a camera and microphone, plus a reliable internet connection.</li>
            <li>• A document that has not been signed yet, unless the commissioned notary instructs you otherwise.</li>
          </ul>
        </section>
        <TrackedScheduleAppointmentButtonLink href="/book" location="how_it_works" className="mt-10">Schedule Appointment</TrackedScheduleAppointmentButtonLink>
      </section>
    </PublicShell>
  );
}
