import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Answers to common questions about requesting, preparing for, and attending an Avenseal remote online notary appointment.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Avenseal Frequently Asked Questions",
    description: "Common questions about remote online notary appointment requests and preparation.",
    url: "/faq"
  },
  twitter: {
    card: "summary",
    title: "Avenseal Frequently Asked Questions",
    description: "Common questions about remote online notary appointment requests and preparation."
  }
};

const questions = [
  ["Can Avenseal tell me what notarial act I need?", "No. The software does not select notarial acts, certificates, or provide legal advice."],
  ["Should I sign before the appointment?", "No. Do not sign your document until instructed by the notary."],
  ["How is identity verification completed?", "Identity verification occurs through the online notarization provider as part of preparing for the remote session."],
  ["Does Avenseal conduct the notarization session?", "No. Avenseal coordinates appointment requests, payment, and preparation. The remote notarization session is hosted by the online notarization provider and completed with a commissioned notary."],
  ["Does Avenseal guarantee notarization?", "No. A commissioned notary reviews each request and makes all notarial determinations during the session."]
];

export default function FAQPage() {
  return (
    <PublicShell>
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
