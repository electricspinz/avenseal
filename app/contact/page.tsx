import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Support guidance for Avenseal remote online notary appointments.",
  alternates: { canonical: "/contact" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Contact Avenseal",
    description: "Support guidance for Avenseal remote online notary appointments.",
    url: "/contact"
  },
  twitter: {
    card: "summary",
    title: "Contact Avenseal",
    description: "Support guidance for Avenseal remote online notary appointments."
  }
};

export default function ContactPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">Contact</h1>
        <p className="mt-5 text-lg leading-8 text-slateDeep">
          If you already have an appointment, use your secure appointment link to review its current status and appointment information.
        </p>
        <div className="mt-8 rounded-lg border border-silver bg-mist p-6 text-slateDeep">
          <p className="font-semibold text-navy">Appointment support</p>
          <p className="mt-2 text-sm leading-6">Use the secure link included with your appointment communications for appointment-specific help.</p>
        </div>
      </section>
    </PublicShell>
  );
}
