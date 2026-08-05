-- Private schedule guard shared by public booking writes and the server-only
-- reschedule RPC. The application still performs richer Calendar-aware
-- availability checks for UX, but this database boundary is authoritative for
-- durable business-hours, booking-window, exception, and local-conflict rules.
create or replace function public.assert_appointment_slot_available(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_preferred_date date,
  p_preferred_time time,
  p_duration_minutes integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rules appointment_rule_settings%rowtype;
  v_timezone text;
  v_organization_status text;
  v_target_local timestamp;
  v_target_at timestamptz;
  v_target_end timestamp;
  v_buffered_start timestamp;
  v_buffered_end timestamp;
  v_buffer_before integer;
  v_buffer_after integer;
  v_day_count integer;
  v_lock_cursor timestamp;
begin
  if p_organization_id is null or p_appointment_id is null or p_preferred_date is null or p_preferred_time is null or p_duration_minutes not between 5 and 240 then
    raise exception 'Appointment schedule is unavailable';
  end if;

  select timezone, status into v_timezone, v_organization_status from organizations where id = p_organization_id;
  select * into v_rules from appointment_rule_settings where organization_id = p_organization_id;
  if v_timezone is null or v_organization_status <> 'active' or not found then raise exception 'Scheduling configuration is unavailable'; end if;
  if not exists (
    select 1 from organization_availability_schedules schedule
    where schedule.organization_id = p_organization_id and schedule.is_primary and schedule.timezone = v_timezone
  ) then raise exception 'Scheduling configuration is unavailable'; end if;

  v_target_local := p_preferred_date + p_preferred_time;
  v_target_at := v_target_local at time zone v_timezone;
  -- PostgreSQL normalizes nonexistent DST local times. Reject those rather than
  -- silently moving a customer to a different wall-clock appointment.
  if (v_target_at at time zone v_timezone) <> v_target_local then raise exception 'Appointment schedule is unavailable'; end if;
  if v_target_at < now() + make_interval(mins => coalesce(v_rules.minimum_booking_notice_minutes, 0)) then raise exception 'Selected appointment time is outside current availability'; end if;
  if not v_rules.same_day_enabled and p_preferred_date = (now() at time zone v_timezone)::date then raise exception 'Selected appointment time is outside current availability'; end if;
  if v_rules.maximum_advance_booking_days is not null and p_preferred_date > (now() at time zone v_timezone)::date + v_rules.maximum_advance_booking_days then raise exception 'Selected appointment time is outside current availability'; end if;

  v_buffer_before := coalesce(v_rules.buffer_before_minutes, 0);
  v_buffer_after := coalesce(v_rules.buffer_after_minutes, 0);
  v_target_end := v_target_local + make_interval(mins => p_duration_minutes);
  v_buffered_start := v_target_local - make_interval(mins => v_buffer_before);
  v_buffered_end := v_target_end + make_interval(mins => v_buffer_after);

  -- Minute-granularity locks serialize every overlapping local schedule range
  -- without serializing unrelated appointments for the whole day.
  v_lock_cursor := date_trunc('minute', v_buffered_start);
  while v_lock_cursor < v_buffered_end loop
    perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_organization_id::text, v_lock_cursor::text), 0));
    v_lock_cursor := v_lock_cursor + interval '1 minute';
  end loop;

  if exists (
    select 1 from availability_exceptions exception
    where exception.organization_id = p_organization_id
      and exception.exception_date = p_preferred_date
      and (exception.closed_all_day or not exception.is_available or (exception.start_time is not null and exception.end_time is not null))
      and (exception.closed_all_day or not exception.is_available or v_target_local::time < exception.start_time or v_target_end::time > exception.end_time)
  ) then raise exception 'Selected appointment time is outside current availability'; end if;

  if not exists (
    select 1 from organization_availability_intervals interval
    where interval.organization_id = p_organization_id
      and interval.weekday = extract(dow from p_preferred_date)::integer
      and v_target_local::time >= interval.start_time + make_interval(mins => v_buffer_before)
      and v_target_end::time <= interval.end_time - make_interval(mins => v_buffer_after)
      and not exists (
        select 1 from availability_exceptions exception
        where exception.organization_id = p_organization_id
          and exception.exception_date = p_preferred_date
          and exception.start_time is not null and exception.end_time is not null
      )
  ) and not exists (
    select 1 from availability_exceptions exception
    where exception.organization_id = p_organization_id
      and exception.exception_date = p_preferred_date
      and exception.start_time is not null and exception.end_time is not null
      and v_target_local::time >= exception.start_time + make_interval(mins => v_buffer_before)
      and v_target_end::time <= exception.end_time - make_interval(mins => v_buffer_after)
  ) then raise exception 'Selected appointment time is outside current availability'; end if;

  select count(*) into v_day_count from appointment_requests other
  where other.organization_id = p_organization_id
    and other.id <> p_appointment_id
    and other.preferred_date = p_preferred_date
    and other.status in ('awaiting_review', 'awaiting_payment', 'clarification_needed', 'approved_pending_payment', 'payment_processing', 'confirmed', 'ready', 'follow_up_required');
  if v_rules.maximum_appointments_per_day is not null and v_day_count >= v_rules.maximum_appointments_per_day then raise exception 'Selected appointment time is outside current availability'; end if;

  if exists (
    select 1 from appointment_requests other
    where other.organization_id = p_organization_id
      and other.id <> p_appointment_id
      and other.status in ('awaiting_review', 'awaiting_payment', 'clarification_needed', 'approved_pending_payment', 'payment_processing', 'confirmed', 'ready', 'follow_up_required')
      and (other.preferred_date + other.preferred_time - make_interval(mins => v_buffer_before)) < v_buffered_end
      and (other.preferred_date + other.preferred_time + make_interval(mins => coalesce(other.service_duration_minutes_snapshot, v_rules.default_duration_minutes)) + make_interval(mins => v_buffer_after)) > v_buffered_start
  ) then raise exception 'Selected appointment time is outside current availability'; end if;

  if exists (
    select 1 from slot_reservations reservation
    where reservation.organization_id = p_organization_id
      and reservation.appointment_request_id <> p_appointment_id
      and reservation.status = 'active'
      and reservation.expires_at > now()
      and (reservation.reserved_date + reservation.reserved_time) < v_target_end
      and (reservation.reserved_date + reservation.reserved_time + make_interval(mins => reservation.duration_minutes)) > v_target_local
  ) then raise exception 'Selected appointment time is outside current availability'; end if;
end;
$$;

revoke all on function public.assert_appointment_slot_available(uuid, uuid, date, time, integer) from public, anon, authenticated;

create or replace function public.guard_appointment_schedule_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('awaiting_review', 'awaiting_payment', 'clarification_needed', 'approved_pending_payment', 'payment_processing', 'confirmed', 'ready', 'follow_up_required')
    and new.service_duration_minutes_snapshot is not null then
    perform public.assert_appointment_slot_available(new.organization_id, new.id, new.preferred_date, new.preferred_time, new.service_duration_minutes_snapshot);
  end if;
  return new;
end;
$$;

drop trigger if exists guard_appointment_schedule_write_on_change on appointment_requests;
create trigger guard_appointment_schedule_write_on_change
before insert or update of preferred_date, preferred_time, status, service_duration_minutes_snapshot
on appointment_requests
for each row execute function public.guard_appointment_schedule_write();

revoke all on function public.guard_appointment_schedule_write() from public, anon, authenticated;

-- Atomic, server-only appointment rescheduling. Application code performs the
-- richer Google Calendar availability check first; this function serializes the
-- durable schedule, reservation, and audit transition.
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
  v_target_start timestamp;
  v_target_end timestamp;
  v_buffer_before integer;
  v_buffer_after integer;
  v_active_expires_at timestamptz;
  v_timezone text;
begin
  select * into v_appointment
  from appointment_requests
  where id = p_appointment_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Appointment is unavailable'; end if;
  if v_appointment.status in ('cancelled', 'declined', 'completed', 'no_show') then
    raise exception 'Appointment cannot be rescheduled';
  end if;

  select * into v_rules from appointment_rule_settings where organization_id = p_organization_id limit 1;
  v_duration := coalesce(v_appointment.service_duration_minutes_snapshot, v_rules.default_duration_minutes);
  if v_duration is null or v_duration < 5 then raise exception 'Appointment duration is unavailable'; end if;
  v_buffer_before := coalesce(v_rules.buffer_before_minutes, 0);
  v_buffer_after := coalesce(v_rules.buffer_after_minutes, 0);
  v_target_start := p_preferred_date + p_preferred_time;
  v_target_end := v_target_start + make_interval(mins => v_duration);
  perform public.assert_appointment_slot_available(p_organization_id, p_appointment_id, p_preferred_date, p_preferred_time, v_duration);

  select expires_at into v_active_expires_at
  from slot_reservations
  where organization_id = p_organization_id and appointment_request_id = p_appointment_id and status = 'active'
  order by expires_at desc
  limit 1
  for update;

  update slot_reservations
  set status = 'released', updated_at = now()
  where organization_id = p_organization_id and appointment_request_id = p_appointment_id and status = 'active';

  if v_active_expires_at is not null and v_active_expires_at > now() then
    insert into slot_reservations (organization_id, appointment_request_id, reserved_date, reserved_time, duration_minutes, status, expires_at)
    values (p_organization_id, p_appointment_id, p_preferred_date, p_preferred_time, v_duration, 'active', v_active_expires_at);
  end if;

  update appointment_requests
  set preferred_date = p_preferred_date,
      preferred_time = p_preferred_time,
      reschedule_count = coalesce(reschedule_count, 0) + 1,
      updated_at = now()
  where id = p_appointment_id and organization_id = p_organization_id;

  select timezone into v_timezone from organizations where id = p_organization_id;
  insert into audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
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

  return query select p_appointment_id, v_appointment.preferred_date, v_appointment.preferred_time, p_preferred_date, p_preferred_time, coalesce(v_appointment.reschedule_count, 0) + 1;
end;
$$;

revoke all on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) from public, anon, authenticated;
grant execute on function public.reschedule_admin_appointment(uuid, uuid, date, time, uuid) to service_role;

