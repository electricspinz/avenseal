import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service Draft",
  description: "Avenseal’s terms-of-service draft is pending legal review and is not a final published agreement.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Avenseal Terms of Service Draft",
    description: "This terms-of-service draft is pending legal review.",
    url: "/terms"
  }
};

export default function TermsPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">Draft legal material</p>
        <h1 className="mt-3 text-5xl font-semibold text-navy">Terms of Service</h1>
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
