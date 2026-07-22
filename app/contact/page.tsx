import { PublicShell } from "@/components/public-shell";

export default function ContactPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-semibold text-navy">Contact</h1>
        <p className="mt-5 text-lg leading-8 text-slateDeep">
          For launch, contact details are placeholders pending business approval.
        </p>
        <div className="mt-8 rounded-lg border border-silver p-6 text-slateDeep">
          <p>Email: hello@avenseal.com</p>
          <p className="mt-2">Phone: (407) 555-0100</p>
        </div>
      </section>
    </PublicShell>
  );
}

