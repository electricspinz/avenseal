create type business_mode as enum ('solo', 'team', 'enterprise');
create type appointment_delivery_method as enum ('remote_online_notarization');
create type service_delivery_type as enum ('remote', 'in_person');
create type concierge_tone_preset as enum ('professional_and_warm', 'formal', 'friendly', 'concise');

alter table organizations
  add column if not exists business_mode business_mode not null default 'solo',
  add column if not exists display_name text,
  add column if not exists legal_name text,
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists default_delivery_method appointment_delivery_method not null default 'remote_online_notarization';

update organizations
set
  display_name = coalesce(display_name, name),
  legal_name = coalesce(legal_name, name)
where display_name is null or legal_name is null;

alter table organizations
  alter column display_name set not null,
  alter column legal_name set not null;

alter table organization_users drop constraint if exists organization_users_role_check;
alter table organization_users
  add constraint organization_users_role_check check (role in ('owner', 'admin', 'notary', 'staff'));

alter table business_settings
  add column if not exists website text,
  add column if not exists description text,
  add column if not exists default_delivery_method appointment_delivery_method not null default 'remote_online_notarization';

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from organization_users where user_id = auth.uid()
$$;

create or replace function can_manage_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_users
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
$$;

create table organization_availability_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  name text not null default 'Primary schedule',
  timezone text not null default 'America/New_York',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_availability_intervals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  schedule_id uuid not null references organization_availability_schedules(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_interval_time_order check (start_time < end_time)
);

create unique index availability_intervals_order_idx
  on organization_availability_intervals (schedule_id, weekday, display_order);
create index availability_intervals_lookup_idx
  on organization_availability_intervals (organization_id, weekday, start_time);

create table appointment_rule_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  default_duration_minutes integer not null default 30 check (default_duration_minutes between 5 and 240),
  buffer_before_minutes integer check (buffer_before_minutes is null or buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer check (buffer_after_minutes is null or buffer_after_minutes between 0 and 240),
  minimum_booking_notice_minutes integer check (minimum_booking_notice_minutes is null or minimum_booking_notice_minutes between 0 and 43200),
  maximum_advance_booking_days integer check (maximum_advance_booking_days is null or maximum_advance_booking_days between 1 and 730),
  same_day_enabled boolean not null default true,
  maximum_appointments_per_day integer check (maximum_appointments_per_day is null or maximum_appointments_per_day between 1 and 200),
  customer_rescheduling_enabled boolean,
  customer_cancellation_enabled boolean,
  emergency_appointment_enabled boolean,
  automatic_approval_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  internal_name text not null,
  customer_name text not null,
  description text,
  base_price_cents integer check (base_price_cents is null or base_price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  default_duration_minutes integer not null default 30 check (default_duration_minutes between 5 and 240),
  is_active boolean not null default true,
  display_order integer not null default 0,
  delivery_type service_delivery_type not null default 'remote',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, internal_name)
);

create index organization_services_org_order_idx
  on organization_services (organization_id, is_active, display_order);

create table communication_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  sender_name text not null default 'Avenseal',
  reply_to_email text,
  support_phone text,
  email_reminders_enabled boolean not null default false,
  sms_reminders_enabled boolean not null default false,
  review_requests_enabled boolean not null default false,
  confirmation_messaging_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_concierge_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  concierge_enabled boolean not null default true,
  display_name text not null default 'Ava',
  greeting text not null default 'Hi, I''m Ava, Avenseal''s virtual booking assistant. I''ll help you prepare and request a remote online notary appointment.',
  tone_preset concierge_tone_preset not null default 'professional_and_warm',
  escalation_message text not null default 'A commissioned notary will review your request and make all notarial determinations during the session.',
  human_support_destination text,
  booking_assistance_enabled boolean not null default true,
  faq_assistance_enabled boolean not null default true,
  guardrails jsonb not null default '{"no_legal_advice":true,"no_certificate_selection":true,"no_signer_competency_determination":true,"not_a_commissioned_notary":true,"no_notarization_guarantee":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table availability_exceptions
  add column if not exists closed_all_day boolean not null default false,
  add column if not exists customer_message text;

alter table organization_availability_schedules enable row level security;
alter table organization_availability_intervals enable row level security;
alter table appointment_rule_settings enable row level security;
alter table organization_services enable row level security;
alter table communication_settings enable row level security;
alter table ai_concierge_settings enable row level security;

create policy "members can read availability schedules" on organization_availability_schedules
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage availability schedules" on organization_availability_schedules
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read availability intervals" on organization_availability_intervals
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage availability intervals" on organization_availability_intervals
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read appointment rules" on appointment_rule_settings
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage appointment rules" on appointment_rule_settings
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read organization services" on organization_services
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage organization services" on organization_services
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read communication settings" on communication_settings
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage communication settings" on communication_settings
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read ai concierge settings" on ai_concierge_settings
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage ai concierge settings" on ai_concierge_settings
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

drop policy if exists "members can update settings" on business_settings;
create policy "owners and admins can update settings" on business_settings
  for update using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

drop policy if exists "members can manage availability" on availability_rules;
create policy "members can read legacy availability" on availability_rules
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage legacy availability" on availability_rules
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

drop policy if exists "members can manage exceptions" on availability_exceptions;
create policy "members can read exceptions" on availability_exceptions
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage exceptions" on availability_exceptions
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create trigger touch_organization_availability_schedules
  before update on organization_availability_schedules
  for each row execute function touch_updated_at();
create trigger touch_organization_availability_intervals
  before update on organization_availability_intervals
  for each row execute function touch_updated_at();
create trigger touch_appointment_rule_settings
  before update on appointment_rule_settings
  for each row execute function touch_updated_at();
create trigger touch_organization_services
  before update on organization_services
  for each row execute function touch_updated_at();
create trigger touch_communication_settings
  before update on communication_settings
  for each row execute function touch_updated_at();
create trigger touch_ai_concierge_settings
  before update on ai_concierge_settings
  for each row execute function touch_updated_at();
