import { NextResponse } from "next/server";
import { getGoogleTokenEncryptionKey, getServerEnv } from "@/lib/env";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { buildGoogleAuthorizationUrl, createGoogleOAuthState } from "@/lib/server/google-oauth";

export async function GET() {
  try {
    const env = getServerEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
      return NextResponse.redirect(new URL("/admin/settings/integrations?google=not_configured", env.NEXT_PUBLIC_SITE_URL));
    }
    try {
      getGoogleTokenEncryptionKey();
    } catch {
      return NextResponse.redirect(new URL("/admin/settings/integrations?google=not_configured", env.NEXT_PUBLIC_SITE_URL));
    }
    const context = await requireAdminOrganizationContext();
    const state = await createGoogleOAuthState({
      organizationId: context.organizationId,
      userId: context.userId
    });
    return NextResponse.redirect(buildGoogleAuthorizationUrl({
      state,
      clientId: env.GOOGLE_CLIENT_ID,
      redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI
    }));
  } catch {
    const siteUrl = getServerEnv().NEXT_PUBLIC_SITE_URL;
    return NextResponse.redirect(new URL("/admin/settings/integrations?google=unauthorized", siteUrl));
  }
}
