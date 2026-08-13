-- Claim finalizers use claimed_by as a lease-owner guard. Return that guard to the worker.
drop function if exists public.claim_document_scan_jobs(integer, text, integer);

create function public.claim_document_scan_jobs(p_batch_size integer, p_claimed_by text, p_lease_seconds integer default 300)
returns table (id uuid, organization_id uuid, appointment_request_id uuid, document_id uuid, attempt_count integer, claimed_by text)
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
    returning j.id, j.organization_id, j.appointment_request_id, j.document_id, j.attempt_count, j.claimed_by
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_document_scan_jobs(integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_document_scan_jobs(integer, text, integer) to service_role;
