import type { AdminCommunication } from "@/lib/types";
import { repository } from "@/lib/server/repository";

export type CommunicationsCenterStatus = "scheduled" | "ready_to_queue" | "queued" | "sent" | "failed" | "cancelled";
export type CommunicationsCenterSort = "newest" | "oldest";

export type CommunicationsCenterQuery = Readonly<{
  page?: number;
  status?: string;
  purpose?: string;
  channel?: string;
  customer?: string;
  appointment?: string;
  from?: string;
  to?: string;
  search?: string;
  sort?: string;
  archived?: string;
}>;

export type CommunicationsCenterItem = Readonly<{
  id: string;
  customerId: string | null;
  customerName: string | null;
  appointmentId: string | null;
  purpose: string;
  channel: "email";
  status: CommunicationsCenterStatus;
  provider: string | null;
  occurredAt: string;
  safeSummary: string;
  source: AdminCommunication["source"];
  messageId: string | null;
  archivedAt: string | null;
}>;

export type CommunicationsCenterResult = Readonly<{
  records: readonly CommunicationsCenterItem[];
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  query: Readonly<{
    status?: CommunicationsCenterStatus;
    purpose?: string;
    channel?: "email";
    customer?: string;
    appointment?: string;
    from?: string;
    to?: string;
    search?: string;
    sort: CommunicationsCenterSort;
    showArchived: boolean;
  }>;
}>;

const statuses: readonly CommunicationsCenterStatus[] = ["scheduled", "ready_to_queue", "queued", "sent", "failed", "cancelled"];
export type CommunicationsCenterRepository = Pick<typeof repository, "listAdminCommunications" | "getAdminCommunication">;

export async function queryCommunicationsCenter(input: CommunicationsCenterQuery, dataSource: CommunicationsCenterRepository = repository): Promise<CommunicationsCenterResult> {
  const query = normalizeQuery(input);
  const page = await dataSource.listAdminCommunications({ page: number(input.page), status: query.status, type: query.purpose, includeArchived: query.showArchived });
  const records = page.records
    .filter((record) => matches(record, query))
    .map(toItem)
    .sort((left, right) => query.sort === "oldest" ? left.occurredAt.localeCompare(right.occurredAt) : right.occurredAt.localeCompare(left.occurredAt));

  return { records, currentPage: page.currentPage, totalPages: page.totalPages, totalRecords: page.totalRecords, query };
}

export async function getCommunicationsCenterItem(id: string, dataSource: CommunicationsCenterRepository = repository): Promise<CommunicationsCenterItem | null> {
  const record = await dataSource.getAdminCommunication(id);
  return record ? toItem(record) : null;
}

export function normalizeQuery(input: CommunicationsCenterQuery) {
  const from = validDate(input.from) ? input.from : undefined;
  const to = validDate(input.to) ? input.to : undefined;
  return {
    status: statuses.find((status) => status === input.status),
    purpose: safeText(input.purpose),
    channel: input.channel === "email" ? "email" as const : undefined,
    customer: safeText(input.customer),
    appointment: safeText(input.appointment),
    from,
    to,
    search: safeText(input.search),
    sort: input.sort === "oldest" ? "oldest" as const : "newest" as const,
    showArchived: input.archived === "on"
  };
}

function matches(record: AdminCommunication, query: ReturnType<typeof normalizeQuery>) {
  const occurredAt = communicationOccurredAt(record);
  const search = query.search?.toLocaleLowerCase();
  return (!query.customer || record.customerId === query.customer)
    && (!query.appointment || record.appointmentId === query.appointment)
    && (!query.from || occurredAt >= query.from)
    && (!query.to || occurredAt <= `${query.to}T23:59:59.999Z`)
    && (!search || [record.customerName, record.appointmentId, record.messageId, record.id].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(search)));
}

function toItem(record: AdminCommunication): CommunicationsCenterItem {
  return {
    id: record.id,
    customerId: record.customerId,
    customerName: record.customerName,
    appointmentId: record.appointmentId,
    purpose: record.messageType,
    channel: "email",
    status: record.status,
    provider: null,
    occurredAt: communicationOccurredAt(record),
    safeSummary: communicationSafeSummary(record.status),
    source: record.source,
    messageId: record.messageId,
    archivedAt: record.archivedAt
  };
}

export function communicationOccurredAt(record: AdminCommunication) {
  return record.sentAt ?? record.queuedAt ?? record.scheduledFor ?? record.createdAt;
}

export function communicationSafeSummary(status: CommunicationsCenterStatus) {
  return status === "sent" ? "Communication delivered." : status === "failed" ? "Communication delivery failed." : status === "cancelled" ? "Communication was cancelled." : status === "scheduled" ? "Communication is scheduled." : status === "ready_to_queue" ? "Communication is ready to queue." : "Communication is queued.";
}

function safeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 120 ? trimmed : undefined;
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function number(value: string | number | undefined) {
  return Math.max(Number(value ?? "1") || 1, 1);
}
