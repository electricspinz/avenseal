import { AdminShell } from "@/components/admin-shell";
import { CopilotAvailabilityNotice, CopilotBriefCard, CopilotRecommendationList } from "@/components/copilot/copilot-components";
import { queryAvenCopilot } from "@/lib/server/copilot";

export const dynamic = "force-dynamic";

export default async function AvenCopilotPage() {
  const result = await queryAvenCopilot();
  return <AdminShell active="Aven"><main aria-labelledby="aven-heading"><CopilotBriefCard brief={result.brief} /><CopilotRecommendationList recommendations={result.recommendations} /><CopilotAvailabilityNotice unavailableSections={result.brief.unavailableSections} /><p className="mt-8 text-xs leading-5 text-slateDeep">Aven provides operational guidance based on recorded Avenseal data. It does not provide legal advice or determine notarial eligibility.</p></main></AdminShell>;
}
