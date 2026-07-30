import type { AppointmentRequest } from "@/lib/types";
import type { DocumentRecord } from "@/lib/server/documents";
import type { OperationsFeedItem } from "@/lib/server/operations-feed";
import type { PaymentRecord } from "@/lib/server/payments";
import type { Workflow } from "@/lib/server/workflows";

export type CopilotAvailability = "available" | "partial" | "unavailable";
export type CopilotPriority = "low" | "medium" | "high" | "critical";
export type CopilotCategory = "scheduling" | "workflow" | "payment" | "document" | "identity_verification" | "communication" | "customer_follow_up" | "review" | "compliance_attention" | "operational" | "general";
export type CopilotConfidence = "high" | "medium" | "low";
export type CopilotRecommendationStatus = "active" | "informational" | "expired";
export type CopilotEvidenceSource = "appointment" | "workflow" | "payment" | "document" | "communication" | "customer_timeline" | "operations_feed" | "system";

export type CopilotSection<T> = Readonly<{ availability: CopilotAvailability; data: T; reason?: string }>;

export type CopilotEvidence = Readonly<{
  id: string;
  sourceType: CopilotEvidenceSource;
  sourceId: string;
  label: string;
  fact: string;
  observedAt: string | null;
  customerId?: string;
  appointmentId?: string;
  workflowId?: string;
  safeMetadata: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type CopilotRecommendation = Readonly<{
  id: string;
  organizationId: string;
  category: CopilotCategory;
  priority: CopilotPriority;
  title: string;
  summary: string;
  reason: string;
  recommendedAction: string;
  confidence: CopilotConfidence;
  status: CopilotRecommendationStatus;
  customerId?: string;
  customerName?: string;
  appointmentId?: string;
  workflowId?: string;
  communicationId?: string;
  paymentId?: string;
  documentId?: string;
  href?: string;
  evidence: readonly CopilotEvidence[];
  generatedAt: string;
  expiresAt?: string;
  ruleId: string;
  ruleVersion: string;
  correlationId?: string;
  safeMetadata: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type CopilotContext = Readonly<{
  organization: Readonly<{ id: string; timezone: string | null }>;
  generatedAt: string;
  localDate: string | null;
  appointments: CopilotSection<Readonly<{ today: readonly AppointmentRequest[]; next: AppointmentRequest | null }>>;
  workflows: CopilotSection<readonly Workflow[]>;
  communications: CopilotSection<Readonly<{ failed: number | null; queued: number | null; attention: readonly Readonly<{ id: string; title: string; description: string; createdAt: string | null; href: string }>[] }>>;
  payments: CopilotSection<readonly PaymentRecord[]>;
  documents: CopilotSection<readonly DocumentRecord[]>;
  operationsFeed: CopilotSection<readonly OperationsFeedItem[]>;
  unresolvedAttention: CopilotSection<Readonly<{ count: number; items: readonly Readonly<{ id: string; title: string; description: string; priority: CopilotPriority; createdAt: string | null; href: string }>[] }>>;
}>;

export type CopilotBrief = Readonly<{
  id: string;
  organizationId: string;
  generatedAt: string;
  localDate: string | null;
  greeting: string;
  headline: string;
  summaryItems: readonly string[];
  scheduleSummary: string;
  attentionSummary: string;
  readinessSummary: string;
  topRecommendations: readonly CopilotRecommendation[];
  unavailableSections: readonly string[];
  dataFreshness: string;
  ruleVersion: string;
}>;

export type CopilotQueryInput = Readonly<{ organizationId?: string; date?: string; customerId?: string; appointmentId?: string; workflowId?: string; priority?: string; category?: string; limit?: string | number; includeInformational?: string | boolean }>;
export type CopilotQueryResult = Readonly<{ brief: CopilotBrief; recommendations: readonly CopilotRecommendation[]; availability: Readonly<Record<string, CopilotAvailability>>; generatedAt: string }>;
