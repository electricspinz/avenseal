import React from "react";
import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Answers to common questions about requesting, preparing for, and attending an Avenseal remote online notary appointment.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Avenseal Frequently Asked Questions",
    description: "Common questions about remote online notary appointment requests and preparation.",
    url: "/faq",
    images: [{ url: "/brand/avenseal-og-social.png", width: 1734, height: 907, alt: "Avenseal — Trust Every Signature." }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avenseal Frequently Asked Questions",
    description: "Common questions about remote online notary appointment requests and preparation.",
    images: ["/brand/avenseal-og-social.png"]
  }
};

const questions = [
  ["Can Avenseal tell me what notarial act I need?", "No. The software does not select notarial acts, certificates, or provide legal advice."],
  ["Should I sign before the appointment?", "No. Do not sign your document until instructed by the notary."],
  ["What documents can I upload?", "You can upload one PDF, JPEG, or PNG document for your appointment. Files must be 10 MB or smaller."],
  ["What happens after I pay?", "After payment is confirmed, use the secure Client Workspace link in your appointment email to follow your appointment preparation and next steps."],
  ["Can I cancel or reschedule?", "Cancellation and rescheduling options depend on the timing and circumstances of the appointment. Please review our Terms of Service or contact Avenseal for help with an existing appointment."],
  ["What if my secure workspace link expires?", "For your protection, secure appointment links may expire or become inactive. You can request a new secure link from the appointment access page."],
  ["What technology should I have ready?", "Use a device with a camera and microphone, a reliable internet connection, and a private, well-lit location. The online notarization provider and commissioned notary may have additional requirements."],
  ["What should I prepare before my appointment?", "Have the document to be notarized and your government-issued photo ID ready if required by the provider or notary. Do not sign the document until instructed by the commissioned notary."],
  ["How is identity verification completed?", "Identity verification occurs through the online notarization provider as part of preparing for the remote session."],
  ["Does Avenseal conduct the notarization session?", "No. Avenseal coordinates appointment requests, payment, and preparation. The remote notarization session is hosted by the online notarization provider and completed with a commissioned notary."],
  ["Does Avenseal guarantee notarization?", "No. A commissioned notary reviews each request and makes all notarial determinations during the session."]
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: questions.map(([name, text]) => ({
    "@type": "Question",
    name,
    acceptedAnswer: { "@type": "Answer", text }
  }))
};

export default function FAQPage() {
  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }} />
      <section className="mx-auto max-w-4xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">FAQ</h1>
        <div className="mt-10 divide-y divide-silver rounded-lg border border-silver">
          {questions.map(([question, answer]) => (
            <details key={question} className="p-6">
              <summary className="focus-ring cursor-pointer rounded-md text-lg font-semibold text-navy">{question}</summary>
              <p className="mt-4 leading-7 text-slateDeep">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
