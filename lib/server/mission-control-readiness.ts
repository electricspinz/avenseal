import type { AppointmentRequest, PaymentStatus } from "@/lib/types";
import { calculateAppointmentReadiness, appointmentReadinessStates, type AppointmentReadinessDocument, type AppointmentReadinessExternalSession, type AppointmentReadinessState } from "@/lib/server/appointment-readiness";
import { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import { repository } from "@/lib/server/repository";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

export type MissionControlReadinessQueueItem = Readonly<{
  appointmentId: string;
  customerName: string;
  preferredDate: string;
  preferredTime: string;
  serviceName: string;
  readinessState: "ready_for_notary";
  href: string;
}>;

export type AppointmentListReadinessItem = Readonly<{
  appointmentId: string;
  state: AppointmentReadinessState;
}>;

export type MissionControlReadinessOverview = Readonly<{
  counts: Readonly<Record<AppointmentReadinessState, number>>;
  readyForNotary: readonly MissionControlReadinessQueueItem[];
}>;

type CalculatedReadinessRecord = Readonly<{
  appointment: AppointmentRequest;
  state: AppointmentReadinessState;
}>;

type PaymentSource = Readonly<{ organizationId: string; appointmentId: string; status: PaymentStatus }>;
type SessionSource = AppointmentReadinessExternalSession;

export type MissionControlReadinessDependencies = Readonly<{
  loadPaymentSources: (appointmentIds: readonly string[]) => Promise<readonly PaymentSource[]>;
  loadDocumentSources: (organizationId: string, appointmentIds: readonly string[]) => Promise<readonly AppointmentReadinessDocument[]>;
  loadSessionSources: (appointmentIds: readonly string[]) => Promise<readonly SessionSource[]>;
}>;

const dependencies: MissionControlReadinessDependencies = {
  loadPaymentSources: (appointmentIds) => repository.listPaymentReadinessSources(appointmentIds),
  loadDocumentSources: async (organizationId, appointmentIds) => {
    if (!hasSupabaseServiceConfig()) return [];
    return createAppointmentDocumentRepository(getSupabaseAdmin()).listReadinessSources(organizationId, appointmentIds);
  },
  loadSessionSources: (appointmentIds) => repository.listExternalSessionReadinessSources(appointmentIds)
};

function emptyCounts(): Record<AppointmentReadinessState, number> {
  return Object.fromEntries(appointmentReadinessStates.map((state) => [state, 0])) as Record<AppointmentReadinessState, number>;
}

function uniqueScopedAppointments(appointments: readonly AppointmentRequest[], organizationId: string) {
  const seen = new Set<string>();
  return appointments.filter((appointment) => {
    if (appointment.organizationId !== organizationId || seen.has(appointment.id)) return false;
    seen.add(appointment.id);
    return true;
  });
}

function latestPaymentsByAppointment(sources: readonly PaymentSource[], organizationId: string, appointmentIds: ReadonlySet<string>) {
  const statuses = new Map<string, PaymentStatus>();
  for (const source of sources) {
    if (source.organizationId === organizationId && appointmentIds.has(source.appointmentId) && !statuses.has(source.appointmentId)) {
      statuses.set(source.appointmentId, source.status);
    }
  }
  return statuses;
}

function documentsByAppointment(sources: readonly AppointmentReadinessDocument[], organizationId: string, appointmentIds: ReadonlySet<string>) {
  const documents = new Map<string, AppointmentReadinessDocument[]>();
  for (const source of sources) {
    if (source.organizationId !== organizationId || !appointmentIds.has(source.appointmentId)) continue;
    documents.set(source.appointmentId, [...(documents.get(source.appointmentId) ?? []), source]);
  }
  return documents;
}

function sessionsByAppointment(sources: readonly SessionSource[], organizationId: string, appointmentIds: ReadonlySet<string>) {
  const sessions = new Map<string, SessionSource>();
  for (const source of sources) {
    if (source.organizationId === organizationId && appointmentIds.has(source.appointmentId) && !sessions.has(source.appointmentId)) sessions.set(source.appointmentId, source);
  }
  return sessions;
}

/**
 * Builds a safe, read-only Mission Control projection from tenant-scoped
 * sources. The canonical Appointment Readiness engine remains the only place
 * where readiness rules are evaluated.
 */
async function calculateScopedAppointmentReadiness(
  organizationId: string,
  appointments: readonly AppointmentRequest[],
  dataSource: MissionControlReadinessDependencies = dependencies
): Promise<readonly CalculatedReadinessRecord[]> {
  const scopedAppointments = uniqueScopedAppointments(appointments, organizationId);
  const appointmentIds = scopedAppointments.map((appointment) => appointment.id);
  const appointmentIdSet = new Set(appointmentIds);
  const [paymentResult, documentResult, sessionResult] = await Promise.allSettled([
    dataSource.loadPaymentSources(appointmentIds),
    dataSource.loadDocumentSources(organizationId, appointmentIds),
    dataSource.loadSessionSources(appointmentIds)
  ]);
  const payments = latestPaymentsByAppointment(paymentResult.status === "fulfilled" ? paymentResult.value : [], organizationId, appointmentIdSet);
  const documents = documentsByAppointment(documentResult.status === "fulfilled" ? documentResult.value : [], organizationId, appointmentIdSet);
  const sessions = sessionsByAppointment(sessionResult.status === "fulfilled" ? sessionResult.value : [], organizationId, appointmentIdSet);
  const records: CalculatedReadinessRecord[] = [];

  for (const appointment of scopedAppointments) {
    const readiness = calculateAppointmentReadiness({
      organizationId,
      appointmentId: appointment.id,
      appointmentStatus: appointment.status,
      paymentStatus: payments.get(appointment.id) ?? null,
      documents: documents.get(appointment.id) ?? [],
      externalSession: sessions.get(appointment.id) ?? null
    });
    records.push({ appointment, state: readiness.state });
  }

  return records;
}

export async function getAppointmentListReadiness(
  organizationId: string,
  appointments: readonly AppointmentRequest[],
  dataSource: MissionControlReadinessDependencies = dependencies
): Promise<readonly AppointmentListReadinessItem[]> {
  const records = await calculateScopedAppointmentReadiness(organizationId, appointments, dataSource);
  return records.map((record) => ({ appointmentId: record.appointment.id, state: record.state }));
}

export async function getMissionControlReadinessOverview(
  organizationId: string,
  appointments: readonly AppointmentRequest[],
  dataSource: MissionControlReadinessDependencies = dependencies
): Promise<MissionControlReadinessOverview> {
  const records = await calculateScopedAppointmentReadiness(organizationId, appointments, dataSource);
  const counts = emptyCounts();
  const readyForNotary: MissionControlReadinessQueueItem[] = [];
  for (const record of records) {
    counts[record.state] += 1;
    if (record.state === "ready_for_notary") {
      const appointment = record.appointment;
      readyForNotary.push({
        appointmentId: appointment.id,
        customerName: appointment.customer.fullName,
        preferredDate: appointment.preferredDate,
        preferredTime: appointment.preferredTime,
        serviceName: appointment.serviceNameSnapshot ?? "Service not recorded",
        readinessState: "ready_for_notary",
        href: `/admin/appointments/${appointment.id}`
      });
    }
  }

  return { counts, readyForNotary };
}
