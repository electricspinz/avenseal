create table if not exists florida_ron_production_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  appointment_request_id uuid not null references appointment_requests(id) on delete restrict,
  prepared_session_id uuid not null references florida_ron_session_assistant_sessions(id) on delete restrict,
  workflow_version text not null, prepared_parameters jsonb not null, module_versions jsonb not null,
  state text not null check (state in ('in_progress','stopped')),
  current_module_index integer not null default 0 check (current_module_index >= 0),
  stop_reason text, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), started_at timestamptz not null default now(), terminal_at timestamptz
);
create index if not exists florida_ron_production_attempts_appointment_idx on florida_ron_production_attempts (organization_id, appointment_request_id, created_at desc);

create table if not exists florida_ron_production_evidence (
  id uuid primary key default gen_random_uuid(), attempt_id uuid not null references florida_ron_production_attempts(id) on delete restrict,
  organization_id uuid not null references organizations(id) on delete restrict,
  module_id text not null, module_version text not null, requirement_id text not null, principal_index integer,
  value boolean not null, source text not null check (source in ('NOTARY_CONFIRMED','SYSTEM_OBSERVED','PROVIDER_VERIFIED')),
  actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists florida_ron_production_evidence_attempt_idx on florida_ron_production_evidence (organization_id, attempt_id, created_at asc);

create table if not exists florida_ron_production_events (
  id uuid primary key default gen_random_uuid(), attempt_id uuid not null references florida_ron_production_attempts(id) on delete restrict,
  organization_id uuid not null references organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null, event_type text not null,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists florida_ron_production_events_attempt_idx on florida_ron_production_events (organization_id, attempt_id, created_at asc);

create or replace function enforce_florida_ron_production_ownership() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'florida_ron_production_attempts' and not exists (select 1 from florida_ron_session_assistant_sessions s where s.id = new.prepared_session_id and s.organization_id = new.organization_id and s.appointment_request_id = new.appointment_request_id and s.specification_status = 'candidate') then raise exception 'Production attempt must bind to a same-tenant Candidate prepared session'; end if;
  if tg_table_name = 'florida_ron_production_evidence' and not exists (select 1 from florida_ron_production_attempts a where a.id = new.attempt_id and a.organization_id = new.organization_id) then raise exception 'Production evidence must belong to its tenant attempt'; end if;
  if tg_table_name = 'florida_ron_production_events' and not exists (select 1 from florida_ron_production_attempts a where a.id = new.attempt_id and a.organization_id = new.organization_id) then raise exception 'Production event must belong to its tenant attempt'; end if;
  return new;
end; $$;
create trigger florida_ron_production_attempt_ownership before insert on florida_ron_production_attempts for each row execute function enforce_florida_ron_production_ownership();
create trigger florida_ron_production_evidence_ownership before insert on florida_ron_production_evidence for each row execute function enforce_florida_ron_production_ownership();
create trigger florida_ron_production_event_ownership before insert on florida_ron_production_events for each row execute function enforce_florida_ron_production_ownership();

alter table florida_ron_production_attempts enable row level security;
alter table florida_ron_production_evidence enable row level security;
alter table florida_ron_production_events enable row level security;
revoke all on florida_ron_production_attempts, florida_ron_production_evidence, florida_ron_production_events from anon, authenticated, public;
grant all on florida_ron_production_attempts, florida_ron_production_evidence, florida_ron_production_events to service_role;

create or replace function prevent_florida_ron_production_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'Florida RON production evidence and events are append-only'; end; $$;
create trigger florida_ron_production_evidence_append_only before update or delete on florida_ron_production_evidence for each row execute function prevent_florida_ron_production_audit_mutation();
create trigger florida_ron_production_events_append_only before update or delete on florida_ron_production_events for each row execute function prevent_florida_ron_production_audit_mutation();

create or replace function guard_florida_ron_production_attempt() returns trigger language plpgsql as $$
begin
  if old.workflow_version is distinct from new.workflow_version or old.prepared_session_id is distinct from new.prepared_session_id or old.prepared_parameters is distinct from new.prepared_parameters or old.module_versions is distinct from new.module_versions then raise exception 'Production workflow binding is immutable'; end if;
  if old.state = 'stopped' then raise exception 'Stopped production attempts are terminal'; end if;
  if new.state not in ('in_progress','stopped') then raise exception 'Production completion is not enabled'; end if;
  return new;
end; $$;
create trigger florida_ron_production_attempt_guard before update on florida_ron_production_attempts for each row execute function guard_florida_ron_production_attempt();
