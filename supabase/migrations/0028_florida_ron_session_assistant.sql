create table if not exists florida_ron_session_assistant_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete restrict,
  appointment_request_id uuid not null references appointment_requests(id) on delete restrict,
  workflow_version text not null, specification_status text not null check (specification_status in ('candidate','production')),
  state text not null check (state in ('prepared','in_progress','final_review','completed','stopped')),
  outcome text check (outcome in ('completed','stopped')), stop_reason text,
  parameters jsonb not null, module_versions jsonb not null, provider_reference text,
  created_by uuid references auth.users(id) on delete set null, started_at timestamptz, completed_or_stopped_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists florida_ron_session_assistant_sessions_appointment_idx on florida_ron_session_assistant_sessions (organization_id, appointment_request_id, created_at desc);
create table if not exists florida_ron_session_assistant_events (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references florida_ron_session_assistant_sessions(id) on delete restrict,
  organization_id uuid not null references organizations(id) on delete restrict, actor_id uuid references auth.users(id) on delete set null,
  event_type text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists florida_ron_session_assistant_events_session_idx on florida_ron_session_assistant_events (session_id, created_at asc);
alter table florida_ron_session_assistant_sessions enable row level security;
alter table florida_ron_session_assistant_events enable row level security;
create policy "members can read Florida RON assistant sessions" on florida_ron_session_assistant_sessions for select using (organization_id in (select user_org_ids()));
create policy "members can read Florida RON assistant events" on florida_ron_session_assistant_events for select using (organization_id in (select user_org_ids()));
revoke all on florida_ron_session_assistant_sessions, florida_ron_session_assistant_events from anon, authenticated, public;
grant all on florida_ron_session_assistant_sessions, florida_ron_session_assistant_events to service_role;
