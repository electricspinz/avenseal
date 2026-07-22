import { PublicShell } from "@/components/public-shell";
import { StatusLinkRequestForm } from "@/components/status-link-request-form";

export default function AppointmentStatusRequestPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <h1 className="text-4xl font-semibold tracking-tight text-navy">Check Appointment Status</h1>
        <p className="mt-5 max-w-2xl leading-7 text-slateDeep">
          Enter the email and appointment reference from your booking confirmation. If we find a match, we will send a secure status link.
        </p>
        <StatusLinkRequestForm />
      </section>
    </PublicShell>
  );
}
