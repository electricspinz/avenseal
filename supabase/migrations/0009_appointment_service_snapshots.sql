alter table appointment_requests
  add column if not exists service_id uuid,
  add column if not exists service_name_snapshot text,
  add column if not exists service_duration_minutes_snapshot integer,
  add column if not exists service_price_cents_snapshot integer,
  add column if not exists service_currency_snapshot text;

with unique_active_services as (
  select
    organization_id,
    (array_agg(id order by display_order, id))[1] as service_id
  from organization_services
  where is_active = true
  group by organization_id
  having count(*) = 1
)
update appointment_requests as appointment
set
  service_id = service.id,
  service_name_snapshot = service.customer_name,
  service_duration_minutes_snapshot = service.default_duration_minutes,
  service_price_cents_snapshot = service.base_price_cents,
  service_currency_snapshot = service.currency
from unique_active_services as candidate
join organization_services as service
  on service.id = candidate.service_id
 and service.organization_id = candidate.organization_id
where appointment.organization_id = candidate.organization_id
  and appointment.service_id is null;

create unique index if not exists organization_services_org_id_unique
  on organization_services (organization_id, id);

create index if not exists appointment_requests_org_service_idx
  on appointment_requests (organization_id, service_id)
  where service_id is not null;

alter table appointment_requests
  drop constraint if exists appointment_requests_service_organization_fkey,
  add constraint appointment_requests_service_organization_fkey
    foreign key (organization_id, service_id)
    references organization_services (organization_id, id)
    on delete restrict,
  drop constraint if exists appointment_requests_service_duration_snapshot_check,
  add constraint appointment_requests_service_duration_snapshot_check
    check (
      service_duration_minutes_snapshot is null
      or service_duration_minutes_snapshot between 5 and 240
    ),
  drop constraint if exists appointment_requests_service_price_snapshot_check,
  add constraint appointment_requests_service_price_snapshot_check
    check (
      service_price_cents_snapshot is null
      or service_price_cents_snapshot >= 0
    ),
  drop constraint if exists appointment_requests_service_currency_snapshot_check,
  add constraint appointment_requests_service_currency_snapshot_check
    check (
      service_currency_snapshot is null
      or service_currency_snapshot ~ '^[A-Z]{3}$'
    ),
  drop constraint if exists appointment_requests_service_snapshot_complete_check,
  add constraint appointment_requests_service_snapshot_complete_check
    check (
      service_id is null
      or (
        service_name_snapshot is not null
        and service_duration_minutes_snapshot is not null
        and service_currency_snapshot is not null
      )
    );

create or replace function derive_appointment_service_snapshots()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected_service organization_services%rowtype;
begin
  if tg_op = 'UPDATE' and new.service_id is not distinct from old.service_id then
    if new.service_name_snapshot is distinct from old.service_name_snapshot
      or new.service_duration_minutes_snapshot is distinct from old.service_duration_minutes_snapshot
      or new.service_price_cents_snapshot is distinct from old.service_price_cents_snapshot
      or new.service_currency_snapshot is distinct from old.service_currency_snapshot then
      raise exception 'Appointment service snapshots are immutable unless the service changes.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.service_id is not null and new.service_id is null then
    raise exception 'An assigned appointment service cannot be removed.'
      using errcode = '23514';
  end if;

  if new.service_id is null then
    new.service_name_snapshot = null;
    new.service_duration_minutes_snapshot = null;
    new.service_price_cents_snapshot = null;
    new.service_currency_snapshot = null;
    return new;
  end if;

  select *
  into selected_service
  from organization_services
  where id = new.service_id
    and organization_id = new.organization_id
    and is_active = true
    and delivery_type = 'remote'
    and metadata ->> 'bookable' is distinct from 'false';

  if not found then
    raise exception 'Selected service is not active and bookable for this organization.'
      using errcode = '23503';
  end if;

  new.service_name_snapshot = selected_service.customer_name;
  new.service_duration_minutes_snapshot = selected_service.default_duration_minutes;
  new.service_price_cents_snapshot = selected_service.base_price_cents;
  new.service_currency_snapshot = selected_service.currency;
  return new;
end;
$$;

drop trigger if exists derive_appointment_service_snapshots_on_write on appointment_requests;
create trigger derive_appointment_service_snapshots_on_write
  before insert or update of
    service_id,
    service_name_snapshot,
    service_duration_minutes_snapshot,
    service_price_cents_snapshot,
    service_currency_snapshot
  on appointment_requests
  for each row execute function derive_appointment_service_snapshots();
