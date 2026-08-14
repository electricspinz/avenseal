import type { AppointmentRequest } from "@/lib/types";
import {
  deriveAppointmentNextAction,
  type AppointmentNextAction,
  type AppointmentNextActionDocument,
} from "@/lib/server/appointment-next-action";
import {
  compareAttentionIssues,
  type AttentionIssue,
  type AttentionPriority,
} from "@/lib/server/attention-engine";
import { createAppointmentDocumentRepository } from "@/lib/server/document-repository";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";
import { repository } from "@/lib/server/repository";

export type MissionControlAppointmentAction = Readonly<{
  appointmentId: string;
  customerName: string;
  preferredDate: string;
  preferredTime: string;
  serviceName: string;
  appointmentStatus: string;
  action: AppointmentNextAction;
  attention: AttentionIssue | null;
}>;

type PaymentSource = Readonly<{ organizationId: string; appointmentId: string; status: string }>;
type SessionSource = Readonly<{ organizationId: string; appointmentId: string; status: string; launchUrl: string | null }>;
type CommunicationSource = Readonly<{ organizationId: string; appointmentId: string; messageType: string; status: string }>;
type DocumentSource = Readonly<{
  organizationId: string;
  appointmentId: string;
  status: string;
  scanStatus: string | null;
  storageStatus: string | null;
  deletedAt: string | null;
}>;

export type MissionControlNextActionDependencies = Readonly<{
  listAppointments: () => Promise<readonly AppointmentRequest[]>;
  listPaymentSources: (appointmentIds: readonly string[]) => Promise<readonly PaymentSource[]>;
  listDocumentSources: (organizationId: string, appointmentIds: readonly string[]) => Promise<readonly DocumentSource[]>;
  listSessionSources: (appointmentIds: readonly string[]) => Promise<readonly SessionSource[]>;
  listCommunicationSources: (appointmentIds: readonly string[]) => Promise<readonly CommunicationSource[]>;
}>;

const dependencies: MissionControlNextActionDependencies = {
  listAppointments: () => repository.listAppointments(),
  listPaymentSources: (appointmentIds) => repository.listPaymentReadinessSources(appointmentIds),
  listDocumentSources: async (organizationId, appointmentIds) => {
    if (!hasSupabaseServiceConfig()) return [];
    return createAppointmentDocumentRepository(getSupabaseAdmin()).listNextActionSources(organizationId, appointmentIds);
  },
  listSessionSources: (appointmentIds) => repository.listExternalSessionNextActionSources(appointmentIds),
  listCommunicationSources: (appointmentIds) => repository.listExternalSessionAvailableCommunicationSources(appointmentIds),
};

const nonAttentionActions = new Set(["no_action_required", "ready_for_appointment_review", "session_in_progress"]);

/**
 * Builds a tenant-scoped dashboard queue from the same trusted records used by
 * the appointment-level Next Action engine. Failed source reads fall back to
 * conservative inputs and therefore cannot produce a false ready state.
 */
export async function loadMissionControlAppointmentActions(
  dataSource: MissionControlNextActionDependencies = dependencies,
): Promise<readonly MissionControlAppointmentAction[]> {
  const appointments = await dataSource.listAppointments();
  if (appointments.length === 0) return [];

  const organizationId = appointments[0]?.organizationId;
  if (!organizationId) return [];
  const scopedAppointments = appointments.filter((appointment) => appointment.organizationId === organizationId);
  const appointmentIds = scopedAppointments.map((appointment) => appointment.id);
  const appointmentIdSet = new Set(appointmentIds);
  const [paymentsResult, documentsResult, sessionsResult, communicationsResult] = await Promise.allSettled([
    dataSource.listPaymentSources(appointmentIds),
    dataSource.listDocumentSources(organizationId, appointmentIds),
    dataSource.listSessionSources(appointmentIds),
    dataSource.listCommunicationSources(appointmentIds),
  ]);

  const payments = latestByAppointment(
    paymentsResult.status === "fulfilled" ? paymentsResult.value : [],
    organizationId,
    appointmentIdSet,
  );
  const documents = groupedByAppointment(
    documentsResult.status === "fulfilled" ? documentsResult.value : [],
    organizationId,
    appointmentIdSet,
  );
  const sessions = latestByAppointment(
    sessionsResult.status === "fulfilled" ? sessionsResult.value : [],
    organizationId,
    appointmentIdSet,
  );
  const communications = groupedByAppointment(
    communicationsResult.status === "fulfilled" ? communicationsResult.value : [],
    organizationId,
    appointmentIdSet,
  );

  return scopedAppointments
    .map((appointment) => {
      const payment = payments.get(appointment.id) ?? null;
      const session = sessions.get(appointment.id) ?? null;
      const action = deriveAppointmentNextAction({
        appointmentStatus: appointment.status,
        paymentStatus: payment?.status ?? null,
        documents: (documents.get(appointment.id) ?? []).map(toNextActionDocument),
        externalSession: session
          ? {
              status: session.status,
              customerVisible: hasCustomerEligibleSession(appointment, payment?.status ?? null, session),
            }
          : null,
        communications: (communications.get(appointment.id) ?? []).map((message) => ({
          messageType: message.messageType,
          status: message.status,
        })),
      });
      return {
        appointmentId: appointment.id,
        customerName: appointment.customer.fullName,
        preferredDate: appointment.preferredDate,
        preferredTime: appointment.preferredTime,
        serviceName: appointment.serviceNameSnapshot ?? "Service not recorded",
        appointmentStatus: appointment.status,
        action,
        attention: attentionFromAction(appointment, action),
      };
    })
    .sort(compareAppointmentActions);
}

function latestByAppointment<T extends { organizationId: string; appointmentId: string }>(
  sources: readonly T[],
  organizationId: string,
  appointmentIds: ReadonlySet<string>,
) {
  const values = new Map<string, T>();
  for (const source of sources) {
    if (
      source.organizationId === organizationId
      && appointmentIds.has(source.appointmentId)
      && !values.has(source.appointmentId)
    ) {
      values.set(source.appointmentId, source);
    }
  }
  return values;
}

function groupedByAppointment<T extends { organizationId: string; appointmentId: string }>(
  sources: readonly T[],
  organizationId: string,
  appointmentIds: ReadonlySet<string>,
) {
  const values = new Map<string, T[]>();
  for (const source of sources) {
    if (source.organizationId !== organizationId || !appointmentIds.has(source.appointmentId)) continue;
    values.set(source.appointmentId, [...(values.get(source.appointmentId) ?? []), source]);
  }
  return values;
}

function toNextActionDocument(document: DocumentSource): AppointmentNextActionDocument {
  return {
    status: document.status,
    scanStatus: document.scanStatus,
    storageStatus: document.storageStatus,
    deletedAt: document.deletedAt,
  };
}

function hasCustomerEligibleSession(
  appointment: AppointmentRequest,
  paymentStatus: string | null,
  session: SessionSource,
) {
  if (paymentStatus !== "paid" || !["confirmed", "ready"].includes(appointment.status)) return false;
  if (!["scheduled", "ready", "in_progress"].includes(session.status)) return false;
  if (!session.launchUrl) return false;
  try {
    const url = new URL(session.launchUrl);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function attentionFromAction(appointment: AppointmentRequest, action: AppointmentNextAction): AttentionIssue | null {
  if (nonAttentionActions.has(action.kind)) return null;
  return {
    id: `appointment-next-action:${appointment.id}:${action.kind}`,
    priority: priorityForAction(action),
    category: "appointments",
    title: action.title,
    description: action.description,
    actionLabel: action.href ? action.ctaLabel ?? "Open appointment" : "Open appointment",
    href: action.href ?? `/admin/appointments/${encodeURIComponent(appointment.id)}`,
    source: "appointments",
    createdAt: appointment.updatedAt,
    appointmentId: appointment.id,
    customerName: appointment.customer.fullName,
  };
}

function priorityForAction(action: AppointmentNextAction): AttentionPriority {
  if (action.tone === "danger") return "critical";
  if (action.tone === "warning") return "high";
  if (action.kind === "prepare_session") return "medium";
  return "low";
}

function compareAppointmentActions(left: MissionControlAppointmentAction, right: MissionControlAppointmentAction) {
  if (left.attention && right.attention) return compareAttentionIssues(left.attention, right.attention);
  if (left.attention) return -1;
  if (right.attention) return 1;
  return left.appointmentId.localeCompare(right.appointmentId);
}
