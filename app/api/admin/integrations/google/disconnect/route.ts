import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { disconnectGoogleConnection } from "@/lib/server/google-oauth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(getServerEnv().NEXT_PUBLIC_SITE_URL).origin;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
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
