alter table calendar_event_mappings
  add column if not exists meet_url text,
  add column if not exists provider_etag text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_error_at timestamptz;

alter table calendar_event_mappings
  drop constraint if exists calendar_event_mappings_retry_count_check,
  add constraint calendar_event_mappings_retry_count_check
    check (retry_count >= 0),
  drop constraint if exists calendar_event_mappings_meet_url_check,
  add constraint calendar_event_mappings_meet_url_check
    check (meet_url is null or meet_url ~ '^https://');

create index if not exists calendar_event_mappings_retry_idx
  on calendar_event_mappings (organization_id, status, last_attempted_at)
  where status in ('pending', 'failed');

create or replace function queue_appointment_calendar_sync()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('confirmed', 'ready', 'cancelled') then
    update calendar_event_mappings
    set
      status = 'pending',
      last_attempted_at = null,
      updated_at = now()
    where organization_id = new.organization_id
      and appointment_request_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_appointment_calendar_sync_on_change on appointment_requests;
create trigger queue_appointment_calendar_sync_on_change
  after update of
    status,
    preferred_date,
    preferred_time,
    administrative_notes,
    service_id,
    service_name_snapshot,
    service_duration_minutes_snapshot
  on appointment_requests
  for each row
  when (
    old.status is distinct from new.status
    or old.preferred_date is distinct from new.preferred_date
    or old.preferred_time is distinct from new.preferred_time
    or old.administrative_notes is distinct from new.administrative_notes
    or old.service_id is distinct from new.service_id
    or old.service_name_snapshot is distinct from new.service_name_snapshot
    or old.service_duration_minutes_snapshot is distinct from new.service_duration_minutes_snapshot
  )
  execute function queue_appointment_calendar_sync();

create or replace function queue_customer_calendar_sync()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update calendar_event_mappings as mapping
  set
    status = 'pending',
    last_attempted_at = null,
    updated_at = now()
  from appointment_requests as appointment
  where appointment.customer_id = new.id
    and appointment.organization_id = new.organization_id
    and appointment.status in ('confirmed', 'ready')
    and mapping.organization_id = appointment.organization_id
    and mapping.appointment_request_id = appointment.id;
  return new;
end;
$$;

drop trigger if exists queue_customer_calendar_sync_on_change on customers;
create trigger queue_customer_calendar_sync_on_change
  after update of full_name, email, mobile_phone
  on customers
  for each row
  when (
    old.full_name is distinct from new.full_name
    or old.email is distinct from new.email
    or old.mobile_phone is distinct from new.mobile_phone
  )
  execute function queue_customer_calendar_sync();
