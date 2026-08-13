create or replace function public.promote_appointment_reminder(
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
  update public.appointment_reminders as reminder
  set status = 'processing', processed_at = now()
  where reminder.id = p_reminder_id and reminder.status = 'scheduled';
  if not found then return null; end if;

  select message.id into v_message_id
  from public.communication_messages as message
  where message.organization_id = (
    select reminder.organization_id
    from public.appointment_reminders as reminder
    where reminder.id = p_reminder_id
  )
    and message.idempotency_key = p_idempotency_key;
  if v_message_id is null then
    insert into public.communication_messages as message (organization_id, appointment_request_id, customer_id, channel, provider, message_type, recipient_email, subject, body_html, status, idempotency_key, next_attempt_at)
    select reminder.organization_id, reminder.appointment_id, appointment.customer_id, 'email', p_provider, reminder.template, p_recipient_email, p_subject, p_html, 'queued', p_idempotency_key, now()
    from public.appointment_reminders as reminder
    join public.appointment_requests as appointment on appointment.id = reminder.appointment_id
    where reminder.id = p_reminder_id
    returning message.id into v_message_id;
  end if;

  update public.appointment_reminders as reminder
  set status = 'queued', communication_message_id = v_message_id, processed_at = now()
  where reminder.id = p_reminder_id and reminder.status = 'processing';
  if not found then raise exception 'Reminder promotion claim was lost'; end if;
  return v_message_id;
end;
$$;

revoke all on function public.promote_appointment_reminder(uuid, text, text, text, text, integration_provider) from public, anon, authenticated;
grant execute on function public.promote_appointment_reminder(uuid, text, text, text, text, integration_provider) to service_role;
