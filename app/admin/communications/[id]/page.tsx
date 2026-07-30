import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { CommunicationDetail } from "@/components/communications-center";
import { CustomerTimeline } from "@/components/customer-timeline";
import { communicationTypeLabel } from "@/components/admin-communications";
import { getCommunicationsCenterItem } from "@/lib/server/communications-center";
import { repository } from "@/lib/server/repository";
import { queryAppointmentTimeline } from "@/lib/server/timeline-query";

export const dynamic = "force-dynamic";

export default async function CommunicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, settings] = await Promise.all([getCommunicationsCenterItem(id), repository.getSettings()]);
  if (!record) notFound();
  const appointment = record.appointmentId ? await repository.getAppointment(record.appointmentId) : null;
  const timeline = appointment ? await queryAppointmentTimeline({ organizationId: appointment.organizationId, appointmentId: appointment.id }) : [];

  return <AdminShell active="Communications"><Link href="/admin/communications" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Back to Communications Center</Link><header className="mt-5"><h1 className="text-3xl font-semibold text-navy">{communicationTypeLabel(record.purpose)}</h1><p className="mt-2 text-sm text-slateDeep">Communication record {record.id}</p></header><CommunicationDetail record={record} timezone={settings.business.timezone} timeline={<CustomerTimeline events={timeline} title="Related timeline" />} /></AdminShell>;
}
