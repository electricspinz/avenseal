import { PublicShell } from "@/components/public-shell";

export default function TermsPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">Terms</h1>
        <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
          Placeholder for legal review. Do not publish as final legal terms.
        </p>
        <p className="mt-8 leading-8 text-slateDeep">
          A commissioned notary will review each request and make all notarial determinations during the session. The software does not provide legal advice.
        </p>
      </section>
    </PublicShell>
  );
}

