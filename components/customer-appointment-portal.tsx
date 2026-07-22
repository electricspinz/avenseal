import Link from "next/link";
import { AppointmentCountdown } from "@/components/appointment-countdown";
import { Brand } from "@/components/brand";
import { ButtonLink } from "@/components/button";
import { icons } from "@/components/icons";
import type { AppointmentStatus, CustomerAppointmentStatus } from "@/lib/types";
import { cn, formatDate, formatTime } from "@/lib/utils";

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return "Pending review";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

const timeline = [
  { key: "submitted", label: "Request Submitted" },
  { key: "review", label: "Under Review" },
  { key: "payment", label: "Payment Required" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" }
] as const;

function timelineIndex(status: AppointmentStatus, paymentStatus: CustomerAppointmentStatus["paymentStatus"]) {
  if (status === "completed") return 4;
  if (status === "confirmed" || status === "ready") return 3;
  if (status === "approved_pending_payment" || status === "awaiting_payment" || paymentStatus === "payment_link_created") return 2;
  if (status === "awaiting_review" || status === "clarification_needed" || status === "follow_up_required") return 1;
  return 0;
}

function statusClasses(status: AppointmentStatus) {
  if (status === "confirmed" || status === "ready" || status === "completed") return "border-emeraldAction/30 bg-emeraldAction/10 text-emerald-900";
  if (status === "approved_pending_payment" || status === "awaiting_payment") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "cancelled" || status === "declined" || status === "no_show") return "border-red-200 bg-red-50 text-red-900";
  return "border-silver bg-mist text-navy";
}

const checklist = [
  ["Government-issued ID", icons.fileCheck],
  ["Document ready", icons.file],
  ["Camera", icons.monitor],
  ["Microphone", icons.monitor],
  ["Stable internet", icons.lock],
  ["Quiet room", icons.user]
] as const;

export function CustomerAppointmentPortal({
  status,
  paymentHref,
  canPay
}: {
  status: CustomerAppointmentStatus;
  paymentHref: string;
  canPay: boolean;
}) {
  const isConfirmed = status.status === "confirmed" || status.status === "ready";
  const activeStep = timelineIndex(status.status, status.paymentStatus);
  const meetingLink: string | null = null;

  return (
    <section className="bg-white px-5 py-8 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-silver bg-white shadow-quiet">
          <div className="border-b border-silver/80 p-5 sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <Brand />
              <div className="text-left sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateDeep">Appointment reference</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-navy">{status.reference}</p>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <span className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold", statusClasses(status.status))}>
                  <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                  {status.customerStatusLabel}
                </span>
                <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-navy sm:text-5xl">
                  Your appointment request is moving forward.
                </h1>
                <p className="mt-4 max-w-2xl leading-7 text-slateDeep">
                  A commissioned notary will review your request and make all notarial determinations during the session.
                </p>
              </div>
              {canPay && (
                <ButtonLink href={paymentHref} className="min-h-14 px-7 text-base">
                  Pay & Confirm Appointment
                </ButtonLink>
              )}
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-7 p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <Detail label="Appointment" value={`${formatDate(status.preferredDate)} at ${formatTime(status.preferredTime)}`} />
                <Detail label="Timezone" value={status.timezone} />
                <Detail label="Service" value={status.serviceName} />
                <Detail label="Customer" value={status.customerName} />
                <Detail label="Business contact" value={status.businessEmail || status.businessPhone || status.businessName} />
              </div>

              <div>
                <h2 className="text-xl font-semibold text-navy">Progress</h2>
                <ol className="mt-5 grid gap-3 sm:grid-cols-5" aria-label="Appointment progress">
                  {timeline.map((step, index) => {
                    const complete = index < activeStep;
                    const current = index === activeStep;
                    return (
                      <li key={step.key} className="relative">
                        <div
                          className={cn(
                            "flex min-h-28 flex-col justify-between rounded-lg border p-4",
                            complete && "border-emeraldAction/30 bg-emeraldAction/10 text-emerald-900",
                            current && "border-navy bg-navy text-white",
                            !complete && !current && "border-silver bg-white text-slateDeep"
                          )}
                          aria-current={current ? "step" : undefined}
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-current/10">
                            {complete ? <icons.check size={18} /> : <span className="text-sm font-semibold">{index + 1}</span>}
                          </span>
                          <span className="mt-4 text-sm font-semibold leading-5">{step.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="rounded-lg bg-mist p-5 sm:p-6">
                <h2 className="text-xl font-semibold text-navy">Preparation checklist</h2>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {checklist.map(([label, Icon]) => (
                    <li key={label} className="flex items-center gap-3 text-sm font-semibold text-slateDeep">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-emeraldAction">
                        <Icon size={18} />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <aside className="border-t border-silver bg-mist/70 p-5 sm:p-7 lg:border-l lg:border-t-0">
              {isConfirmed ? (
                <div className="rounded-lg bg-white p-6 shadow-quiet">
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Appointment Confirmed</p>
                  <h2 className="mt-3 text-2xl font-semibold text-navy">You are on the calendar.</h2>
                  <div className="mt-6 space-y-4">
                    <InfoRow label="Meeting link" value={meetingLink ? <Link className="text-navy underline underline-offset-4" href={meetingLink}>Join secure session</Link> : "Meeting link will appear here when available."} />
                    <InfoRow label="Countdown" value={<AppointmentCountdown date={status.preferredDate} time={status.preferredTime} />} />
                  </div>
                </div>
              ) : canPay ? (
                <div className="rounded-lg bg-white p-6 shadow-quiet">
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slateDeep">Payment required</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-navy">{formatMoney(status.amountDueCents, status.currency)}</p>
                  <p className="mt-3 text-sm leading-6 text-slateDeep">
                    Payment confirms your requested appointment time. This does not guarantee identity verification or notarization success.
                  </p>
                  <ButtonLink href={paymentHref} className="mt-6 min-h-14 w-full text-base">
                    Pay & Confirm Appointment
                  </ButtonLink>
                  {status.paymentExpiresAt && (
                    <p className="mt-4 text-xs font-semibold text-slateDeep">
                      Link expires {new Date(status.paymentExpiresAt).toLocaleString("en-US")}.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-white p-6 shadow-quiet">
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slateDeep">Current step</p>
                  <h2 className="mt-3 text-2xl font-semibold text-navy">{status.customerStatusLabel}</h2>
                  <p className="mt-3 text-sm leading-6 text-slateDeep">
                    We will contact you if more information is needed before payment or confirmation.
                  </p>
                </div>
              )}

              <p className="mt-6 text-sm font-semibold text-slateDeep">
                Need help? <Link className="focus-ring rounded-md text-navy underline decoration-silver underline-offset-4" href="/contact">Contact Avenseal</Link>.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-silver bg-white p-5">
      <p className="text-sm font-semibold text-slateDeep">{label}</p>
      <p className="mt-2 font-semibold leading-6 text-navy">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-mist p-4">
      <p className="text-sm font-semibold text-slateDeep">{label}</p>
      <p className="mt-2 font-semibold leading-6 text-navy">{value}</p>
    </div>
  );
}
