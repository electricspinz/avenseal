import { loadMissionControlDashboard, type MissionControlDashboard } from "@/lib/server/mission-control-dashboard";
import { queryDocuments, type DocumentRecord } from "@/lib/server/documents";
import { resolvePublicOrganization, type OrganizationContext } from "@/lib/server/organization";
import { queryPayments, type PaymentRecord } from "@/lib/server/payments";
import { queryWorkflows, type Workflow } from "@/lib/server/workflows";
import type { CopilotContext } from "@/lib/server/copilot-types";

export type CopilotContextDependencies = Readonly<{
  resolveOrganization: () => Promise<OrganizationContext>;
  loadDashboard: () => Promise<MissionControlDashboard>;
  queryWorkflows: (organizationId: string) => readonly Workflow[];
  queryDocuments: (organizationId: string) => readonly DocumentRecord[];
  queryPayments: () => Promise<readonly PaymentRecord[]>;
}>;

const dependencies: CopilotContextDependencies = {
  resolveOrganization: () => resolvePublicOrganization(),
  loadDashboard: () => loadMissionControlDashboard(),
  queryWorkflows: (organizationId) => queryWorkflows({ organizationId }),
  queryDocuments: (organizationId) => queryDocuments({ organizationId }),
  queryPayments: () => queryPayments({ limit: "100" })
};

export async function buildCopilotContext(dataSource: CopilotContextDependencies = dependencies, now = new Date()): Promise<CopilotContext> {
  const [organizationResult, dashboardResult, paymentsResult] = await Promise.allSettled([dataSource.resolveOrganization(), dataSource.loadDashboard(), dataSource.queryPayments()]);
  if (organizationResult.status !== "fulfilled") throw new Error("Copilot organization context is unavailable.");
  const organization = organizationResult.value;
  const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
  const localDate = localOrganizationDate(now, organization.timezone);
  const workflows = safeQuery(() => dataSource.queryWorkflows(organization.id));
  const documents = safeQuery(() => dataSource.queryDocuments(organization.id));
  const payments = paymentsResult.status === "fulfilled" ? paymentsResult.value.filter((payment) => payment.organizationId === organization.id) : null;
  const appointments = dashboard?.missionControl.schedule.appointments;
  const attention = dashboard?.attentionItems;
  const feed = dashboard?.operationsFeed;
  const failedAttention = attention?.filter((item) => item.id.startsWith("communication-failed:")) ?? [];

  return {
    organization: { id: organization.id, timezone: organization.timezone || null },
    generatedAt: now.toISOString(), localDate,
    appointments: appointments && localDate ? { availability: "available", data: { today: appointments, next: appointments[0] ?? null } } : { availability: "unavailable", data: { today: [], next: null }, reason: "The organization schedule or timezone could not be verified." },
    workflows: workflows ? { availability: "available", data: workflows } : { availability: "unavailable", data: [], reason: "Workflow records could not be loaded." },
    communications: dashboard ? { availability: dashboard.missionControl.dailyBrief.communicationsUnavailable ? "partial" : "available", data: { failed: dashboard.communications.failed, queued: dashboard.communications.queued, attention: failedAttention.map(safeAttention) }, ...(dashboard.missionControl.dailyBrief.communicationsUnavailable ? { reason: "Communication metrics could not be fully verified." } : {}) } : { availability: "unavailable", data: { failed: null, queued: null, attention: [] }, reason: "Communications could not be loaded." },
    payments: payments ? { availability: "available", data: payments } : { availability: "unavailable", data: [], reason: "Payment records could not be loaded." },
    documents: documents ? { availability: "available", data: documents } : { availability: "unavailable", data: [], reason: "Document records could not be loaded." },
    operationsFeed: feed ? { availability: feed.unavailableSources.length ? "partial" : "available", data: feed.items, ...(feed.unavailableSources.length ? { reason: `Unavailable sources: ${feed.unavailableSources.join(", ")}.` } : {}) } : { availability: "unavailable", data: [], reason: "Operations activity could not be loaded." },
    unresolvedAttention: attention ? { availability: "available", data: { count: attention.length, items: attention.map((item) => ({ id: item.id, title: item.title, description: item.description, priority: item.priority, createdAt: item.createdAt, href: item.href })) } } : { availability: "unavailable", data: { count: 0, items: [] }, reason: "Attention items could not be loaded." }
  };
}

function safeQuery<T>(query: () => T) { try { return query(); } catch { return null; } }
function safeAttention(item: MissionControlDashboard["attentionItems"][number]) { return { id: item.id, title: item.title, description: item.description, createdAt: item.createdAt, href: item.href }; }
function localOrganizationDate(now: Date, timezone: string) { try { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value; const year = get("year"); const month = get("month"); const day = get("day"); return year && month && day ? `${year}-${month}-${day}` : null; } catch { return null; } }
