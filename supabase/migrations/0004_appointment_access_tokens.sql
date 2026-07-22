create table if not exists appointment_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists appointment_access_tokens_lookup_idx
  on appointment_access_tokens (token_hash, expires_at)
  where revoked_at is null;

create index if not exists appointment_access_tokens_appointment_idx
  on appointment_access_tokens (appointment_request_id, created_at desc);

alter table appointment_access_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_access_tokens'
      and policyname = 'members can read appointment access tokens'
  ) then
    create policy "members can read appointment access tokens" on appointment_access_tokens
      for select using (organization_id in (select user_org_ids()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_access_tokens'
      and policyname = 'owners and admins can manage appointment access tokens'
  ) then
    create policy "owners and admins can manage appointment access tokens" on appointment_access_tokens
      for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));
  end if;
end $$;
