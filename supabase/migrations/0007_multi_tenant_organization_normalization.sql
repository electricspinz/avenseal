alter table organizations
  add column if not exists status text not null default 'active';

alter table organizations
  drop constraint if exists organizations_status_check;

alter table organizations
  add constraint organizations_status_check
  check (status in ('active', 'suspended', 'archived'));

insert into organizations (
  id,
  name,
  display_name,
  legal_name,
  slug,
  status,
  timezone
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Avenseal',
  'Avenseal',
  'Avenseal',
  'avenseal',
  'active',
  'America/New_York'
)
on conflict (slug) do update
set
  name = excluded.name,
  display_name = coalesce(
    organizations.display_name,
    excluded.display_name
  ),
  legal_name = coalesce(
    organizations.legal_name,
    excluded.legal_name
  ),
  status = 'active',
  timezone = coalesce(
    organizations.timezone,
    excluded.timezone
  ),
  updated_at = now();

alter table organization_users
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table organization_users
  drop constraint if exists organization_users_status_check;

alter table organization_users
  add constraint organization_users_status_check
  check (status in ('active', 'invited', 'suspended'));

create index if not exists organizations_slug_status_idx
  on organizations (slug, status);

create index if not exists organization_users_user_status_idx
  on organization_users (user_id, status);

create index if not exists organization_users_org_role_status_idx
  on organization_users (organization_id, role, status);

create or replace function user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from organization_users
  where user_id = auth.uid()
    and status = 'active'
$$;

create or replace function is_organization_member(target_organization_id uuid)
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
      and status = 'active'
  )
$$;

create or replace function has_organization_role(target_organization_id uuid, allowed_roles text[])
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
      and status = 'active'
      and role = any(allowed_roles)
  )
$$;

create or replace function can_manage_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_organization_role(target_organization_id, array['owner', 'admin'])
$$;

create or replace view organization_memberships
with (security_invoker = true) as
select
  id,
  organization_id,
  user_id,
  role,
  status,
  created_at,
  updated_at
from organization_users;

drop policy if exists "members can read organization users" on organization_users;
drop policy if exists "owners can manage organization users" on organization_users;

create policy "members can read organization users" on organization_users
  for select using (is_organization_member(organization_id));

create policy "owners can manage organization users" on organization_users
  for all using (has_organization_role(organization_id, array['owner']))
  with check (has_organization_role(organization_id, array['owner']));

drop trigger if exists touch_organization_users on organization_users;
create trigger touch_organization_users
  before update on organization_users
  for each row execute function touch_updated_at();
