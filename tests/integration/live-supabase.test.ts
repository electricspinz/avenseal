import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { generateSlots } from "@/lib/availability";

function readEnv() {
  const local = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const parsed = Object.fromEntries(
    local
      .split(/\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
      })
  );
  return { ...process.env, ...parsed };
}

const env = readEnv();
let orgId = "";
let hasOrganizationStatusColumn = false;

const hasLiveConfig = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.ADMIN_DEMO_EMAIL &&
    env.ADMIN_DEMO_PASSWORD
);

const maybeDescribe = hasLiveConfig ? describe : describe.skip;

maybeDescribe("live Supabase integration and RLS", () => {
  let clientCounter = 0;
  const createLiveClient = (key: string, label: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `avenseal-live-${label}-${clientCounter++}`
    }
  });

  const service = createLiveClient(env.SUPABASE_SERVICE_ROLE_KEY!, "service");
  const anon = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "anon");

  beforeAll(async () => {
    const { data, error } = await service
      .from("organizations")
      .select("id")
      .eq("slug", env.DEFAULT_ORGANIZATION_SLUG || "avenseal")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    orgId = data!.id;

    const statusCheck = await service.from("organizations").select("status").eq("id", orgId).limit(1);
    hasOrganizationStatusColumn = !statusCheck.error;
  });

  it("has Avenseal seed records", async () => {
    const { data: org, error: orgError } = await service.from("organizations").select("id, slug, business_mode, timezone").eq("id", orgId).maybeSingle();
    const { data: settings, error: settingsError } = await service.from("business_settings").select("organization_id").eq("organization_id", orgId).maybeSingle();
    const { count, error: intervalError } = await service.from("organization_availability_intervals").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    const { data: rules, error: rulesError } = await service.from("appointment_rule_settings").select("default_duration_minutes, same_day_enabled, automatic_approval_enabled").eq("organization_id", orgId).maybeSingle();
    const { data: concierge, error: conciergeError } = await service.from("ai_concierge_settings").select("display_name, tone_preset").eq("organization_id", orgId).maybeSingle();
    expect(orgError).toBeNull();
    expect(settingsError).toBeNull();
    expect(intervalError).toBeNull();
    expect(rulesError).toBeNull();
    expect(conciergeError).toBeNull();
    expect(org).toBeTruthy();
    expect(org?.slug).toBe(env.DEFAULT_ORGANIZATION_SLUG || "avenseal");
    expect(org?.business_mode).toBe("solo");
    expect(org?.timezone).toBe("America/New_York");
    expect(settings).toBeTruthy();
    expect(count).toBe(5);
    expect(rules?.default_duration_minutes).toBe(30);
    expect(rules?.same_day_enabled).toBe(true);
    expect(rules?.automatic_approval_enabled).toBe(false);
    expect(concierge?.display_name).toBe("Ava");
  });

  it("has status-aware organization membership columns after the tenant normalization migration is applied", async () => {
    if (!hasOrganizationStatusColumn) {
      console.warn("Skipping tenant-normalization column checks because migration 0005 is not applied to this live database.");
      return;
    }

    const { data: organization, error: organizationError } = await service
      .from("organizations")
      .select("status")
      .eq("id", orgId)
      .single();
    const { data: membership, error: membershipError } = await service
      .from("organization_users")
      .select("status")
      .eq("organization_id", orgId)
      .limit(1);
    const { data: membershipView, error: viewError } = await service
      .from("organization_memberships")
      .select("organization_id,status")
      .eq("organization_id", orgId)
      .limit(1);

    expect(organizationError).toBeNull();
    expect(membershipError).toBeNull();
    expect(viewError).toBeNull();
    expect(organization?.status).toBe("active");
    expect(membership?.[0]?.status).toBe("active");
    expect(membershipView?.[0]?.status).toBe("active");
  });

  it("has the appointment access token table with RLS enabled", async () => {
    const tokenHash = randomBytes(32).toString("hex");
    const { data: appointment, error: appointmentError } = await service
      .from("appointment_requests")
      .select("id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(appointmentError).toBeNull();
    if (!appointment?.[0]) return;

    const inserted = await service
      .from("appointment_access_tokens")
      .insert({
        organization_id: orgId,
        appointment_request_id: appointment[0].id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();

    try {
      const anonRead = await anon.from("appointment_access_tokens").select("token_hash").eq("token_hash", tokenHash);
      expect(anonRead.error).toBeNull();
      expect(anonRead.data).toEqual([]);

      const admin = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "token-admin");
      const adminLogin = await admin.auth.signInWithPassword({
        email: env.ADMIN_DEMO_EMAIL!,
        password: env.ADMIN_DEMO_PASSWORD!
      });
      expect(adminLogin.error).toBeNull();
      const adminRead = await admin.from("appointment_access_tokens").select("id").eq("token_hash", tokenHash);
      expect(adminRead.error).toBeNull();
      expect(adminRead.data?.length).toBe(1);
    } finally {
      if (inserted.data?.id) await service.from("appointment_access_tokens").delete().eq("id", inserted.data.id);
    }
  });

  it("returns Avenseal weekday slots and no weekend slots from configured hours", async () => {
    const { data: intervals, error } = await service
      .from("organization_availability_intervals")
      .select("weekday, start_time, end_time")
      .eq("organization_id", orgId);
    expect(error).toBeNull();
    const mapped = (intervals ?? []).map((row) => ({
      weekday: row.weekday,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5)
    }));
    const monday = generateSlots({ date: "2026-07-20", intervals: mapped, rules: { defaultDurationMinutes: 30, bufferBeforeMinutes: null, bufferAfterMinutes: null } });
    const saturday = generateSlots({ date: "2026-07-18", intervals: mapped, rules: { defaultDurationMinutes: 30, bufferBeforeMinutes: null, bufferAfterMinutes: null } });
    expect(monday[0]).toBe("09:30");
    expect(monday).toContain("17:30");
    expect(monday).not.toContain("09:00");
    expect(monday).not.toContain("18:00");
    expect(saturday).toEqual([]);
  });

  it("enforces RLS for anonymous, non-admin, and admin clients", async () => {
    const anonRead = await anon.from("appointment_requests").select("id");
    expect(anonRead.error).toBeNull();
    expect(anonRead.data).toEqual([]);

    const anonInsert = await anon.from("customers").insert({
      organization_id: orgId,
      full_name: "LIVE_VERIFICATION_RLS_ANON",
      email: "anon@example.invalid",
      mobile_phone: "000"
    });
    expect(anonInsert.error).toBeTruthy();

    const nonAdminEmail = `live-verification-nonadmin-${Date.now()}@example.invalid`;
    const nonAdminPassword = randomBytes(18).toString("base64url");
    const created = await service.auth.admin.createUser({
      email: nonAdminEmail,
      password: nonAdminPassword,
      email_confirm: true
    });
    expect(created.error).toBeNull();

    try {
      const nonAdmin = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "non-admin");
      const nonAdminLogin = await nonAdmin.auth.signInWithPassword({ email: nonAdminEmail, password: nonAdminPassword });
      expect(nonAdminLogin.error).toBeNull();
      const nonAdminRead = await nonAdmin.from("organizations").select("id");
      expect(nonAdminRead.error).toBeNull();
      expect(nonAdminRead.data).toEqual([]);

      const admin = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "rls-admin");
      const adminLogin = await admin.auth.signInWithPassword({
        email: env.ADMIN_DEMO_EMAIL!,
        password: env.ADMIN_DEMO_PASSWORD!
      });
      expect(adminLogin.error).toBeNull();
      const adminRead = await admin.from("organizations").select("id").eq("id", orgId);
      expect(adminRead.error).toBeNull();
      expect(adminRead.data?.length).toBe(1);
    } finally {
      if (created.data.user?.id) {
        await service.auth.admin.deleteUser(created.data.user.id);
      }
    }
  });

  it("enforces tenant isolation between organizations", async () => {
    const otherOrgSlug = `live-verification-other-${Date.now()}`;
    const otherOrg = await service
      .from("organizations")
      .insert({
        name: "Live Verification Other Org",
        slug: otherOrgSlug,
        display_name: "Live Verification Other Org",
        legal_name: "Live Verification Other Org",
        timezone: "America/New_York"
      })
      .select("id")
      .single();
    expect(otherOrg.error).toBeNull();

    const otherSettings = await service
      .from("business_settings")
      .insert({
        organization_id: otherOrg.data!.id,
        business_name: "Other Org",
        support_email: "other@example.invalid",
        support_phone: "000",
        privacy_policy_version: "test",
        terms_version: "test",
        timezone: "America/New_York"
      })
      .select("id")
      .single();
    expect(otherSettings.error).toBeNull();

    const admin = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "tenant-admin");
    const adminLogin = await admin.auth.signInWithPassword({
      email: env.ADMIN_DEMO_EMAIL!,
      password: env.ADMIN_DEMO_PASSWORD!
    });
    expect(adminLogin.error).toBeNull();

    try {
      const otherOrgRead = await admin.from("organizations").select("id").eq("id", otherOrg.data!.id);
      expect(otherOrgRead.error).toBeNull();
      expect(otherOrgRead.data).toEqual([]);

      const otherSettingsRead = await admin.from("business_settings").select("organization_id").eq("organization_id", otherOrg.data!.id);
      expect(otherSettingsRead.error).toBeNull();
      expect(otherSettingsRead.data).toEqual([]);

      const otherSettingsUpdate = await admin
        .from("business_settings")
        .update({ description: "SHOULD_NOT_WRITE_OTHER_ORG" })
        .eq("organization_id", otherOrg.data!.id);
      expect(otherSettingsUpdate.error).toBeNull();

      const afterUpdate = await service.from("business_settings").select("description").eq("organization_id", otherOrg.data!.id).single();
      expect(afterUpdate.error).toBeNull();
      expect(afterUpdate.data?.description).not.toBe("SHOULD_NOT_WRITE_OTHER_ORG");
    } finally {
      await service.from("organizations").delete().eq("id", otherOrg.data!.id);
    }
  });

  it("allows owner/admin settings updates and blocks lower-privilege members", async () => {
    const admin = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "settings-admin");
    const adminLogin = await admin.auth.signInWithPassword({
      email: env.ADMIN_DEMO_EMAIL!,
      password: env.ADMIN_DEMO_PASSWORD!
    });
    expect(adminLogin.error).toBeNull();

    const original = await service.from("business_settings").select("description").eq("organization_id", orgId).single();
    expect(original.error).toBeNull();
    expect(original.data).toBeTruthy();
    const marker = `LIVE_VERIFICATION_SETTINGS_${Date.now()}`;
    const adminUpdate = await admin.from("business_settings").update({ description: marker }).eq("organization_id", orgId);
    expect(adminUpdate.error).toBeNull();

    const staffEmail = `live-verification-staff-${Date.now()}@example.invalid`;
    const staffPassword = randomBytes(18).toString("base64url");
    const staff = await service.auth.admin.createUser({ email: staffEmail, password: staffPassword, email_confirm: true });
    expect(staff.error).toBeNull();

    try {
      await service.from("user_profiles").insert({ id: staff.data.user!.id, email: staffEmail, full_name: "Live Verification Staff" });
      await service.from("organization_users").insert({ organization_id: orgId, user_id: staff.data.user!.id, role: "staff" });
      const staffClient = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "settings-staff");
      const staffLogin = await staffClient.auth.signInWithPassword({ email: staffEmail, password: staffPassword });
      expect(staffLogin.error).toBeNull();
      const staffRead = await staffClient.from("business_settings").select("organization_id").eq("organization_id", orgId);
      expect(staffRead.error).toBeNull();
      expect(staffRead.data?.length).toBe(1);
      const staffUpdate = await staffClient.from("business_settings").update({ description: "SHOULD_NOT_WRITE" }).eq("organization_id", orgId);
      expect(staffUpdate.error).toBeNull();
      const afterStaffUpdate = await service.from("business_settings").select("description").eq("organization_id", orgId).single();
      expect(afterStaffUpdate.error).toBeNull();
      expect(afterStaffUpdate.data?.description).toBe(marker);
    } finally {
      await service.from("business_settings").update({ description: original.data?.description ?? null }).eq("organization_id", orgId);
      if (staff.data.user?.id) await service.auth.admin.deleteUser(staff.data.user.id);
    }
  });
});
