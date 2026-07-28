import type { AutomationControlState, AutomationRuleMetadata } from "@/lib/server/automation/types";

export type AutomationControlResolution = {
  readonly state: AutomationControlState;
  readonly reason: string;
};

export type AutomationControlRequest = {
  readonly organizationId: string;
  readonly rule: AutomationRuleMetadata;
};

export interface AutomationControlProvider {
  resolve(request: AutomationControlRequest): Promise<AutomationControlResolution>;
}
