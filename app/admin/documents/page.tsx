import { AdminShell } from "@/components/admin-shell";
import { DocumentsWorkspace } from "@/components/documents-workspace";
import { queryDocuments } from "@/lib/server/documents";
import { repository } from "@/lib/server/repository";
export const dynamic = "force-dynamic";
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) { const settings = await repository.getSettings(); return <AdminShell active="Documents"><DocumentsWorkspace records={queryDocuments({ organizationId: settings.business.businessName, ...(await searchParams) })} /></AdminShell>; }
