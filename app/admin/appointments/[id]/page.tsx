import { notFound } from "next/navigation";
import { AdminAppointmentForm } from "@/components/admin-appointment-form";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { PaymentLinkButton } from "@/components/payment-link-button";
import { StatusBadge } from "@/components/status-badge";
import { repository } from "@/lib/server/repository";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appointment = await repository.getAppointment(id);
  if (!appointment) notFound();
  const history = await repository.getHistory(id);
  const notes = await repository.getNotes(id);
  const payments = await repository.listPayments(id);
  const calendarEvents = await repository.listCalendarEvents(id);
  const communications = await repository.listCommunications(id);

  return (
    <AdminShell active="Appointments">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-navy">Appointment {appointment.id}</h1>
          <p className="mt-2 text-sm text-slateDeep">Requested {formatDate(appointment.preferredDate)} at {formatTime(appointment.preferredTime)}</p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <AdminCard>
            <h2 className="text-xl font-semibold text-navy">Customer</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <Row label="Name" value={appointment.customer.fullName} />
              <Row label="Email" value={appointment.customer.email} />
              <Row label="Mobile" value={appointment.customer.mobilePhone} />
            </dl>
          </AdminCard>
          <AdminCard>
            <h2 className="text-xl font-semibold text-navy">Intake Answers</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <Row label="Service booked" value={appointment.serviceNameSnapshot ?? "Legacy appointment"} />
              <Row
                label="Booked duration"
                value={appointment.serviceDurationMinutesSnapshot
                  ? `${appointment.serviceDurationMinutesSnapshot} minutes`
                  : "Organization default (legacy)"}
              />
              <Row
                label="Booked price"
                value={
                  appointment.servicePriceCentsSnapshot !== null && appointment.serviceCurrencySnapshot
                    ? formatMoney(appointment.servicePriceCentsSnapshot, appointment.serviceCurrencySnapshot)
                    : "Not recorded"
                }
              />
              <Row label="Document category" value={appointment.documentCategory.replaceAll("_", " ")} />
              <Row label="Documents" value={String(appointment.documentCount)} />
              <Row label="Signers" value={String(appointment.signerCount)} />
              <Row label="Estimated notarizations" value={appointment.notarizationsNotSure ? "I'm not sure" : String(appointment.estimatedNotarizations)} />
              <Row label="Witness lines appear" value={appointment.hasWitnessLines === null ? "I'm not sure" : appointment.hasWitnessLines ? "Yes" : "No"} />
              <Row label="Witnesses available" value={appointment.witnessesAvailable === null ? "I'm not sure" : appointment.witnessesAvailable ? "Yes" : "No"} />
              <Row label="Signer location" value={appointment.signerLocation} />
              <Row label="Government ID ready" value={appointment.allSignersHaveGovernmentId ? "Yes" : "No"} />
              <Row label="Administrative notes" value={appointment.administrativeNotes ?? "None"} />
            </dl>
          </AdminCard>
          <AdminCard>
            <h2 className="text-xl font-semibold text-navy">Audit History</h2>
            <div className="mt-4 space-y-3 text-sm text-slateDeep">
              {history.map((entry) => (
                <p key={entry.id}><span className="font-semibold text-navy">{entry.toStatus.replaceAll("_", " ")}</span> · {new Date(entry.createdAt).toLocaleString()}</p>
              ))}
              {history.length === 0 && <p>No history yet.</p>}
            </div>
          </AdminCard>
          <AdminCard>
            <h2 className="text-xl font-semibold text-navy">Internal Notes</h2>
            <div className="mt-4 space-y-3 text-sm text-slateDeep">
              {notes.map((note) => <p key={note.id}>{note.body}</p>)}
              {notes.length === 0 && <p>No internal notes yet.</p>}
            </div>
          </AdminCard>
          <AdminCard>
            <h2 className="text-xl font-semibold text-navy">Payment</h2>
            <div className="mt-4 space-y-4 text-sm">
              {payments.map((payment) => (
                <dl key={payment.id} className="grid gap-3">
                  <Row label="Status" value={payment.status.replaceAll("_", " ")} />
                  <Row label="Amount" value={formatMoney(payment.amountCents, payment.currency)} />
                  <Row label="Payment link" value={payment.checkoutUrl ? "Created" : "Not created"} />
                  <Row label="Paid at" value={payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "Not paid"} />
                  <Row label="Stripe session" value={truncate(payment.stripeCheckoutSessionId)} />
                  <Row label="Stripe intent" value={truncate(payment.stripePaymentIntentId)} />
                </dl>
              ))}
              {payments.length === 0 && <p className="text-slateDeep">No payment record yet.</p>}
              <PaymentLinkButton appointmentId={appointment.id} />
            </div>
          </AdminCard>
          <AdminCard>
            <h2 className="text-xl font-semibold text-navy">Calendar</h2>
            <div className="mt-4 space-y-3 text-sm text-slateDeep">
              {calendarEvents.map((event) => (
                <div key={event.id} className="space-y-1">
                  <p><span className="font-semibold text-navy">{calendarStatusLabel(event.status)}</span> · {new Date(event.startsAt).toLocaleString()} · {truncate(event.providerEventId)}</p>
                  {event.meetUrl && (
                    <a className="font-semibold text-navy underline underline-offset-4" href={event.meetUrl} target="_blank" rel="noreferrer">
                      Open Google Meet
                    </a>
                  )}
                  {event.lastError && <p>Pending retry: {event.lastError}</p>}
                </div>
              ))}
              {calendarEvents.length === 0 && <p>No calendar event has been created.</p>}
            </div>
          </AdminCard>
          <AdminCard>
            <h2 className="text-xl font-semibold text-navy">Communications</h2>
            <div className="mt-4 space-y-3 text-sm text-slateDeep">
              {communications.map((message) => (
                <div key={message.id}>
                  <p><span className="font-semibold text-navy">{message.messageType.replaceAll("_", " ")}</span> · {message.status} · {message.recipientEmail}</p>
                  <p className="text-xs">Attempts: {message.attemptCount} · {message.sentAt ? `Sent ${new Date(message.sentAt).toLocaleString()}` : message.lastError ?? "Pending delivery"}</p>
                </div>
              ))}
              {communications.length === 0 && <p>No messages recorded yet.</p>}
            </div>
          </AdminCard>
        </div>
        <AdminCard>
          <h2 className="text-xl font-semibold text-navy">Status Management</h2>
          <div className="mt-5">
            <AdminAppointmentForm appointment={appointment} />
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function truncate(value: string | null) {
  if (!value) return "None";
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function calendarStatusLabel(status: string) {
  return {
    pending: "Pending Sync",
    created: "Synced",
    updated: "Synced",
    cancelled: "Removed",
    failed: "Sync Failed"
  }[status] ?? status;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-silver/70 pb-3 sm:grid-cols-[190px_1fr]">
      <dt className="font-semibold text-slateDeep">{label}</dt>
      <dd className="font-medium capitalize text-navy">{value}</dd>
    </div>
  );
}
