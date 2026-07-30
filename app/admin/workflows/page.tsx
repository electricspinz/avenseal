import { AdminShell } from "@/components/admin-shell";
import { queryWorkflows } from "@/lib/server/workflows";
export const dynamic = "force-dynamic";
export default async function WorkflowsPage() { queryWorkflows({ organizationId: "" }); return <AdminShell active="Workflows"><section><h1 className="text-3xl font-semibold text-navy">Workflows</h1><p className="mt-2 text-sm text-slateDeep">Read-only notarization workflow states.</p><p className="mt-6 rounded-lg border border-silver bg-white p-5 text-sm text-slateDeep">No workflow records have been created yet.</p></section></AdminShell>; }
