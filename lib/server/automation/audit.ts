import type { AutomationAuditRecord } from "@/lib/server/automation/types";

export interface AutomationAuditSink {
  append(record: AutomationAuditRecord): Promise<void>;
}
