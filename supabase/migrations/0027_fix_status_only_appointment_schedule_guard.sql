-- A status transition must not revalidate an appointment's already-persisted
-- schedule against present-time booking rules. Schedule fields remain guarded
-- on insert and on an actual date, time, or duration change.
create or replace function public.guard_appointment_schedule_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and new.preferred_date is not distinct from old.preferred_date
    and new.preferred_time is not distinct from old.preferred_time
    and new.service_duration_minutes_snapshot is not distinct from old.service_duration_minutes_snapshot then
    return new;
  end if;

  if new.status in (
    'awaiting_review',
    'awaiting_payment',
    'clarification_needed',
    'approved_pending_payment',
    'payment_processing',
    'confirmed',
    'ready',
    'follow_up_required'
  ) and new.service_duration_minutes_snapshot is not null then
    perform public.assert_appointment_slot_available(
      new.organization_id,
      new.id,
      new.preferred_date,
      new.preferred_time,
      new.service_duration_minutes_snapshot
    );
  end if;

  return new;
end;
$$;

drop trigger if exists guard_appointment_schedule_write_on_change on appointment_requests;
create trigger guard_appointment_schedule_write_on_change
before insert or update of preferred_date, preferred_time, service_duration_minutes_snapshot
on appointment_requests
for each row execute function public.guard_appointment_schedule_write();

revoke all on function public.guard_appointment_schedule_write() from public, anon, authenticated;
