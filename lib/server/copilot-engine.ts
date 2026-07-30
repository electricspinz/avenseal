import type { CopilotBrief, CopilotContext, CopilotEvidence, CopilotPriority, CopilotQueryInput, CopilotQueryResult, CopilotRecommendation, CopilotCategory } from "@/lib/server/copilot-types";

export const copilotConfiguration = { approachingAppointmentWindowMinutes: 120, maximumRecommendations: 25, maximumMissionControlRecommendations: 3, includeInformationalRecommendations: false, dataFreshnessWarningMinutes: 30 } as const;
const ruleVersion = "1";
const priorityRank: Record<CopilotPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export type CopilotRecommendationRule = Readonly<{ ruleId: string; version: string; description: string; required: readonly (keyof CopilotContext)[]; evaluate: (context: CopilotContext) => readonly CopilotRecommendation[] }>;

export const copilotRules: readonly CopilotRecommendationRule[] = [
  { ruleId: "failed-communication", version: ruleVersion, description: "Flags recorded failed communications for staff review.", required: ["communications"], evaluate: failedCommunications },
  { ruleId: "blocked-workflow", version: ruleVersion, description: "Explains explicit workflow blockers.", required: ["workflows"], evaluate: blockedWorkflows },
  { ruleId: "payment-attention", version: ruleVersion, description: "Flags reliable failed or expired payment records.", required: ["payments"], evaluate: paymentAttention },
  { ruleId: "document-attention", version: ruleVersion, description: "Flags document records awaiting upload or signature.", required: ["documents"], evaluate: documentAttention },
  { ruleId: "ready-for-notarization", version: ruleVersion, description: "Surfaces workflows explicitly ready for notarization.", required: ["workflows"], evaluate: readyForNotarization }
];

export function buildCopilotRecommendations(context: CopilotContext): readonly CopilotRecommendation[] {
  const candidates = copilotRules.flatMap((rule) => rule.required.every((key) => sectionIsAvailable(context, key)) ? rule.evaluate(context) : []);
  return deduplicate(candidates).sort(compareRecommendations).slice(0, copilotConfiguration.maximumRecommendations);
}

export function buildCopilotBrief(context: CopilotContext, recommendations = buildCopilotRecommendations(context)): CopilotBrief {
  const schedule = context.appointments.availability === "available" ? `${context.appointments.data.today.length} appointment${plural(context.appointments.data.today.length)} scheduled today.` : "Schedule information is currently unavailable.";
  const blocked = context.workflows.availability === "available" ? context.workflows.data.filter((workflow) => workflow.blockers.length > 0).length : null;
  const readiness = context.workflows.availability === "available" ? `${context.workflows.data.filter((workflow) => workflow.currentStage === "ready_for_notarization").length} workflow${plural(context.workflows.data.filter((workflow) => workflow.currentStage === "ready_for_notarization").length)} recorded as ready for notarization.` : "Workflow readiness is currently unavailable.";
  const attention = context.unresolvedAttention.availability === "available" ? `${context.unresolvedAttention.data.count} recorded attention item${plural(context.unresolvedAttention.data.count)}.` : "Attention information is currently unavailable.";
  const unavailableSections = (Object.entries(context) as [string, unknown][]).flatMap(([key, value]) => value && typeof value === "object" && "availability" in value && (value as { availability: string }).availability !== "available" ? [key] : []);
  const headline = blocked !== null && blocked > 0 ? `${blocked} workflow${plural(blocked)} require attention.` : recommendations.length > 0 ? `${recommendations.length} recommendation${plural(recommendations.length)} require review.` : "No immediate recommendations require attention.";
  return { id: stableId(context.organization.id, "morning-brief", context.localDate ?? "unknown"), organizationId: context.organization.id, generatedAt: context.generatedAt, localDate: context.localDate, greeting: greeting(context.generatedAt, context.organization.timezone), headline, summaryItems: [schedule, attention], scheduleSummary: schedule, attentionSummary: attention, readinessSummary: readiness, topRecommendations: recommendations.slice(0, copilotConfiguration.maximumMissionControlRecommendations), unavailableSections, dataFreshness: "Generated from the current trusted read models.", ruleVersion };
}

export function queryCopilot(context: CopilotContext, input: CopilotQueryInput = {}): CopilotQueryResult {
  const limit = normalizeLimit(input.limit);
  const includeInformational = input.includeInformational === true || input.includeInformational === "true";
  const priorities: readonly CopilotPriority[] = ["low", "medium", "high", "critical"];
  const categories: readonly CopilotCategory[] = ["scheduling", "workflow", "payment", "document", "identity_verification", "communication", "customer_follow_up", "review", "compliance_attention", "operational", "general"];
  const recommendations = buildCopilotRecommendations(context).filter((item) => (!input.priority || priorities.includes(input.priority as CopilotPriority) && item.priority === input.priority) && (!input.category || categories.includes(input.category as CopilotCategory) && item.category === input.category) && (!input.customerId || item.customerId === input.customerId) && (!input.appointmentId || item.appointmentId === input.appointmentId) && (!input.workflowId || item.workflowId === input.workflowId) && (includeInformational || item.status !== "informational")).slice(0, limit);
  return { brief: buildCopilotBrief(context, recommendations), recommendations, availability: availabilityOf(context), generatedAt: context.generatedAt };
}

function failedCommunications(context: CopilotContext): readonly CopilotRecommendation[] {
  if (context.communications.availability === "unavailable") return [];
  return context.communications.data.attention.map((communication) => recommendation(context, "failed-communication", "communication", "critical", communication.id, { title: "Review failed communication", summary: "A recorded communication could not be sent.", reason: "The communication remains in a failed state and requires staff review.", action: "Review the failed communication.", href: communication.href, communicationId: communication.id, evidence: [evidence("communication", communication.id, "Failed communication", communication.description, communication.createdAt)] }));
}

function blockedWorkflows(context: CopilotContext): readonly CopilotRecommendation[] {
  if (context.workflows.availability === "unavailable") return [];
  return context.workflows.data.filter((workflow) => workflow.blockers.length > 0).map((workflow) => recommendation(context, "blocked-workflow", "workflow", workflow.blockers.includes("manual_review_required") ? "high" : "medium", `${workflow.id}:${workflow.blockers.join(",")}`, { title: "Review blocked workflow", summary: `Workflow for ${workflow.customerName} is blocked.`, reason: `Recorded blocker${plural(workflow.blockers.length)}: ${workflow.blockers.map(label).join(", ")}.`, action: workflow.recommendedNextAction, href: "/admin/workflows", customerId: workflow.customerId, customerName: workflow.customerName, appointmentId: workflow.appointmentId, workflowId: workflow.id, evidence: [evidence("workflow", workflow.id, "Workflow blocker", `Workflow is ${label(workflow.currentStage)} with ${workflow.blockers.map(label).join(", ")}.`, workflow.updatedAt, workflow.customerId, workflow.appointmentId, workflow.id)] }));
}

function paymentAttention(context: CopilotContext): readonly CopilotRecommendation[] {
  if (context.payments.availability === "unavailable") return [];
  return context.payments.data.filter((payment) => payment.status === "failed" || payment.status === "expired").map((payment) => recommendation(context, "payment-attention", "payment", payment.status === "failed" ? "high" : "medium", `${payment.id}:${payment.status}`, { title: "Review payment attention", summary: `A payment for ${payment.customerName} is ${payment.status}.`, reason: "The payment record requires staff review before the related appointment can proceed.", action: "Review the payment record.", href: `/admin/payments/${encodeURIComponent(payment.id)}`, customerId: payment.customerId, customerName: payment.customerName, appointmentId: payment.appointmentId, paymentId: payment.id, evidence: [evidence("payment", payment.id, "Payment status", `Payment is recorded as ${payment.status}.`, payment.updatedAt, payment.customerId, payment.appointmentId)] }));
}

function documentAttention(context: CopilotContext): readonly CopilotRecommendation[] {
  if (context.documents.availability === "unavailable") return [];
  return context.documents.data.filter((document) => document.status === "awaiting_upload" || document.status === "pending_signature").map((document) => recommendation(context, "document-attention", "document", "medium", `${document.id}:${document.status}`, { title: "Review document attention", summary: `${document.displayName} is ${label(document.status)}.`, reason: "The recorded document status requires staff follow-up.", action: "Review the document record.", href: "/admin/documents", customerId: document.customerId, customerName: document.customerName, appointmentId: document.appointmentId ?? undefined, documentId: document.id, evidence: [evidence("document", document.id, "Document status", `${document.displayName} is recorded as ${label(document.status)}.`, document.updatedAt, document.customerId, document.appointmentId ?? undefined)] }));
}

function readyForNotarization(context: CopilotContext): readonly CopilotRecommendation[] {
  if (context.workflows.availability === "unavailable") return [];
  return context.workflows.data.filter((workflow) => workflow.currentStage === "ready_for_notarization").map((workflow) => recommendation(context, "ready-for-notarization", "workflow", "low", workflow.id, { title: "Ready for notarization", summary: `Workflow for ${workflow.customerName} is recorded as ready for notarization.`, reason: "The Workflow Engine explicitly reports this stage.", action: "Review workflow details.", href: "/admin/workflows", status: "informational", customerId: workflow.customerId, customerName: workflow.customerName, appointmentId: workflow.appointmentId, workflowId: workflow.id, evidence: [evidence("workflow", workflow.id, "Workflow stage", "Workflow is recorded as ready for notarization.", workflow.updatedAt, workflow.customerId, workflow.appointmentId, workflow.id)] }));
}

function recommendation(context: CopilotContext, ruleId: string, category: CopilotCategory, priority: CopilotPriority, discriminator: string, data: { title: string; summary: string; reason: string; action: string; href?: string; status?: "active" | "informational"; customerId?: string; customerName?: string; appointmentId?: string; workflowId?: string; communicationId?: string; paymentId?: string; documentId?: string; evidence: readonly CopilotEvidence[] }): CopilotRecommendation {
  return { id: stableId(context.organization.id, ruleId, category, discriminator), organizationId: context.organization.id, category, priority, title: data.title, summary: data.summary, reason: data.reason, recommendedAction: data.action, confidence: "high", status: data.status ?? "active", ...(data.customerId ? { customerId: data.customerId } : {}), ...(data.customerName ? { customerName: data.customerName } : {}), ...(data.appointmentId ? { appointmentId: data.appointmentId } : {}), ...(data.workflowId ? { workflowId: data.workflowId } : {}), ...(data.communicationId ? { communicationId: data.communicationId } : {}), ...(data.paymentId ? { paymentId: data.paymentId } : {}), ...(data.documentId ? { documentId: data.documentId } : {}), ...(data.href ? { href: data.href } : {}), evidence: data.evidence, generatedAt: context.generatedAt, ruleId, ruleVersion, safeMetadata: {} };
}

function evidence(sourceType: CopilotEvidence["sourceType"], sourceId: string, labelText: string, fact: string, observedAt: string | null, customerId?: string, appointmentId?: string, workflowId?: string): CopilotEvidence { return { id: stableId(sourceType, sourceId, labelText), sourceType, sourceId, label: labelText, fact, observedAt, ...(customerId ? { customerId } : {}), ...(appointmentId ? { appointmentId } : {}), ...(workflowId ? { workflowId } : {}), safeMetadata: {} }; }
function deduplicate(items: readonly CopilotRecommendation[]) { return [...new Map(items.map((item) => [item.id, item])).values()]; }
function compareRecommendations(left: CopilotRecommendation, right: CopilotRecommendation) { const priority = priorityRank[left.priority] - priorityRank[right.priority]; if (priority !== 0) return priority; return observedAt(right) - observedAt(left) || left.id.localeCompare(right.id); }
function observedAt(item: CopilotRecommendation) { const values = item.evidence.map((evidence) => evidence.observedAt ? Date.parse(evidence.observedAt) : Number.NEGATIVE_INFINITY).filter(Number.isFinite); return values.length ? Math.max(...values) : Number.NEGATIVE_INFINITY; }
function stableId(...parts: string[]) { return `aven:${parts.map((part) => `${part.length}:${part}`).join("|")}`; }
function label(value: string) { return value.replaceAll("_", " "); }
function plural(count: number) { return count === 1 ? "" : "s"; }
function greeting(iso: string, timezone: string | null) { const hour = timezone ? Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(new Date(iso))) : 12; return hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening."; }
function normalizeLimit(input: CopilotQueryInput["limit"]) { const value = typeof input === "number" ? input : Number(input ?? copilotConfiguration.maximumRecommendations); return Math.min(Math.max(Number.isFinite(value) ? Math.floor(value) : copilotConfiguration.maximumRecommendations, 1), copilotConfiguration.maximumRecommendations); }
function availabilityOf(context: CopilotContext) { return { appointments: context.appointments.availability, workflows: context.workflows.availability, communications: context.communications.availability, payments: context.payments.availability, documents: context.documents.availability, operationsFeed: context.operationsFeed.availability, attention: context.unresolvedAttention.availability }; }
function sectionIsAvailable(context: CopilotContext, key: keyof CopilotContext) { const value = context[key]; return typeof value === "object" && value !== null && "availability" in value && value.availability !== "unavailable"; }
