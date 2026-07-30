import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queryClientPortal } from "@/lib/server/client-portal";
import { hashAppointmentAccessToken } from "@/lib/server/repository";

function environment() {
  const text = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  return {
    ...process.env,
    ...Object.fromEntries(
      text
        .split(/\n/)
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
        })
    )
  };
}

const env = environment();
const enabled = Boolean(
  env.LIVE_SUPABASE_ENVIRONMENT === "staging" &&
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.ADMIN_DEMO_EMAIL &&
    env.ADMIN_DEMO_PASSWORD &&
    env.STAGING_STAFF_DEMO_EMAIL &&
    env.STAGING_STAFF_DEMO_PASSWORD
);
const suite = enabled ? describe : describe.skip;

type AppointmentFixture = Readonly<{ customerId: string; appointmentId: string }>;

suite("client workspace persistence migration 0014", () => {
  const marker = `LIVE_CLIENT_WORKSPACE_${Date.now()}`;
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, storageKey: "client-workspace-service" }
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, storageKey: "client-workspace-anon" }
  });
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, storageKey: "client-workspace-admin" }
  });
  const staff = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, storageKey: "client-workspace-staff" }
  });
  let organizationId = "";
  let otherOrganizationId = "";
  let primaryFixture: AppointmentFixture | null = null;
  let otherFixture: AppointmentFixture | null = null;
  let tokenId = "";

  async function createAppointmentFixture(organizationId: string, label: string): Promise<AppointmentFixture> {
    const customer = await service
      .from("customers")
      .insert({
        organization_id: organizationId,
        full_name: `${marker} ${label}`,
        email: `${marker.toLowerCase()}-${label.toLowerCase()}@example.invalid`,
        mobile_phone: "000-000-0000"
      })
      .select("id")
      .single();
    expect(customer.error).toBeNull();

    const appointment = await service
      .from("appointment_requests")
      .insert({
        organization_id: organizationId,
        customer_id: customer.data!.id,
        document_category: "other",
        document_count: 1,
        signer_count: 1,
        notarizations_not_sure: false,
        signer_location: "Florida",
        all_signers_have_government_id: true,
        preferred_date: "2026-08-01",
        preferred_time: "10:00",
        urgency: "not_urgent"
      })
      .select("id")
      .single();
    expect(appointment.error).toBeNull();
    return { customerId: customer.data!.id, appointmentId: appointment.data!.id };
  }

  beforeAll(async () => {
    const org = await service
      .from("organizations")
      .select("id")
      .eq("slug", env.DEFAULT_ORGANIZATION_SLUG || "avenseal")
      .single();
    expect(org.error).toBeNull();
    organizationId = org.data!.id;
    primaryFixture = await createAppointmentFixture(organizationId, "PRIMARY");

    const otherOrganization = await service
      .from("organizations")
      .insert({
        name: `${marker} Other Organization`,
        slug: `${marker.toLowerCase()}-other`,
        display_name: `${marker} Other Organization`,
        legal_name: `${marker} Other Organization`,
        timezone: "America/New_York"
      })
      .select("id")
      .single();
    expect(otherOrganization.error).toBeNull();
    otherOrganizationId = otherOrganization.data!.id;
    otherFixture = await createAppointmentFixture(otherOrganizationId, "OTHER");

    expect(
      (await admin.auth.signInWithPassword({
        email: env.ADMIN_DEMO_EMAIL!,
        password: env.ADMIN_DEMO_PASSWORD!
      })).error
    ).toBeNull();
    expect(
      (await staff.auth.signInWithPassword({
        email: env.STAGING_STAFF_DEMO_EMAIL!,
        password: env.STAGING_STAFF_DEMO_PASSWORD!
      })).error
    ).toBeNull();
  });

  afterAll(async () => {
    if (tokenId) await service.from("appointment_access_tokens").delete().eq("id", tokenId);
    if (primaryFixture) await service.from("customers").delete().eq("id", primaryFixture.customerId);
    if (otherOrganizationId) await service.from("organizations").delete().eq("id", otherOrganizationId);
  });

  it("exposes migration 0014 external-session and token columns", async () => {
    const session = await service
      .from("external_sessions")
      .select("id,organization_id,appointment_request_id,provider,session_name,launch_url,reference_number,status,notes,metadata,created_at,updated_at")
      .limit(0);
    expect(session.error).toBeNull();
    const token = await service
      .from("appointment_access_tokens")
      .select("id,organization_id,appointment_request_id,token_hash,expires_at,revoked_at,last_used_at,purpose,created_by,issued_at")
      .limit(0);
    expect(token.error).toBeNull();
  });

  it("enforces anonymous, staff, admin, and cross-tenant RLS behavior", async () => {
    const primary = primaryFixture!;
    const other = otherFixture!;
    const staffCreate = await staff.from("external_sessions").insert({
      organization_id: organizationId,
      appointment_request_id: primary.appointmentId,
      provider: marker,
      session_name: marker,
      status: "scheduled",
      metadata: {}
    });
    expect(staffCreate.data).toBeNull();
    expect(staffCreate.error).toMatchObject({ code: "42501" });
    const created = await admin
      .from("external_sessions")
      .insert({
        organization_id: organizationId,
        appointment_request_id: primary.appointmentId,
        provider: marker,
        session_name: marker,
        launch_url: "https://example.invalid/session",
        status: "scheduled",
        metadata: {}
      })
      .select("id,status")
      .single();
    expect(created.error).toBeNull();
    const sessionId = created.data!.id;

    const anonRead = await anon.from("external_sessions").select("id").eq("id", sessionId);
    expect(anonRead.error).toBeNull();
    expect(anonRead.data).toEqual([]);
    const anonCreate = await anon.from("external_sessions").insert({
      organization_id: otherOrganizationId,
      appointment_request_id: other.appointmentId,
      provider: marker,
      session_name: marker,
      status: "scheduled",
      metadata: {}
    });
    expect(anonCreate.data).toBeNull();
    expect(anonCreate.error).toMatchObject({ code: "42501" });

    const staffRead = await staff.from("external_sessions").select("id").eq("id", sessionId);
    expect(staffRead.error).toBeNull();
    expect(staffRead.data).toEqual([{ id: sessionId }]);
    const staffUpdate = await staff
      .from("external_sessions")
      .update({ provider: "blocked" })
      .eq("id", sessionId)
      .select("id");
    expect(staffUpdate.error).toBeNull();
    expect(staffUpdate.data).toEqual([]);
    const staffDelete = await staff.from("external_sessions").delete().eq("id", sessionId).select("id");
    expect(staffDelete.error).toBeNull();
    expect(staffDelete.data).toEqual([]);

    const updated = await admin
      .from("external_sessions")
      .update({ status: "ready" })
      .eq("id", sessionId)
      .select("id,status")
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual({ id: sessionId, status: "ready" });

    const otherSession = await service
      .from("external_sessions")
      .insert({
        organization_id: otherOrganizationId,
        appointment_request_id: other.appointmentId,
        provider: marker,
        session_name: marker,
        status: "scheduled",
        metadata: {}
      })
      .select("id")
      .single();
    expect(otherSession.error).toBeNull();
    const otherSessionId = otherSession.data!.id;
    const crossTenantRead = await admin.from("external_sessions").select("id").eq("id", otherSessionId);
    expect(crossTenantRead.error).toBeNull();
    expect(crossTenantRead.data).toEqual([]);
    const crossTenantUpdate = await admin
      .from("external_sessions")
      .update({ status: "cancelled" })
      .eq("id", otherSessionId)
      .select("id");
    expect(crossTenantUpdate.error).toBeNull();
    expect(crossTenantUpdate.data).toEqual([]);
    const crossTenantDelete = await admin.from("external_sessions").delete().eq("id", otherSessionId).select("id");
    expect(crossTenantDelete.error).toBeNull();
    expect(crossTenantDelete.data).toEqual([]);
    const unchanged = await service.from("external_sessions").select("status").eq("id", otherSessionId).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toEqual({ status: "scheduled" });

    const deleted = await admin.from("external_sessions").delete().eq("id", sessionId).select("id");
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual([{ id: sessionId }]);
  });

  it("keeps portal projections safe through the actual query boundary", async () => {
    const result = await queryClientPortal("test", {
      async getAppointmentByAccessToken() {
        return { appointmentId: primaryFixture!.appointmentId, organizationId, reference: "SAFE", customerName: "Customer", customerEmail: "customer@example.invalid", status: "confirmed", customerStatusLabel: "Confirmed", preferredDate: "2026-08-01", preferredTime: "10:00", timezone: "America/New_York", serviceName: "RON", paymentStatus: null, amountDueCents: null, currency: "USD", checkoutUrl: null, paymentExpiresAt: null, businessName: "Avenseal", businessEmail: "support@example.invalid", businessPhone: "", meetingUrl: null };
      },
      async getExternalSession() {
        return { appointmentId: primaryFixture!.appointmentId, organizationId, provider: "Provider", sessionName: "Session", launchUrl: "https://example.invalid", referenceNumber: "PRIVATE", status: "scheduled", notes: "PRIVATE", createdAt: "PRIVATE", updatedAt: "PRIVATE", metadata: { secret: "PRIVATE" } };
      }
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PRIVATE");
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain(primaryFixture!.appointmentId);
  });

  it("stores only hashes and recognizes revocation and expiration columns", async () => {
    const plaintext = randomBytes(32).toString("base64url");
    const token = await service
      .from("appointment_access_tokens")
      .insert({
        organization_id: organizationId,
        appointment_request_id: primaryFixture!.appointmentId,
        token_hash: hashAppointmentAccessToken(plaintext),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        purpose: "client_workspace"
      })
      .select("id,token_hash,purpose,issued_at,expires_at,revoked_at,last_used_at,created_by")
      .single();
    expect(token.error).toBeNull();
    tokenId = token.data!.id;
    expect(token.data!.token_hash).not.toBe(plaintext);
    expect(token.data!.purpose).toBe("client_workspace");
    expect(token.data!.issued_at).toBeTruthy();
  });
});
