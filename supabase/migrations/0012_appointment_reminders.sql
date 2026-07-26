create table appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid not null references appointment_requests(id) on delete cascade,
  template text not null check (template in ('appointment_confirmation', 'appointment_reminder_24h', 'appointment_reminder_2h', 'appointment_followup', 'appointment_review_request', 'appointment_cancelled', 'appointment_rescheduled')),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'queued', 'cancelled', 'completed')),
  communication_message_id uuid references communication_messages(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointment_reminders_appointment_idx on appointment_reminders (appointment_id);
create index appointment_reminders_due_idx on appointment_reminders (status, scheduled_for);
create unique index appointment_reminders_active_template_idx
  on appointment_reminders (appointment_id, template)
  where status in ('scheduled', 'processing', 'queued');
alter table appointment_reminders enable row level security;
create policy "members can read appointment reminders" on appointment_reminders for select using (organization_id in (select user_org_ids()));
create policy "owners and admins can manage appointment reminders" on appointment_reminders for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));
create trigger touch_appointment_reminders before update on appointment_reminders for each row execute function touch_updated_at();

alter table communication_settings
  add column if not exists reminder_24h_minutes_before integer not null default 1440 check (reminder_24h_minutes_before between 5 and 10080),
  add column if not exists reminder_2h_minutes_before integer not null default 120 check (reminder_2h_minutes_before between 5 and 10080),
  add column if not exists followup_minutes_after integer not null default 1440 check (followup_minutes_after between 5 and 10080),
  add column if not exists review_request_minutes_after integer not null default 2880 check (review_request_minutes_after between 5 and 20160);

create or replace function promote_appointment_reminder(
  p_reminder_id uuid,
  p_subject text,
  p_html text,
  p_recipient_email text,
  p_idempotency_key text,
  p_provider integration_provider default 'gmail_smtp'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_message_id uuid;
begin
  update appointment_reminders
  set status = 'processing', processed_at = now()
  where id = p_reminder_id and status = 'scheduled';
  if not found then return null; end if;

  select id into v_message_id from communication_messages
  where organization_id = (select organization_id from appointment_reminders where id = p_reminder_id)
    and idempotency_key = p_idempotency_key;
  if v_message_id is null then
    insert into communication_messages (organization_id, appointment_request_id, customer_id, channel, provider, message_type, recipient_email, subject, body_html, status, idempotency_key, next_attempt_at)
    select organization_id, appointment_id, a.customer_id, 'email', p_provider, template, p_recipient_email, p_subject, p_html, 'queued', p_idempotency_key, now()
    from appointment_reminders r join appointment_requests a on a.id = r.appointment_id
    where r.id = p_reminder_id
    returning id into v_message_id;
  end if;

  update appointment_reminders
  set status = 'queued', communication_message_id = v_message_id, processed_at = now()
  where id = p_reminder_id and status = 'processing';
  if not found then raise exception 'Reminder promotion claim was lost'; end if;
  return v_message_id;
end;
$$;

revoke all on function promote_appointment_reminder(uuid, text, text, text, text, integration_provider) from public, anon, authenticated;
grant execute on function promote_appointment_reminder(uuid, text, text, text, text, integration_provider) to service_role;
