create extension if not exists "pgcrypto";

create type appointment_status as enum (
  'awaiting_review',
  'awaiting_payment',
  'confirmed',
  'ready',
  'completed',
  'cancelled',
  'declined',
  'follow_up_required'
);

create type document_category as enum (
  'affidavit',
  'power_of_attorney',
  'estate_planning',
  'business_document',
  'consent_or_authorization',
  'real_estate_related',
  'school_or_travel',
  'other',
  'not_sure'
);

create type urgency as enum ('same_day', 'next_available', 'specific_date', 'not_urgent');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  mobile_phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  status appointment_status not null default 'awaiting_review',
  document_category document_category not null,
  document_count integer not null check (document_count between 1 and 20),
  signer_count integer not null check (signer_count between 1 and 10),
  estimated_notarizations integer check (estimated_notarizations between 1 and 40),
  notarizations_not_sure boolean not null default false,
  has_witness_lines boolean,
  witnesses_available boolean,
  signer_location text not null,
  all_signers_have_government_id boolean not null,
  preferred_date date not null,
  preferred_time time not null,
  urgency urgency not null,
  administrative_notes text,
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointment_signers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  position integer not null,
  current_location text,
  has_government_id boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointment_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  category document_category not null,
  document_count integer not null check (document_count between 1 and 20),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_minutes integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  exception_date date not null,
  start_time time,
  end_time time,
  is_available boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table internal_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid references appointment_requests(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  author_user_id uuid references user_profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  from_status appointment_status,
  to_status appointment_status not null,
  changed_by_user_id uuid references user_profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  privacy_policy_version text not null,
  terms_version text not null,
  consented_at timestamptz not null,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table communication_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid references appointment_requests(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  channel text not null check (channel in ('manual_email', 'manual_phone', 'manual_sms', 'system_placeholder')),
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  summary text not null,
  created_by_user_id uuid references user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references user_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table business_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  business_name text not null,
  support_email text,
  support_phone text,
  pricing_headline text not null default 'Clear pricing shown before your appointment is confirmed.',
  pricing_note text not null default 'Pricing content is awaiting business approval.',
  privacy_policy_version text not null,
  terms_version text not null,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_org_email_idx on customers (organization_id, email);
create index customers_org_phone_idx on customers (organization_id, mobile_phone);
create index appointments_org_status_date_idx on appointment_requests (organization_id, status, preferred_date);
create index appointments_org_customer_idx on appointment_requests (organization_id, customer_id);
create index status_history_request_idx on status_history (appointment_request_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

create or replace function user_org_ids()
returns setof uuid
language sql
stable
security definer
as $$
  select organization_id from organization_users where user_id = auth.uid()
$$;

alter table organizations enable row level security;
alter table user_profiles enable row level security;
alter table organization_users enable row level security;
alter table customers enable row level security;
alter table appointment_requests enable row level security;
alter table appointment_signers enable row level security;
alter table appointment_documents enable row level security;
alter table availability_rules enable row level security;
alter table availability_exceptions enable row level security;
alter table internal_notes enable row level security;
alter table status_history enable row level security;
alter table consent_records enable row level security;
alter table communication_records enable row level security;
alter table audit_logs enable row level security;
alter table business_settings enable row level security;

create policy "organization members can read organizations" on organizations for select using (id in (select user_org_ids()));
create policy "users can read own profile" on user_profiles for select using (id = auth.uid());
create policy "members can read organization users" on organization_users for select using (organization_id in (select user_org_ids()));

create policy "members can read customers" on customers for select using (organization_id in (select user_org_ids()));
create policy "members can update customers" on customers for update using (organization_id in (select user_org_ids()));

create policy "members can read appointments" on appointment_requests for select using (organization_id in (select user_org_ids()));
create policy "members can update appointments" on appointment_requests for update using (organization_id in (select user_org_ids()));

create policy "members can read signers" on appointment_signers for select using (organization_id in (select user_org_ids()));
create policy "members can read documents" on appointment_documents for select using (organization_id in (select user_org_ids()));

create policy "members can manage availability" on availability_rules for all using (organization_id in (select user_org_ids())) with check (organization_id in (select user_org_ids()));
create policy "members can manage exceptions" on availability_exceptions for all using (organization_id in (select user_org_ids())) with check (organization_id in (select user_org_ids()));

create policy "members can read notes" on internal_notes for select using (organization_id in (select user_org_ids()));
create policy "members can insert notes" on internal_notes for insert with check (organization_id in (select user_org_ids()));

create policy "members can read status history" on status_history for select using (organization_id in (select user_org_ids()));
create policy "members can insert status history" on status_history for insert with check (organization_id in (select user_org_ids()));

create policy "members can read consent records" on consent_records for select using (organization_id in (select user_org_ids()));
create policy "members can read communication records" on communication_records for select using (organization_id in (select user_org_ids()));
create policy "members can read audit logs" on audit_logs for select using (organization_id in (select user_org_ids()));
create policy "members can insert audit logs" on audit_logs for insert with check (organization_id in (select user_org_ids()));
create policy "members can read settings" on business_settings for select using (organization_id in (select user_org_ids()));
create policy "members can update settings" on business_settings for update using (organization_id in (select user_org_ids()));

