import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import {
  consumeGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  storeGoogleConnection,
  upsertGoogleIntegrationSummary
} from "@/lib/server/google-oauth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function redirectWithResult(result: string) {
  const siteUrl = getServerEnv().NEXT_PUBLIC_SITE_URL;
  return NextResponse.redirect(new URL(`/admin/settings/integrations?google=${encodeURIComponent(result)}`, siteUrl));
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  if (error) return redirectWithResult("denied");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return redirectWithResult("invalid_callback");

  let context: Awaited<ReturnType<typeof requireAdminOrganizationContext>>;
  try {
    context = await requireAdminOrganizationContext();
    await consumeGoogleOAuthState({ state, organizationId: context.organizationId, userId: context.userId });
  } catch {
    return redirectWithResult("invalid_state");
  }

  try {
    const tokens = await exchangeGoogleAuthorizationCode(code);
    const account = await fetchGoogleUserInfo(tokens.access_token);
    await storeGoogleConnection({ organizationId: context.organizationId, tokens, googleAccount: account });
    await getSupabaseAdmin().from("audit_logs").insert({
      organization_id: context.organizationId,
      actor_user_id: context.userId,
      action: "integration.google.connected",
      entity_type: "organization",
      entity_id: context.organizationId,
      metadata: { accountEmail: account.email, scopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? [] }
    });
    return redirectWithResult("connected");
  } catch {
    await upsertGoogleIntegrationSummary({
      organizationId: context.organizationId,
      status: "error",
      lastError: "Google OAuth callback failed. Reconnect and try again."
    }).catch(() => undefined);
    return redirectWithResult("error");
  }
}
