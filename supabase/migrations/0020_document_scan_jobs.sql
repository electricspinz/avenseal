-- Sprint 26.1D-B2C: durable, service-role-only document scan execution queue.
create table document_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  document_id uuid not null references appointment_document_files(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'retry_scheduled', 'completed', 'blocked', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  claimed_by text,
  last_failure_category text,
  provider text,
  provider_request_id text,
  scan_duration_ms integer check (scan_duration_ms is null or scan_duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint document_scan_jobs_claim_fields_check check (
    (status = 'claimed' and claimed_at is not null and claim_expires_at is not null and claimed_by is not null)
    or (status <> 'claimed' and claimed_at is null and claim_expires_at is null and claimed_by is null)
  )
);

create index document_scan_jobs_due_idx on document_scan_jobs (next_attempt_at, created_at)
  where status in ('pending', 'retry_scheduled');
create index document_scan_jobs_stale_claim_idx on document_scan_jobs (claim_expires_at)
  where status = 'claimed';
create index document_scan_jobs_organization_status_idx on document_scan_jobs (organization_id, status, created_at);
create unique index document_scan_jobs_one_active_document_idx on document_scan_jobs (document_id)
  where status in ('pending', 'claimed', 'retry_scheduled');

alter table document_scan_jobs enable row level security;
revoke all on document_scan_jobs from anon, authenticated;

create or replace function enqueue_document_scan_job(p_organization_id uuid, p_appointment_request_id uuid, p_document_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_job_id uuid;
begin
  if not exists (
    select 1 from appointment_document_files
    where id = p_document_id
      and organization_id = p_organization_id
      and appointment_request_id = p_appointment_request_id
      and deleted_at is null
      and scan_status = 'pending'
      and storage_status = 'quarantined'
  ) then
    return null;
  end if;

  insert into document_scan_jobs (organization_id, appointment_request_id, document_id)
  values (p_organization_id, p_appointment_request_id, p_document_id)
  on conflict (document_id) where status in ('pending', 'claimed', 'retry_scheduled') do nothing
  returning id into v_job_id;

  if v_job_id is not null then
    insert into audit_logs (organization_id, action, entity_type, entity_id, metadata)
    values (p_organization_id, 'document.scan_job_created', 'appointment_request', p_appointment_request_id,
      jsonb_build_object('documentId', p_document_id, 'jobId', v_job_id));
  end if;
  return v_job_id;
end;
$$;

create or replace function claim_document_scan_jobs(p_batch_size integer, p_claimed_by text, p_lease_seconds integer default 300)
returns table (id uuid, organization_id uuid, appointment_request_id uuid, document_id uuid, attempt_count integer)
language plpgsql security definer set search_path = public as $$
begin
  if p_batch_size < 1 or p_batch_size > 20 or char_length(trim(p_claimed_by)) = 0 or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Invalid document scan worker claim.';
  end if;

  -- A crash does not consume another attempt. The next claim will increment it once.
  update document_scan_jobs
  set status = 'retry_scheduled', claimed_at = null, claim_expires_at = null, claimed_by = null,
      next_attempt_at = now(), updated_at = now(), last_failure_category = coalesce(last_failure_category, 'worker_lease_expired')
  where status = 'claimed' and claim_expires_at <= now();

  return query
  with candidates as (
    select j.id from document_scan_jobs j
    where j.status in ('pending', 'retry_scheduled') and j.next_attempt_at <= now()
    order by j.next_attempt_at, j.created_at
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update document_scan_jobs j
    set status = 'claimed', claimed_at = now(), claim_expires_at = now() + make_interval(secs => p_lease_seconds),
        claimed_by = p_claimed_by, attempt_count = j.attempt_count + 1, updated_at = now()
    from candidates c
    where j.id = c.id
    returning j.id, j.organization_id, j.appointment_request_id, j.document_id, j.attempt_count
  )
  select * from claimed;
end;
$$;

revoke all on function enqueue_document_scan_job(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function claim_document_scan_jobs(integer, text, integer) from public, anon, authenticated;
grant execute on function enqueue_document_scan_job(uuid, uuid, uuid) to service_role;
grant execute on function claim_document_scan_jobs(integer, text, integer) to service_role;
