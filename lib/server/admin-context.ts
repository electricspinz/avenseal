import { cookies } from "next/headers";
import { getAdminCookieName, readAdminSession } from "@/lib/server/admin-auth";
import { resolvePublicOrganization } from "@/lib/server/organization";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

export type AdminOrganizationContext = {
  userId: string;
  email: string;
  organizationId: string;
  role: "owner" | "admin";
};

export async function requireAdminOrganizationContext(): Promise<AdminOrganizationContext> {
  if (!hasSupabaseServiceConfig()) {
    throw new Error("Google OAuth requires Supabase-backed admin authentication.");
  }

  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(getAdminCookieName())?.value);
  if (!session) throw new Error("Admin authentication is required.");

  const supabase = getSupabaseAdmin();
  let userId = session.userId;
  if (!userId) {
    const { data: profiles, error } = await supabase
      .from("user_profiles")
      .select("id")
      .ilike("email", session.email)
      .limit(1);
    if (error) throw error;
    userId = profiles?.[0]?.id ? String(profiles[0].id) : undefined;
  }
  if (!userId) throw new Error("Admin user profile was not found.");
  const organization = await resolvePublicOrganization();

  const { data, error } = await supabase
    .from("organization_users")
    .select("organization_id,role,status")
    .eq("user_id", userId)
    .eq("organization_id", organization.id)
    .in("role", ["owner", "admin"])
    .eq("status", "active")
    .limit(1);
  if (error) throw error;
  const membership = data?.[0];
  if (!membership) throw new Error("Admin organization access is required.");

  return {
    userId,
    email: session.email,
    organizationId: organization.id,
    role: String(membership.role) as "owner" | "admin"
  };
}
