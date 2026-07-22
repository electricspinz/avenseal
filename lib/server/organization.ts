import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin, hasSupabaseServiceConfig, normalizeSupabaseUrl } from "@/lib/supabase/server";

export const fallbackAvensealOrganizationId = "00000000-0000-4000-8000-000000000001";

export type OrganizationRole = "owner" | "admin" | "notary" | "staff";

export type OrganizationContext = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  status: "active" | "suspended" | "archived";
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: "active" | "invited" | "suspended";
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  timezone?: string | null;
  status?: OrganizationContext["status"] | null;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status?: OrganizationMembership["status"] | null;
};

export function getDefaultOrganizationSlug() {
  return getServerEnv().DEFAULT_ORGANIZATION_SLUG;
}

function mapOrganization(row: OrganizationRow): OrganizationContext {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone ?? "America/New_York",
    status: row.status ?? "active"
  };
}

function mapMembership(row: MembershipRow): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status ?? "active"
  };
}

export function roleCanManageOrganization(role: OrganizationRole) {
  return role === "owner" || role === "admin";
}

export async function resolvePublicOrganization(slug = getDefaultOrganizationSlug()) {
  if (!hasSupabaseServiceConfig()) {
    return {
      id: fallbackAvensealOrganizationId,
      name: "Avenseal",
      slug,
      timezone: "America/New_York",
      status: "active" as const
    };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("id,name,slug,timezone,status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (error?.code === "PGRST204" || error?.code === "42703") {
    const fallback = await getSupabaseAdmin()
      .from("organizations")
      .select("id,name,slug,timezone")
      .eq("slug", slug)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    if (!fallback.data) throw new Error(`Organization not found for slug "${slug}".`);
    return mapOrganization(fallback.data);
  }

  if (error) throw error;
  if (!data) throw new Error(`Active organization not found for slug "${slug}".`);
  return mapOrganization(data);
}

export async function resolvePublicOrganizationId(slug = getDefaultOrganizationSlug()) {
  const organization = await resolvePublicOrganization(slug);
  return organization.id;
}

export async function authenticateSupabaseUser(email: string, password: string) {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const authClient = createClient(
    normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL),
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  return data.user;
}

export async function getActiveMembershipForUser(userId: string, organizationSlug = getDefaultOrganizationSlug()) {
  const organization = await resolvePublicOrganization(organizationSlug);
  const { data, error } = await getSupabaseAdmin()
    .from("organization_users")
    .select("id,organization_id,user_id,role,status")
    .eq("organization_id", organization.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (error?.code === "PGRST204" || error?.code === "42703") {
    const fallback = await getSupabaseAdmin()
      .from("organization_users")
      .select("id,organization_id,user_id,role")
      .eq("organization_id", organization.id)
      .eq("user_id", userId)
      .limit(1);
    if (fallback.error) throw fallback.error;
    return fallback.data?.[0] ? mapMembership(fallback.data[0]) : null;
  }

  if (error) throw error;
  return data?.[0] ? mapMembership(data[0]) : null;
}

export async function userHasOrganizationRole(userId: string, roles: OrganizationRole[], organizationSlug = getDefaultOrganizationSlug()) {
  const membership = await getActiveMembershipForUser(userId, organizationSlug);
  return Boolean(membership && roles.includes(membership.role));
}
