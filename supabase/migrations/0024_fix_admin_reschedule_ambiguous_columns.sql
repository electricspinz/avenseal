-- Fix the PL/pgSQL output-variable collision in reschedule_count. The function
-- returns a reschedule_count column, so its prior unqualified RHS reference in
-- coalesce(reschedule_count, 0) was ambiguous with appointment_requests.
create or replace function public.reschedule_admin_appointment(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_preferred_date date,
  p_preferred_time time,
  p_actor_user_id uuid
) returns table (
  appointment_id uuid,
  previous_date date,
  previous_time time,
  preferred_date date,
  preferred_time time,
  reschedule_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appointment appointment_requests%rowtype;
  v_rules appointment_rule_settings%rowtype;
  v_duration integer;
  v_active_expires_at timestamptz;
  v_timezone text;
begin
  select appointment.* into v_appointment
  from appointment_requests as appointment
  where appointment.id = p_appointment_id
    and appointment.organization_id = p_organization_id
  for update;
  if not found then raise exception 'AVENSEAL_RESCHEDULE_TENANT_OR_APPOINTMENT_MISMATCH'; end if;
  if v_appointment.status in ('cancelled', 'declined', 'completed', 'no_show') then
    raise exception 'AVENSEAL_RESCHEDULE_INVALID_SCHEDULE_INPUT';
  end if;

  select rules.* into v_rules
  from appointment_rule_settings as rules
  where rules.organization_id = p_organization_id
  limit 1;
  v_duration := coalesce(v_appointment.service_duration_minutes_snapshot, v_rules.default_duration_minutes);
  if v_duration is null or v_duration < 5 then raise exception 'AVENSEAL_RESCHEDULE_INVALID_SCHEDULE_INPUT'; end if;
  perform public.assert_appointment_slot_available(p_organization_id, p_appointment_id, p_preferred_date, p_preferred_time, v_duration);

  begin
    select reservation.expires_at into v_active_expires_at
    from slot_reservations as reservation
    where reservation.organization_id = p_organization_id
      and reservation.appointment_request_id = p_appointment_id
      and reservation.status = 'active'
    order by reservation.expires_at desc
    limit 1
    for update;

    update slot_reservations as reservation
    set status = 'released', updated_at = now()
    where reservation.organization_id = p_organization_id
      and reservation.appointment_request_id = p_appointment_id
      and reservation.status = 'active';

    if v_active_expires_at is not null and v_active_expires_at > now() then
      insert into slot_reservations (
        organization_id,
        appointment_request_id,
        reserved_date,
        reserved_time,
        duration_minutes,
        status,
        expires_at
      ) values (
        p_organization_id,
        p_appointment_id,
        p_preferred_date,
        p_preferred_time,
        v_duration,
        'active',
        v_active_expires_at
      );
    end if;
  exception when others then
    raise exception 'AVENSEAL_RESCHEDULE_RESERVATION_TRANSITION_FAILED';
  end;

  update appointment_requests as appointment
  set preferred_date = p_preferred_date,
      preferred_time = p_preferred_time,
      reschedule_count = coalesce(appointment.reschedule_count, 0) + 1,
      updated_at = now()
  where appointment.id = p_appointment_id
    and appointment.organization_id = p_organization_id;

  select organization.timezone into v_timezone
  from organizations as organization
  where organization.id = p_organization_id;
  begin
    insert into audit_logs (
      organization_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      p_organization_id,
      p_actor_user_id,
      'appointment.rescheduled',
      'appointment_request',
      p_appointment_id,
      jsonb_build_object(
        'previousDate', v_appointment.preferred_date,
        'previousTime', to_char(v_appointment.preferred_time, 'HH24:MI'),
        'preferredDate', p_preferred_date,
        'preferredTime', to_char(p_preferred_time, 'HH24:MI'),
        'timezone', v_timezone
      )
    );
  exception when others then
    raise exception 'AVENSEAL_RESCHEDULE_AUDIT_INSERT_FAILED';
  end;

  return query
  select
    p_appointment_id,
    v_appointment.preferred_date,
    v_appointment.preferred_time,
    p_preferred_date,
    p_preferred_time,
    coalesce(v_appointment.reschedule_count, 0) + 1;
end;
$$;

revoke all on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) from public, anon, authenticated;
grant execute on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) to service_role;
