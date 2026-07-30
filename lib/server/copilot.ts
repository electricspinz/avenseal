import { buildCopilotContext } from "@/lib/server/copilot-context";
import { queryCopilot } from "@/lib/server/copilot-engine";
import type { CopilotQueryInput, CopilotQueryResult } from "@/lib/server/copilot-types";

/** Tenant-scoped, read-only Aven Operations Copilot query boundary. */
export async function queryAvenCopilot(input: CopilotQueryInput = {}): Promise<CopilotQueryResult> {
  const context = await buildCopilotContext();
  // Tenant selection comes from the trusted server organization resolver, never a client value.
  return queryCopilot(context, input);
}
