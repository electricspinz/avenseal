import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSlots } from "@/lib/availability";
import {
  getAvailableAppointmentSlots,
  localTimeForAppointmentSlot
} from "@/lib/server/appointment-availability";
import { repository } from "@/lib/server/repository";

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
    env.ADMIN_DEMO_PASSWORD &&
    env.STAGING_STAFF_DEMO_EMAIL &&
    env.STAGING_STAFF_DEMO_PASSWORD
);
const hasStagingGuard = env.LIVE_SUPABASE_ENVIRONMENT === "staging";

if (hasLiveConfig && !hasStagingGuard) {
  console.warn("Skipping live Supabase integration tests: set LIVE_SUPABASE_ENVIRONMENT=staging to confirm the target is staging.");
}
if (hasLiveConfig && hasStagingGuard) Object.assign(process.env, env);

const maybeDescribe = hasLiveConfig && hasStagingGuard ? describe : describe.skip;

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

  afterAll(async () => {
    if (!orgId) return;
    const stateCleanupCheck = await service
      .from("google_oauth_states")
      .select("id", { count: "exact", head: true })
      .ilike("state_hash", "LIVE_STAGING_OAUTH_%");
    expect(stateCleanupCheck.error).toBeNull();
    expect(stateCleanupCheck.count).toBe(0);

    const connectionCleanupCheck = await service
      .from("google_oauth_connections")
      .select("id", { count: "exact", head: true })
      .ilike("google_account_email", "live_staging_oauth_%@example.invalid");
    expect(connectionCleanupCheck.error).toBeNull();
    expect(connectionCleanupCheck.count).toBe(0);
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

  it("contains only synthetic staging customer contact data", async () => {
    const { data, error } = await service
      .from("customers")
      .select("email,mobile_phone")
      .eq("organization_id", orgId);
    expect(error).toBeNull();
    const rows = data ?? [];
    const nonSyntheticRows = rows.filter((row) => {
      const email = String(row.email ?? "").toLowerCase();
      const phone = String(row.mobile_phone ?? "");
      const syntheticEmail = email.endsWith("@example.com") || email.endsWith("@example.invalid");
      const syntheticPhone = phone.includes("555") || /^0[\d\s().-]*$/.test(phone);
      return !syntheticEmail || !syntheticPhone;
    });
    expect(nonSyntheticRows).toHaveLength(0);
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
      .select("role,status")
      .eq("organization_id", orgId)
      .eq("status", "active");
    const { data: membershipView, error: viewError } = await service
      .from("organization_memberships")
      .select("organization_id,status")
      .eq("organization_id", orgId)
      .limit(1);

    expect(organizationError).toBeNull();
    expect(membershipError).toBeNull();
    expect(viewError).toBeNull();
    expect(organization?.status).toBe("active");
    expect(membership?.some((row) => row.role === "owner" && row.status === "active")).toBe(true);
    expect(membership?.some((row) => row.role === "staff" && row.status === "active")).toBe(true);
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

  it("has Google OAuth storage tables with closed browser-role access", async () => {
    const marker = `LIVE_STAGING_OAUTH_RLS_${Date.now()}`;
    const testUserEmail = `${marker.toLowerCase()}@example.invalid`;
    const testUserPassword = randomBytes(18).toString("base64url");
    const createdUser = await service.auth.admin.createUser({
      email: testUserEmail,
      password: testUserPassword,
      email_confirm: true
    });
    expect(createdUser.error).toBeNull();
    expect(createdUser.data.user?.id).toBeTruthy();

    let stateId: string | null = null;
    let connectionId: string | null = null;
    let testOrgId: string | null = null;

    try {
      const org = await service
        .from("organizations")
        .insert({
          name: "Live Staging OAuth RLS Org",
          slug: `live-staging-oauth-rls-${Date.now()}`,
          display_name: "Live Staging OAuth RLS Org",
          legal_name: "Live Staging OAuth RLS Org",
          timezone: "America/New_York"
        })
        .select("id")
        .single();
      expect(org.error).toBeNull();
      testOrgId = org.data!.id;

      await service.from("user_profiles").insert({
        id: createdUser.data.user!.id,
        email: testUserEmail,
        full_name: "Live Staging OAuth RLS"
      });

      const state = await service
        .from("google_oauth_states")
        .insert({
          organization_id: testOrgId,
          user_id: createdUser.data.user!.id,
          state_hash: marker,
          redirect_path: "/admin/settings/integrations",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        })
        .select("id,state_hash,expires_at,used_at")
        .single();
      expect(state.error).toBeNull();
      expect(state.data?.state_hash).toBe(marker);
      expect(state.data?.expires_at).toBeTruthy();
      expect(state.data?.used_at).toBeNull();
      stateId = state.data!.id;

      const connection = await service
        .from("google_oauth_connections")
        .insert({
          organization_id: testOrgId,
          provider: "google",
          google_account_email: `${marker.toLowerCase()}-google@example.invalid`,
          encrypted_refresh_token: "ciphertext",
          refresh_token_iv: "iv",
          refresh_token_tag: "tag",
          encrypted_access_token: "access-ciphertext",
          access_token_iv: "access-iv",
          access_token_tag: "access-tag",
          status: "connected",
          scopes: ["openid", "email"]
        })
        .select("id,status,provider")
        .single();
      expect(connection.error).toBeNull();
      expect(connection.data?.provider).toBe("google");
      expect(connection.data?.status).toBe("connected");
      connectionId = connection.data!.id;

      const admin = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "oauth-admin");
      const adminLogin = await admin.auth.signInWithPassword({
        email: env.ADMIN_DEMO_EMAIL!,
        password: env.ADMIN_DEMO_PASSWORD!
      });
      expect(adminLogin.error).toBeNull();

      const nonAdmin = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "oauth-non-admin");
      const nonAdminLogin = await nonAdmin.auth.signInWithPassword({
        email: testUserEmail,
        password: testUserPassword
      });
      expect(nonAdminLogin.error).toBeNull();

      for (const client of [anon, admin, nonAdmin]) {
        const stateRead = await client.from("google_oauth_states").select("id").eq("state_hash", marker);
        expect(stateRead.error).toBeNull();
        expect(stateRead.data).toEqual([]);

        const connectionRead = await client.from("google_oauth_connections").select("id").eq("id", connectionId);
        expect(connectionRead.error).toBeNull();
        expect(connectionRead.data).toEqual([]);

        const stateWrite = await client.from("google_oauth_states").insert({
          organization_id: testOrgId,
          user_id: createdUser.data.user!.id,
          state_hash: `${marker}_WRITE`,
          redirect_path: "/admin/settings/integrations",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        });
        expect(stateWrite.error).toBeTruthy();

        const connectionWrite = await client.from("google_oauth_connections").insert({
          organization_id: testOrgId,
          provider: "google",
          encrypted_refresh_token: "ciphertext",
          refresh_token_iv: "iv",
          refresh_token_tag: "tag"
        });
        expect(connectionWrite.error).toBeTruthy();
      }
    } finally {
      if (connectionId) await service.from("google_oauth_connections").delete().eq("id", connectionId);
      if (stateId) await service.from("google_oauth_states").delete().eq("id", stateId);
      if (testOrgId) await service.from("organizations").delete().eq("id", testOrgId);
      if (createdUser.data.user?.id) await service.auth.admin.deleteUser(createdUser.data.user.id);
    }
  });

  it("enforces Google OAuth constraints with synthetic non-secret rows", async () => {
    const marker = `LIVE_STAGING_OAUTH_CONSTRAINT_${Date.now()}`;
    const testUserEmail = `${marker.toLowerCase()}@example.invalid`;
    const testUserPassword = randomBytes(18).toString("base64url");
    const createdUser = await service.auth.admin.createUser({
      email: testUserEmail,
      password: testUserPassword,
      email_confirm: true
    });
    expect(createdUser.error).toBeNull();
    expect(createdUser.data.user?.id).toBeTruthy();

    let testOrgId: string | null = null;
    let connectionId: string | null = null;
    let stateId: string | null = null;

    try {
      const org = await service
        .from("organizations")
        .insert({
          name: "Live Staging OAuth Constraint Org",
          slug: `live-staging-oauth-${Date.now()}`,
          display_name: "Live Staging OAuth Constraint Org",
          legal_name: "Live Staging OAuth Constraint Org",
          timezone: "America/New_York"
        })
        .select("id")
        .single();
      expect(org.error).toBeNull();
      testOrgId = org.data!.id;

      await service.from("user_profiles").insert({
        id: createdUser.data.user!.id,
        email: testUserEmail,
        full_name: "Live Staging OAuth Constraints"
      });

      const invalidRedirect = await service.from("google_oauth_states").insert({
        organization_id: testOrgId,
        user_id: createdUser.data.user!.id,
        state_hash: `${marker}_BAD_REDIRECT`,
        redirect_path: "//evil.example",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });
      expect(invalidRedirect.error).toBeTruthy();

      const state = await service
        .from("google_oauth_states")
        .insert({
          organization_id: testOrgId,
          user_id: createdUser.data.user!.id,
          state_hash: `${marker}_STATE`,
          redirect_path: "/admin/settings/integrations",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        })
        .select("id")
        .single();
      expect(state.error).toBeNull();
      stateId = state.data!.id;

      const duplicateState = await service.from("google_oauth_states").insert({
        organization_id: testOrgId,
        user_id: createdUser.data.user!.id,
        state_hash: `${marker}_STATE`,
        redirect_path: "/admin/settings/integrations",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });
      expect(duplicateState.error).toBeTruthy();

      const incompleteRefreshTriplet = await service.from("google_oauth_connections").insert({
        organization_id: testOrgId,
        provider: "google",
        encrypted_refresh_token: "ciphertext",
        refresh_token_iv: "iv",
        status: "connected"
      });
      expect(incompleteRefreshTriplet.error).toBeTruthy();

      const connectedWithoutRefresh = await service.from("google_oauth_connections").insert({
        organization_id: testOrgId,
        provider: "google",
        status: "connected"
      });
      expect(connectedWithoutRefresh.error).toBeTruthy();

      const invalidProvider = await service.from("google_oauth_connections").insert({
        organization_id: testOrgId,
        provider: "not_google",
        encrypted_refresh_token: "ciphertext",
        refresh_token_iv: "iv",
        refresh_token_tag: "tag",
        status: "connected"
      });
      expect(invalidProvider.error).toBeTruthy();

      const connection = await service
        .from("google_oauth_connections")
        .insert({
          organization_id: testOrgId,
          provider: "google",
          encrypted_refresh_token: "ciphertext",
          refresh_token_iv: "iv",
          refresh_token_tag: "tag",
          status: "connected"
        })
        .select("id")
        .single();
      expect(connection.error).toBeNull();
      connectionId = connection.data!.id;

      const duplicateConnection = await service.from("google_oauth_connections").insert({
        organization_id: testOrgId,
        provider: "google",
        encrypted_refresh_token: "ciphertext-2",
        refresh_token_iv: "iv-2",
        refresh_token_tag: "tag-2",
        status: "connected"
      });
      expect(duplicateConnection.error).toBeTruthy();
    } finally {
      if (connectionId) await service.from("google_oauth_connections").delete().eq("id", connectionId);
      if (stateId) await service.from("google_oauth_states").delete().eq("id", stateId);
      if (testOrgId) await service.from("organizations").delete().eq("id", testOrgId);
      if (createdUser.data.user?.id) await service.auth.admin.deleteUser(createdUser.data.user.id);
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

  it("loads seeded availability, excludes a synthetic appointment, and preserves tenant boundaries", async () => {
    const serviceResult = await service
      .from("organization_services")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("display_order")
      .limit(1);
    expect(serviceResult.error).toBeNull();
    expect(serviceResult.data?.[0]?.id).toBeTruthy();
    const serviceId = serviceResult.data![0].id;
    const date = nextWeekdayDate(21);
    const noGoogleBusy = async () => [];
    const initial = await getAvailableAppointmentSlots(
      { organizationId: orgId, serviceId, date },
      { googleBusyProvider: noGoogleBusy }
    );
    expect(initial.timezone).toBe("America/New_York");
    expect(initial.durationMinutes).toBe(30);
    expect(initial.slots.length).toBeGreaterThan(0);

    const selected = initial.slots[0];
    const preferredTime = localTimeForAppointmentSlot(selected.startAt, initial.timezone);
    const marker = `LIVE_STAGING_AVAILABILITY_${Date.now()}`;
    let customerId: string | null = null;
    let appointmentId: string | null = null;

    try {
      const customer = await service
        .from("customers")
        .insert({
          organization_id: orgId,
          full_name: marker,
          email: `${marker.toLowerCase()}@example.invalid`,
          mobile_phone: "000-000-0000"
        })
        .select("id")
        .single();
      expect(customer.error).toBeNull();
      customerId = customer.data!.id;

      const appointment = await service
        .from("appointment_requests")
        .insert({
          organization_id: orgId,
          customer_id: customerId,
          service_id: serviceId,
          status: "awaiting_review",
          document_category: "affidavit",
          document_count: 1,
          signer_count: 1,
          notarizations_not_sure: true,
          signer_location: "Florida",
          all_signers_have_government_id: true,
          preferred_date: date,
          preferred_time: preferredTime,
          urgency: "not_urgent",
          administrative_notes: marker
        })
        .select("id,service_id,service_name_snapshot,service_duration_minutes_snapshot,service_price_cents_snapshot,service_currency_snapshot")
        .single();
      expect(appointment.error).toBeNull();
      appointmentId = appointment.data!.id;
      expect(appointment.data).toMatchObject({
        service_id: serviceId,
        service_duration_minutes_snapshot: 30,
        service_currency_snapshot: "USD"
      });
      expect(appointment.data?.service_name_snapshot).toBeTruthy();
      expect(Number.isInteger(appointment.data?.service_price_cents_snapshot)).toBe(true);

      const afterInsert = await getAvailableAppointmentSlots(
        { organizationId: orgId, serviceId, date },
        { googleBusyProvider: noGoogleBusy }
      );
      expect(afterInsert.slots.map((slot) => slot.startAt)).not.toContain(selected.startAt);

      await expect(getAvailableAppointmentSlots(
        {
          organizationId: orgId,
          serviceId: "00000000-0000-4000-8000-000000000099",
          date
        },
        { googleBusyProvider: noGoogleBusy }
      )).rejects.toMatchObject({ code: "invalid_request" });
    } finally {
      if (appointmentId) await service.from("appointment_requests").delete().eq("id", appointmentId);
      if (customerId) await service.from("customers").delete().eq("id", customerId);
    }

    const cleanup = await service
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("full_name", marker);
    expect(cleanup.error).toBeNull();
    expect(cleanup.count).toBe(0);
  });

  it("persists immutable service snapshots and uses them for appointment conflicts", async () => {
    const marker = `live_snapshot_${Date.now()}`;
    const date = nextWeekdayDate(28);
    let serviceAId: string | null = null;
    let serviceBId: string | null = null;
    let inactiveServiceId: string | null = null;
    let otherOrganizationId: string | null = null;
    let otherServiceId: string | null = null;
    let appointmentId: string | null = null;
    let customerId: string | null = null;
    const originalSmtpPassword = process.env.SMTP_PASSWORD;

    try {
      const serviceA = await service
        .from("organization_services")
        .insert({
          organization_id: orgId,
          internal_name: `${marker}_a`,
          customer_name: "Snapshot Test Service A",
          base_price_cents: 2500,
          currency: "USD",
          default_duration_minutes: 60,
          is_active: true,
          delivery_type: "remote",
          metadata: { bookable: true, fixture: marker }
        })
        .select("id")
        .single();
      expect(serviceA.error).toBeNull();
      const serviceAIdValue = serviceA.data!.id;
      serviceAId = serviceAIdValue;

      const availability = await getAvailableAppointmentSlots({
        organizationId: orgId,
        serviceId: serviceAIdValue,
        date
      });
      expect(availability.slots.length).toBeGreaterThan(0);
      const selected = availability.slots[0];
      const preferredTime = localTimeForAppointmentSlot(selected.startAt, availability.timezone);

      process.env.SMTP_PASSWORD = "";
      const appointment = await repository.createAppointment({
        serviceId: serviceAIdValue,
        fullName: `LIVE_STAGING_SNAPSHOT_${marker}`,
        email: `${marker}@example.invalid`,
        mobilePhone: "000-000-0000",
        documentCategory: "business_document",
        documentCount: 1,
        signerCount: 1,
        estimatedNotarizations: 1,
        notarizationsNotSure: false,
        hasWitnessLines: false,
        witnessesAvailable: false,
        signerLocation: "Florida",
        allSignersHaveGovernmentId: true,
        preferredDate: date,
        preferredTime,
        urgency: "not_urgent",
        administrativeNotes: `LIVE_STAGING_SNAPSHOT_${marker}`,
        consentAccepted: true,
        privacyPolicyVersion: "staging-integration",
        termsVersion: "staging-integration"
      });
      appointmentId = appointment.id;
      customerId = appointment.customerId;
      expect(appointment).toMatchObject({
        serviceId: serviceAId,
        serviceNameSnapshot: "Snapshot Test Service A",
        serviceDurationMinutesSnapshot: 60,
        servicePriceCentsSnapshot: 2500,
        serviceCurrencySnapshot: "USD"
      });

      const sourceEdit = await service
        .from("organization_services")
        .update({
          customer_name: "Edited Source Service A",
          default_duration_minutes: 90,
          base_price_cents: 5000
        })
        .eq("id", serviceAId);
      expect(sourceEdit.error).toBeNull();
      const unchanged = await service
        .from("appointment_requests")
        .select("service_name_snapshot,service_duration_minutes_snapshot,service_price_cents_snapshot,service_currency_snapshot")
        .eq("id", appointmentId)
        .single();
      expect(unchanged.error).toBeNull();
      expect(unchanged.data).toEqual({
        service_name_snapshot: "Snapshot Test Service A",
        service_duration_minutes_snapshot: 60,
        service_price_cents_snapshot: 2500,
        service_currency_snapshot: "USD"
      });

      const directSnapshotEdit = await service
        .from("appointment_requests")
        .update({ service_duration_minutes_snapshot: 5 })
        .eq("id", appointmentId);
      expect(directSnapshotEdit.error).toBeTruthy();

      const protectedDelete = await service
        .from("organization_services")
        .delete()
        .eq("id", serviceAId);
      expect(protectedDelete.error).toBeTruthy();

      const serviceB = await service
        .from("organization_services")
        .insert({
          organization_id: orgId,
          internal_name: `${marker}_b`,
          customer_name: "Snapshot Test Service B",
          base_price_cents: 2500,
          currency: "USD",
          default_duration_minutes: 75,
          is_active: true,
          delivery_type: "remote",
          metadata: { bookable: true, fixture: marker }
        })
        .select("id")
        .single();
      expect(serviceB.error).toBeNull();
      const serviceBIdValue = serviceB.data!.id;
      serviceBId = serviceBIdValue;

      const reassigned = await repository.updateAppointment(appointmentId, {
        serviceId: serviceBIdValue
      });
      expect(reassigned).toMatchObject({
        serviceId: serviceBId,
        serviceNameSnapshot: "Snapshot Test Service B",
        serviceDurationMinutesSnapshot: 75,
        servicePriceCentsSnapshot: 2500,
        serviceCurrencySnapshot: "USD"
      });

      const seededService = await service
        .from("organization_services")
        .select("id")
        .eq("organization_id", orgId)
        .eq("internal_name", "florida_remote_online_notarial_act")
        .single();
      expect(seededService.error).toBeNull();
      const withConflicts = await getAvailableAppointmentSlots(
        {
          organizationId: orgId,
          serviceId: seededService.data!.id,
          date,
          includeUnavailable: true
        },
        { googleBusyProvider: async () => [] }
      );
      const localSlots = withConflicts.slots.map((slot) => ({
        time: localTimeForAppointmentSlot(slot.startAt, withConflicts.timezone),
        available: slot.available,
        reason: slot.reason
      }));
      expect(localSlots).toContainEqual({
        time: preferredTime,
        available: false,
        reason: "appointment_conflict"
      });
      expect(localSlots).toContainEqual({
        time: addMinutes(preferredTime, 30),
        available: false,
        reason: "appointment_conflict"
      });

      const inactiveService = await service
        .from("organization_services")
        .insert({
          organization_id: orgId,
          internal_name: `${marker}_inactive`,
          customer_name: "Inactive Snapshot Test Service",
          base_price_cents: 2500,
          currency: "USD",
          default_duration_minutes: 30,
          is_active: false,
          delivery_type: "remote",
          metadata: { bookable: true, fixture: marker }
        })
        .select("id")
        .single();
      expect(inactiveService.error).toBeNull();
      const inactiveServiceIdValue = inactiveService.data!.id;
      inactiveServiceId = inactiveServiceIdValue;
      await expect(repository.updateAppointment(appointmentId, {
        serviceId: inactiveServiceIdValue
      })).rejects.toThrow("not available");

      const otherOrganization = await service
        .from("organizations")
        .insert({
          name: `LIVE_STAGING_SNAPSHOT_OTHER_${marker}`,
          slug: `${marker.replaceAll("_", "-")}-other`,
          display_name: `LIVE_STAGING_SNAPSHOT_OTHER_${marker}`,
          legal_name: `LIVE_STAGING_SNAPSHOT_OTHER_${marker}`,
          timezone: "America/New_York"
        })
        .select("id")
        .single();
      expect(otherOrganization.error).toBeNull();
      const otherOrganizationIdValue = otherOrganization.data!.id;
      otherOrganizationId = otherOrganizationIdValue;
      const otherService = await service
        .from("organization_services")
        .insert({
          organization_id: otherOrganizationIdValue,
          internal_name: `${marker}_other`,
          customer_name: "Other Organization Service",
          base_price_cents: 2500,
          currency: "USD",
          default_duration_minutes: 30,
          is_active: true,
          delivery_type: "remote",
          metadata: { bookable: true, fixture: marker }
        })
        .select("id")
        .single();
      expect(otherService.error).toBeNull();
      const otherServiceIdValue = otherService.data!.id;
      otherServiceId = otherServiceIdValue;
      await expect(repository.updateAppointment(appointmentId, {
        serviceId: otherServiceIdValue
      })).rejects.toThrow("not available");
    } finally {
      if (originalSmtpPassword === undefined) delete process.env.SMTP_PASSWORD;
      else process.env.SMTP_PASSWORD = originalSmtpPassword;
      if (appointmentId) await service.from("appointment_requests").delete().eq("id", appointmentId);
      if (customerId) await service.from("customers").delete().eq("id", customerId);
      for (const id of [serviceAId, serviceBId, inactiveServiceId, otherServiceId]) {
        if (id) await service.from("organization_services").delete().eq("id", id);
      }
      if (otherOrganizationId) await service.from("organizations").delete().eq("id", otherOrganizationId);
    }
  }, 30_000);

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

    try {
      const staffClient = createLiveClient(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "settings-staff");
      const staffLogin = await staffClient.auth.signInWithPassword({
        email: env.STAGING_STAFF_DEMO_EMAIL!,
        password: env.STAGING_STAFF_DEMO_PASSWORD!
      });
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
    }
  });
});

function nextWeekdayDate(daysAhead: number) {
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() + daysAhead);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor.toISOString().slice(0, 10);
}

function addMinutes(time: string, minutes: number) {
  const [hours, currentMinutes] = time.split(":").map(Number);
  const total = hours * 60 + currentMinutes + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
