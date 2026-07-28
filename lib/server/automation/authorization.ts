import type { AutomationActor, AutomationApproval, AutomationRuleMetadata } from "@/lib/server/automation/types";

export type TrustedOrganizationResolution =
  | { readonly kind: "trusted"; readonly organizationId: string }
  | { readonly kind: "untrusted"; readonly reason: string };

export type AutomationAuthorizationDecision =
  | { readonly kind: "authorized" }
  | { readonly kind: "denied"; readonly reason: string };

export type AutomationApprovalDecision =
  | { readonly kind: "valid" }
  | { readonly kind: "missing"; readonly reason: string }
  | { readonly kind: "rejected"; readonly reason: string };

export type TrustedOrganizationRequest = {
  readonly actor: AutomationActor;
  readonly logicalExecutionId: string;
};

export type AutomationApprovalRequest = {
  readonly approval: AutomationApproval | undefined;
  readonly organizationId: string;
  readonly rule: AutomationRuleMetadata;
  readonly logicalExecutionId: string;
  readonly actor: AutomationActor;
  readonly now: Date;
};

export interface AutomationAuthorizationProvider {
  resolveTrustedOrganization(request: TrustedOrganizationRequest): Promise<TrustedOrganizationResolution>;
  authorizeExecution(input: { readonly actor: AutomationActor; readonly organizationId: string; readonly rule: AutomationRuleMetadata }): Promise<AutomationAuthorizationDecision>;
  validateApproval(request: AutomationApprovalRequest): Promise<AutomationApprovalDecision>;
}
