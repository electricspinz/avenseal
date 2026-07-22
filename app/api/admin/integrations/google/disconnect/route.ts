import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { disconnectGoogleConnection } from "@/lib/server/google-oauth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST() {
  try {
    const context = await requireAdminOrganizationContext();
    await disconnectGoogleConnection(context.organizationId);
    await getSupabaseAdmin().from("audit_logs").insert({
      organization_id: context.organizationId,
      actor_user_id: context.userId,
      action: "integration.google.disconnected",
      entity_type: "organization",
      entity_id: context.organizationId,
      metadata: { provider: "google_calendar" }
    });
    return NextResponse.redirect(new URL("/admin/settings/integrations?google=disconnected", getServerEnv().NEXT_PUBLIC_SITE_URL));
  } catch {
    return NextResponse.redirect(new URL("/admin/settings/integrations?google=unauthorized", getServerEnv().NEXT_PUBLIC_SITE_URL));
  }
}
