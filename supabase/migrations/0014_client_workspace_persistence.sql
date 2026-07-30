create table if not exists external_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 100),
  session_name text not null check (char_length(session_name) between 1 and 160),
  launch_url text,
  reference_number text,
  status text not null check (status in ('pending', 'scheduled', 'ready', 'in_progress', 'completed', 'cancelled', 'unknown')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, appointment_request_id)
);

create index if not exists external_sessions_organization_appointment_idx on external_sessions (organization_id, appointment_request_id);
alter table external_sessions enable row level security;

create policy "members can read external sessions" on external_sessions for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage external sessions" on external_sessions for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

alter table appointment_access_tokens add column if not exists purpose text not null default 'client_workspace';
alter table appointment_access_tokens add column if not exists created_by uuid;
alter table appointment_access_tokens add column if not exists issued_at timestamptz;
update appointment_access_tokens set issued_at = created_at where issued_at is null;
alter table appointment_access_tokens alter column issued_at set not null;
alter table appointment_access_tokens alter column issued_at set default now();
