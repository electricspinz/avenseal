alter type appointment_status add value if not exists 'clarification_needed';
alter type appointment_status add value if not exists 'approved_pending_payment';
alter type appointment_status add value if not exists 'payment_processing';
alter type appointment_status add value if not exists 'no_show';

create type integration_provider as enum ('google_calendar', 'stripe', 'resend');
create type integration_status as enum ('disconnected', 'connected', 'error', 'test_mode');
create type payment_status as enum ('payment_link_created', 'payment_processing', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded', 'disputed');
create type reservation_status as enum ('active', 'expired', 'released', 'converted');
create type calendar_event_status as enum ('pending', 'created', 'updated', 'cancelled', 'failed');
create type communication_status as enum ('queued', 'sent', 'delivered', 'failed', 'skipped');
create type refund_policy_outcome as enum ('full_refund', 'late_cancellation_partial_refund', 'manual_review');

alter table appointment_rule_settings
  add column if not exists same_day_payment_window_minutes integer not null default 30 check (same_day_payment_window_minutes between 5 and 1440),
  add column if not exists future_payment_window_minutes integer not null default 720 check (future_payment_window_minutes between 30 and 43200),
  add column if not exists complimentary_reschedule_count integer not null default 1 check (complimentary_reschedule_count between 0 and 10),
  add column if not exists reschedule_notice_minutes integer not null default 120 check (reschedule_notice_minutes between 0 and 10080),
  add column if not exists late_cancellation_cutoff_minutes integer not null default 120 check (late_cancellation_cutoff_minutes between 0 and 10080),
  add column if not exists late_cancellation_retained_cents integer not null default 1500 check (late_cancellation_retained_cents >= 0),
  add column if not exists no_show_grace_minutes integer not null default 10 check (no_show_grace_minutes between 0 and 120);

alter table appointment_requests
  add column if not exists approved_for_payment_at timestamptz,
  add column if not exists payment_due_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists reschedule_count integer not null default 0 check (reschedule_count >= 0);

create table organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider integration_provider not null,
  status integration_status not null default 'disconnected',
  account_label text,
  calendar_id text,
  token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  last_connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table appointment_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  service_id uuid not null references organization_services(id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  status payment_status not null default 'payment_link_created',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  checkout_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  refund_reason text,
  refunded_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, appointment_request_id, status) deferrable initially immediate
);

create index appointment_payments_appointment_idx on appointment_payments (appointment_request_id, created_at desc);
create index appointment_payments_org_status_idx on appointment_payments (organization_id, status, created_at desc);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  payment_id uuid references appointment_payments(id) on delete set null,
  provider integration_provider not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  processed_at timestamptz,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  safe_summary text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table slot_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  reserved_date date not null,
  reserved_time time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 240),
  status reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index slot_reservations_lookup_idx on slot_reservations (organization_id, reserved_date, reserved_time, status, expires_at);

create table calendar_event_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  integration_id uuid references organization_integrations(id) on delete set null,
  provider integration_provider not null default 'google_calendar',
  calendar_id text,
  provider_event_id text,
  status calendar_event_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, appointment_request_id)
);

create table communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid references appointment_requests(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  provider integration_provider not null default 'resend',
  message_type text not null,
  recipient_email text not null,
  subject text not null,
  status communication_status not null default 'queued',
  provider_message_id text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index communication_messages_appointment_idx on communication_messages (appointment_request_id, created_at desc);

create table communication_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  communication_message_id uuid not null references communication_messages(id) on delete cascade,
  provider_event_id text,
  event_type text not null,
  safe_summary text,
  created_at timestamptz not null default now(),
  unique (provider_event_id)
);

create table refund_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  payment_id uuid not null references appointment_payments(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  reason text not null,
  policy_outcome refund_policy_outcome not null,
  stripe_refund_id text unique,
  actor_user_id uuid references user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table organization_integrations enable row level security;
alter table appointment_payments enable row level security;
alter table payment_events enable row level security;
alter table slot_reservations enable row level security;
alter table calendar_event_mappings enable row level security;
alter table communication_messages enable row level security;
alter table communication_delivery_events enable row level security;
alter table refund_records enable row level security;

create policy "members can read organization integrations" on organization_integrations
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage organization integrations" on organization_integrations
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read appointment payments" on appointment_payments
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage appointment payments" on appointment_payments
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read payment events" on payment_events
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can insert payment events" on payment_events
  for insert with check (can_manage_org(organization_id));

create policy "members can read slot reservations" on slot_reservations
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage slot reservations" on slot_reservations
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read calendar mappings" on calendar_event_mappings
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage calendar mappings" on calendar_event_mappings
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read communication messages" on communication_messages
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage communication messages" on communication_messages
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read communication delivery events" on communication_delivery_events
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage communication delivery events" on communication_delivery_events
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create policy "members can read refund records" on refund_records
  for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage refund records" on refund_records
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

create trigger touch_organization_integrations before update on organization_integrations for each row execute function touch_updated_at();
create trigger touch_appointment_payments before update on appointment_payments for each row execute function touch_updated_at();
create trigger touch_slot_reservations before update on slot_reservations for each row execute function touch_updated_at();
create trigger touch_calendar_event_mappings before update on calendar_event_mappings for each row execute function touch_updated_at();
create trigger touch_communication_messages before update on communication_messages for each row execute function touch_updated_at();
