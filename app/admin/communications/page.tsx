import { AdminCard, AdminShell } from "@/components/admin-shell";
import { CommunicationsCenter } from "@/components/communications-center";
import { queryCommunicationsCenter } from "@/lib/server/communications-center";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [settings, result] = await Promise.all([
    repository.getSettings(),
    queryCommunicationsCenter(await searchParams)
  ]);

  return <AdminShell active="Communications"><header><h1 className="text-3xl font-semibold text-navy">Communications Center</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slateDeep">Inspect tenant-scoped communication records, their delivery state, and their linked customer or appointment context.</p></header><AdminCard className="mt-8"><CommunicationsCenter result={result} timezone={settings.business.timezone} /></AdminCard></AdminShell>;
}
