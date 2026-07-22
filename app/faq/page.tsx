import { PublicShell } from "@/components/public-shell";

const questions = [
  ["Can Avenseal tell me what notarial act I need?", "No. The software does not select notarial acts, certificates, or provide legal advice."],
  ["Should I sign before the appointment?", "No. Do not sign your document until instructed by the notary."],
  ["Are times connected to a live calendar?", "Not in Milestone 1. You request an appointment time, and the request remains subject to review."],
  ["Does Avenseal guarantee notarization?", "No. A commissioned notary will review your request and make all notarial determinations during the session."]
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

