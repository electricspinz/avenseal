import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/button";

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">How It Works</h1>
        <div className="mt-10 space-y-8">
          {[
            ["Request an appointment", "Tell us the basic administrative details needed to prepare for review."],
            ["A notary reviews your request", "A commissioned notary will review your request and make all notarial determinations during the session."],
            ["Meet online", "Join from a quiet, well-lit location with your government-issued ID ready."]
          ].map(([title, body], index) => (
            <div key={title} className="border-l-2 border-emeraldAction pl-6">
              <p className="text-sm font-semibold text-slateDeep">Step {index + 1}</p>
              <h2 className="mt-1 text-2xl font-semibold text-navy">{title}</h2>
              <p className="mt-2 text-lg leading-8 text-slateDeep">{body}</p>
            </div>
          ))}
        </div>
        <ButtonLink href="/book" className="mt-10">Schedule Appointment</ButtonLink>
      </section>
    </PublicShell>
  );
}

