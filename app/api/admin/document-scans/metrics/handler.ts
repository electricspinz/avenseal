import { NextResponse } from "next/server";
import { requireAdminOrganizationContext, type AdminOrganizationContext } from "@/lib/server/admin-context";
import { getDocumentScanMetrics } from "@/lib/server/document-security/scan-jobs";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type DocumentScanMetrics = Awaited<ReturnType<typeof getDocumentScanMetrics>>;

export type DocumentScanMetricsHandlerDependencies = Readonly<{
  context: () => Promise<AdminOrganizationContext>;
  metrics: (organizationId: string) => Promise<DocumentScanMetrics>;
}>;

const productionDependencies: DocumentScanMetricsHandlerDependencies = {
  context: requireAdminOrganizationContext,
  metrics: (organizationId) => getDocumentScanMetrics(getSupabaseAdmin(), organizationId)
};

/** Aggregate-only operational metrics for the current owner/admin organization. */
export function createDocumentScanMetricsHandler(dependencies: DocumentScanMetricsHandlerDependencies = productionDependencies) {
  return async function handleDocumentScanMetrics() {
    try {
      const context = await dependencies.context();
      const metrics = await dependencies.metrics(context.organizationId);
      return NextResponse.json({ metrics }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Document scan metrics are unavailable." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  };
}
