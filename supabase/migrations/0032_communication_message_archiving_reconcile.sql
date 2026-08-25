-- Durable, message-level administrative archiving for the Communications Center.
alter table communication_messages
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references user_profiles(id) on delete set null;

create index if not exists communication_messages_admin_archive_idx
  on communication_messages (organization_id, archived_at, created_at desc);

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
  case
    when m.status in ('sent', 'delivered') then 'sent'
    when m.status = 'failed' then 'failed'
    when m.status = 'cancelled' or r.status = 'cancelled' then 'cancelled'
    when r.status = 'scheduled' and r.scheduled_for <= now() then 'ready_to_queue'
    when r.status = 'scheduled' then 'scheduled'
    else 'queued'
  end as status,
  r.scheduled_for as scheduled_for,
  m.created_at as queued_at,
  m.sent_at as sent_at,
  coalesce(m.attempt_count, 0) as attempt_count,
  m.last_attempted_at as last_attempted_at,
  m.last_error as last_error,
  m.provider_message_id as provider_message_id,
  r.created_at as created_at,
  greatest(r.updated_at, coalesce(m.updated_at, r.updated_at)) as updated_at,
  m.archived_at as archived_at
from appointment_reminders r
join appointment_requests a on a.id = r.appointment_id
join customers c on c.id = a.customer_id
left join communication_messages m on m.id = r.communication_message_id

union all

select
  concat('m:', m.id) as id,
  m.organization_id as organization_id,
  'message'::text as source,
  m.id as message_id,
  m.appointment_request_id as appointment_id,
  m.customer_id as customer_id,
  c.full_name as customer_name,
  m.message_type as message_type,
  m.recipient_email as recipient_email,
  m.subject as subject,
  m.body_html as body_html,
  case
    when m.status in ('sent', 'delivered') then 'sent'
    when m.status = 'failed' then 'failed'
    when m.status = 'cancelled' then 'cancelled'
    else 'queued'
  end as status,
  coalesce(m.scheduled_for, m.next_attempt_at) as scheduled_for,
  m.created_at as queued_at,
  m.sent_at as sent_at,
  coalesce(m.attempt_count, 0) as attempt_count,
  m.last_attempted_at as last_attempted_at,
  m.last_error as last_error,
  m.provider_message_id as provider_message_id,
  m.created_at as created_at,
  m.updated_at as updated_at,
  m.archived_at as archived_at
from communication_messages m
left join appointment_reminders r on r.communication_message_id = m.id
left join customers c on c.id = m.customer_id
where r.id is null;

grant select on admin_communications to authenticated;

create or replace function set_communication_message_archived(
  p_organization_id uuid,
  p_communication_id uuid,
  p_actor_user_id uuid,
  p_archived boolean
)
returns table (id uuid, archived_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_archived_at timestamptz;
begin
  update communication_messages as m
  set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then p_actor_user_id else null end
  where m.id = p_communication_id
    and m.organization_id = p_organization_id
    and ((p_archived and m.archived_at is null) or (not p_archived and m.archived_at is not null))
  returning m.id, m.archived_at into v_id, v_archived_at;

  if v_id is null then
    return;
  end if;

  insert into audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_organization_id,
    p_actor_user_id,
    case when p_archived then 'communication.archived' else 'communication.unarchived' end,
    'communication_message',
    v_id,
    jsonb_build_object('source', 'admin_communications')
  );

  return query select v_id, v_archived_at;
end;
$$;

revoke all on function set_communication_message_archived(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function set_communication_message_archived(uuid, uuid, uuid, boolean) to service_role;
