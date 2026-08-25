-- Production Clean Slate: preserves historical facts while recording which
-- records are no longer part of the live operational queue.

alter table appointment_requests
  add column if not exists is_test_data boolean not null default false;

create index if not exists appointment_requests_operational_queue_idx
  on appointment_requests (organization_id, is_test_data, updated_at desc);

create table if not exists organization_operational_cutovers (
  organization_id uuid primary key references organizations(id) on delete cascade,
  production_cutover_at timestamptz not null,
  configured_at timestamptz not null default now(),
  configured_by uuid references user_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists operational_action_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('appointment_document_file')),
  entity_id uuid not null,
  reason text not null check (reason = 'pre_production_cleanup'),
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid references user_profiles(id) on delete set null,
  unique (organization_id, entity_type, entity_id)
);

create index if not exists operational_action_dismissals_lookup_idx
  on operational_action_dismissals (organization_id, entity_type, entity_id);

alter table organization_operational_cutovers enable row level security;
alter table operational_action_dismissals enable row level security;
revoke all on organization_operational_cutovers, operational_action_dismissals from anon, authenticated;

-- The Communications Center's historical view keeps archived rows available.
-- The Action Required query excludes them, and the delivery worker must too.
create or replace view admin_communications
with (security_invoker = true)
as
select
  concat('r:', r.id) as id,
  r.organization_id as organization_id,
  'reminder'::text as source,
  m.id as message_id,
  r.appointment_id as appointment_id,
  a.customer_id as customer_id,
  c.full_name as customer_name,
  r.template as message_type,
  coalesce(m.recipient_email, c.email) as recipient_email,
  m.subject as subject,
  m.body_html as body_html,
  case when m.status in ('sent', 'delivered') then 'sent' when m.status = 'failed' then 'failed' when m.status = 'cancelled' or r.status = 'cancelled' then 'cancelled' when r.status = 'scheduled' and r.scheduled_for <= now() then 'ready_to_queue' when r.status = 'scheduled' then 'scheduled' else 'queued' end as status,
  r.scheduled_for, m.created_at as queued_at, m.sent_at,
  coalesce(m.attempt_count, 0) as attempt_count, m.last_attempted_at, m.last_error, m.provider_message_id,
  r.created_at, greatest(r.updated_at, coalesce(m.updated_at, r.updated_at)) as updated_at,
  m.archived_at, coalesce(a.is_test_data, false) as is_test_data
from appointment_reminders r
join appointment_requests a on a.id = r.appointment_id
join customers c on c.id = a.customer_id
left join communication_messages m on m.id = r.communication_message_id
union all
select
  concat('m:', m.id), m.organization_id, 'message'::text, m.id, m.appointment_request_id,
  m.customer_id, c.full_name, m.message_type, m.recipient_email, m.subject, m.body_html,
  case when m.status in ('sent', 'delivered') then 'sent' when m.status = 'failed' then 'failed' when m.status = 'cancelled' then 'cancelled' else 'queued' end,
  coalesce(m.scheduled_for, m.next_attempt_at), m.created_at, m.sent_at, coalesce(m.attempt_count, 0), m.last_attempted_at, m.last_error, m.provider_message_id,
  m.created_at, m.updated_at, m.archived_at, coalesce(a.is_test_data, false)
from communication_messages m
left join appointment_reminders r on r.communication_message_id = m.id
left join appointment_requests a on a.id = m.appointment_request_id
left join customers c on c.id = m.customer_id
where r.id is null;

grant select on admin_communications to authenticated;

-- This operation is deliberately narrow and idempotent. It archives failed
-- pre-cutover communications without changing their failed status, and it
-- dismisses only structurally marked test-document security actions.
create or replace function apply_pre_production_operational_cleanup(p_organization_id uuid)
returns table (communications_archived integer, document_actions_dismissed integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cutover timestamptz;
begin
  select production_cutover_at into v_cutover
  from organization_operational_cutovers where organization_id = p_organization_id;
  if v_cutover is null then raise exception 'Production cutover is not configured.'; end if;

  with archived as (
    update communication_messages m set archived_at = now(), archived_by = null
    where m.organization_id = p_organization_id and m.status = 'failed'
      and m.created_at < v_cutover and m.archived_at is null
    returning m.id, m.organization_id, m.appointment_request_id
  ), audited as (
    insert into audit_logs (organization_id, action, entity_type, entity_id, metadata)
    select organization_id, 'communication.archived', 'communication_message', id,
      jsonb_build_object('source', 'production_cutover', 'reason', 'pre_production_cleanup', 'productionCutoverAt', v_cutover)
    from archived returning id
  ) select count(*)::integer into communications_archived from audited;

  with dismissed as (
    insert into operational_action_dismissals (organization_id, entity_type, entity_id, reason)
    select d.organization_id, 'appointment_document_file', d.id, 'pre_production_cleanup'
    from appointment_document_files d
    join appointment_requests a on a.id = d.appointment_request_id and a.organization_id = d.organization_id
    where d.organization_id = p_organization_id and a.is_test_data = true and d.created_at < v_cutover
      and d.deleted_at is null and (d.scan_status in ('infected', 'suspicious', 'failed') or d.storage_status = 'removed')
    on conflict (organization_id, entity_type, entity_id) do nothing
    returning entity_id, organization_id
  ), audited as (
    insert into audit_logs (organization_id, action, entity_type, entity_id, metadata)
    select organization_id, 'operational_action.dismissed', 'appointment_document_file', entity_id,
      jsonb_build_object('reason', 'pre_production_cleanup', 'productionCutoverAt', v_cutover)
    from dismissed returning id
  ) select count(*)::integer into document_actions_dismissed from audited;
  return next;
end;
$$;

revoke all on function apply_pre_production_operational_cleanup(uuid) from public, anon, authenticated;
grant execute on function apply_pre_production_operational_cleanup(uuid) to service_role;
