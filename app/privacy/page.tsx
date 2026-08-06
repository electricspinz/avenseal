import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy Draft",
  description: "Avenseal’s privacy-policy draft is pending legal review and is not a final published policy.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Avenseal Privacy Policy Draft",
    description: "This privacy-policy draft is pending legal review.",
    url: "/privacy"
  }
};

export default function PrivacyPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">Draft legal material</p>
        <h1 className="mt-3 text-5xl font-semibold text-navy">Privacy Policy</h1>
        <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
          Placeholder for legal review. Do not publish as final legal policy.
        </p>
        <p className="mt-8 leading-8 text-slateDeep">
          Final privacy disclosures, data-retention details, and customer-rights information require approved legal source text before this page can be published as a completed policy.
        </p>
      </section>
    </PublicShell>
  );
}
