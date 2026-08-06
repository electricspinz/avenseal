import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Find launch contact information and support guidance for Avenseal remote online notary appointment services.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Avenseal",
    description: "Contact and support information for Avenseal remote online notary appointment services.",
    url: "/contact"
  }
};

export default function ContactPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">Contact</h1>
        <p className="mt-5 text-lg leading-8 text-slateDeep">
          Contact details will be available before public launch. If you already have an appointment, use your secure appointment link to review its current status.
        </p>
        <div className="mt-8 rounded-lg border border-silver bg-mist p-6 text-slateDeep">
          <p className="font-semibold text-navy">Launch contact information pending business approval</p>
          <p className="mt-2 text-sm leading-6">This page does not publish placeholder phone numbers or unapproved contact details.</p>
        </div>
      </section>
    </PublicShell>
  );
}
