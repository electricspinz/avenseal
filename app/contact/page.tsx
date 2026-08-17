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
    url: "/contact",
    images: [{ url: "/brand/avenseal-og-social.png", width: 1734, height: 907, alt: "Avenseal — Trust Every Signature." }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Avenseal",
    description: "Support guidance for Avenseal remote online notary appointments.",
    images: ["/brand/avenseal-og-social.png"]
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
        <section className="mt-6 rounded-lg border border-silver bg-white p-6">
          <h2 className="text-xl font-semibold text-navy">General contact</h2>
          <dl className="mt-4 space-y-3 text-sm leading-6 text-slateDeep">
            <div><dt className="font-semibold text-navy">Email</dt><dd><a className="focus-ring rounded underline" href="mailto:appointments@avenseal.com">appointments@avenseal.com</a></dd></div>
            <div><dt className="font-semibold text-navy">Phone</dt><dd><a className="focus-ring rounded underline" href="tel:+17274338565">(727) 433-8565</a></dd></div>
            <div><dt className="font-semibold text-navy">Hours</dt><dd>Monday–Friday, 9:30 AM–5:30 PM Eastern Time</dd></div>
          </dl>
        </section>
      </section>
    </PublicShell>
  );
}
