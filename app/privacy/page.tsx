import { PublicShell } from "@/components/public-shell";

export default function PrivacyPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">Privacy Policy</h1>
        <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
          Placeholder for legal review. Do not publish as final legal policy.
        </p>
        <p className="mt-8 leading-8 text-slateDeep">
          Avenseal Milestone 1 avoids collecting Social Security numbers, full government ID numbers, ID images, bank account information, document contents, or uploaded documents.
        </p>
      </section>
    </PublicShell>
  );
}

