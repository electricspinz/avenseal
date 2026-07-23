import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const required = [
  "LIVE_SUPABASE_ENVIRONMENT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_DEMO_EMAIL",
  "ADMIN_DEMO_PASSWORD",
  "STAGING_STAFF_DEMO_EMAIL",
  "STAGING_STAFF_DEMO_PASSWORD"
];

const organizationId = "00000000-0000-4000-8000-000000000001";
const defaultSlug = "avenseal";
const timezone = "America/New_York";
const weekdays = [1, 2, 3, 4, 5];

function readLocalEnv() {
  const local = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const parsed = Object.fromEntries(
    local
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        if (index < 0) return [line, ""];
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
      })
  );
  return { ...process.env, ...parsed };
}

function assertSafeEnvironment(env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required staging seed environment variables: ${missing.join(", ")}`);
  }
  if (env.LIVE_SUPABASE_ENVIRONMENT !== "staging") {
    throw new Error("Refusing to seed: LIVE_SUPABASE_ENVIRONMENT must be exactly staging.");
  }
  const envText = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.DEFAULT_ORGANIZATION_SLUG,
    env.SUPABASE_PROJECT_LABEL
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(prod|production)\b/.test(envText)) {
    throw new Error("Refusing to seed: environment metadata looks production-like.");
  }
}

function createSupabase(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

async function requireOk(label, promise) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  return result.data;
}

async function findAuthUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Auth user lookup failed: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function upsertAuthUser(supabase, input) {
  const existing = await findAuthUserByEmail(supabase, input.email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        staging_fixture: true
      },
      app_metadata: {
        ...existing.app_metadata,
        staging_fixture: true,
        avenseal_role: input.role
      }
    });
    if (error) throw new Error(`Auth user update failed: ${error.message}`);
    return data.user;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      staging_fixture: true
    },
    app_metadata: {
      staging_fixture: true,
      avenseal_role: input.role
    }
  });
  if (error) throw new Error(`Auth user create failed: ${error.message}`);
  return data.user;
}

async function seedOrganization(supabase, env) {
  const slug = env.DEFAULT_ORGANIZATION_SLUG || defaultSlug;
  await requireOk("Organization upsert", supabase.from("organizations").upsert({
    id: organizationId,
    name: "Avenseal",
    display_name: "Avenseal",
    legal_name: "Avenseal",
    slug,
    status: "active",
    business_mode: "solo",
    timezone,
    default_delivery_method: "remote_online_notarization"
  }, { onConflict: "id" }));

  await requireOk("Business settings upsert", supabase.from("business_settings").upsert({
    organization_id: organizationId,
    business_name: "Avenseal",
    support_email: "staging-support@example.invalid",
    support_phone: "000-000-0000",
    pricing_headline: "Clear pricing shown before your appointment is confirmed.",
    pricing_note: "Staging fixture pricing content.",
    privacy_policy_version: "staging-fixture",
    terms_version: "staging-fixture",
    timezone,
    website: "https://staging.example.invalid",
    description: "Synthetic staging fixture for Avenseal validation.",
    default_delivery_method: "remote_online_notarization"
  }, { onConflict: "organization_id" }));

  const schedule = await requireOk("Availability schedule upsert", supabase
    .from("organization_availability_schedules")
    .upsert({
      organization_id: organizationId,
      name: "Avenseal staging primary schedule",
      timezone,
      is_primary: true
    }, { onConflict: "organization_id" })
    .select("id")
    .single());

  for (const weekday of weekdays) {
    await requireOk(`Availability interval upsert weekday ${weekday}`, supabase
      .from("organization_availability_intervals")
      .upsert({
        organization_id: organizationId,
        schedule_id: schedule.id,
        weekday,
        start_time: "09:30",
        end_time: "18:00",
        display_order: 0
      }, { onConflict: "schedule_id,weekday,display_order" }));
  }

  await requireOk("Appointment rules upsert", supabase.from("appointment_rule_settings").upsert({
    organization_id: organizationId,
    default_duration_minutes: 30,
    buffer_before_minutes: null,
    buffer_after_minutes: null,
    minimum_booking_notice_minutes: null,
    maximum_advance_booking_days: null,
    same_day_enabled: true,
    maximum_appointments_per_day: null,
    customer_rescheduling_enabled: null,
    customer_cancellation_enabled: null,
    emergency_appointment_enabled: null,
    automatic_approval_enabled: false,
    same_day_payment_window_minutes: 30,
    future_payment_window_minutes: 720,
    complimentary_reschedule_count: 1,
    reschedule_notice_minutes: 120,
    late_cancellation_cutoff_minutes: 120,
    late_cancellation_retained_cents: 1500,
    no_show_grace_minutes: 10
  }, { onConflict: "organization_id" }));

  await requireOk("Organization service upsert", supabase.from("organization_services").upsert({
    organization_id: organizationId,
    internal_name: "florida_remote_online_notarial_act",
    customer_name: "Remote Online Notarial Act",
    description: "Synthetic staging fixture service.",
    base_price_cents: 2500,
    currency: "USD",
    default_duration_minutes: 30,
    is_active: true,
    display_order: 1,
    delivery_type: "remote"
  }, { onConflict: "organization_id,internal_name" }));

  await requireOk("Communication settings upsert", supabase.from("communication_settings").upsert({
    organization_id: organizationId,
    sender_name: "Avenseal Staging",
    reply_to_email: "staging-support@example.invalid",
    support_phone: "000-000-0000",
    email_reminders_enabled: false,
    sms_reminders_enabled: false,
    review_requests_enabled: false,
    confirmation_messaging_enabled: false
  }, { onConflict: "organization_id" }));

  await requireOk("AI concierge settings upsert", supabase.from("ai_concierge_settings").upsert({
    organization_id: organizationId,
    concierge_enabled: true,
    display_name: "Ava",
    tone_preset: "professional_and_warm",
    human_support_destination: "staging-support@example.invalid",
    booking_assistance_enabled: true,
    faq_assistance_enabled: true
  }, { onConflict: "organization_id" }));

  for (const integration of [
    { provider: "google_calendar", status: "disconnected", account_label: null },
    { provider: "stripe", status: "test_mode", account_label: "Stripe test mode" },
    { provider: "gmail_smtp", status: "disconnected", account_label: "Gmail SMTP" }
  ]) {
    await requireOk(`Integration upsert ${integration.provider}`, supabase.from("organization_integrations").upsert({
      organization_id: organizationId,
      ...integration
    }, { onConflict: "organization_id,provider" }));
  }
}

async function seedMembership(supabase, user, role, fullName) {
  await requireOk(`Profile upsert for ${role}`, supabase.from("user_profiles").upsert({
    id: user.id,
    email: user.email,
    full_name: fullName
  }, { onConflict: "id" }));

  await requireOk(`Membership upsert for ${role}`, supabase.from("organization_users").upsert({
    organization_id: organizationId,
    user_id: user.id,
    role,
    status: "active"
  }, { onConflict: "organization_id,user_id" }));
}

async function verifySeed(supabase) {
  const organization = await requireOk("Organization verification", supabase
    .from("organizations")
    .select("id,slug,status,business_mode,timezone")
    .eq("id", organizationId)
    .single());
  if (organization.status !== "active" || organization.business_mode !== "solo" || organization.timezone !== timezone) {
    throw new Error("Staging organization verification failed.");
  }

  const { count, error } = await supabase
    .from("organization_availability_intervals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("weekday", weekdays);
  if (error) throw new Error(`Availability verification failed: ${error.message}`);
  if (count !== 5) throw new Error(`Expected 5 staging weekday intervals, found ${count ?? 0}.`);

  const members = await requireOk("Membership verification", supabase
    .from("organization_users")
    .select("role,status")
    .eq("organization_id", organizationId)
    .eq("status", "active"));
  const roles = new Set(members.map((member) => member.role));
  if (!roles.has("owner") || !roles.has("staff")) {
    throw new Error("Expected active owner and staff staging memberships.");
  }
}

async function main() {
  const env = readLocalEnv();
  assertSafeEnvironment(env);
  const supabase = createSupabase(env);

  await seedOrganization(supabase, env);
  const admin = await upsertAuthUser(supabase, {
    email: env.ADMIN_DEMO_EMAIL,
    password: env.ADMIN_DEMO_PASSWORD,
    fullName: "Avenseal Staging Admin",
    role: "owner"
  });
  const staff = await upsertAuthUser(supabase, {
    email: env.STAGING_STAFF_DEMO_EMAIL,
    password: env.STAGING_STAFF_DEMO_PASSWORD,
    fullName: "Avenseal Staging Staff",
    role: "staff"
  });

  await seedMembership(supabase, admin, "owner", "Avenseal Staging Admin");
  await seedMembership(supabase, staff, "staff", "Avenseal Staging Staff");
  await verifySeed(supabase);

  console.log("Supabase staging seed completed.");
  console.log("Seeded synthetic fixtures: organization, settings, weekday hours, rules, integrations, admin membership, staff membership.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Supabase staging seed failed.");
  process.exit(1);
});
