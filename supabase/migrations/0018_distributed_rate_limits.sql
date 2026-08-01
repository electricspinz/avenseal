create table rate_limit_counters (
  policy text not null,
  identity_hash text not null,
  window_started_at timestamptz not null,
  window_ends_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (policy, identity_hash, window_started_at)
);

create index rate_limit_counters_expiry_idx on rate_limit_counters (window_ends_at);
alter table rate_limit_counters enable row level security;

create or replace function consume_rate_limit(p_policy text, p_identity_hash text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now(); v_start timestamptz := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds); v_end timestamptz := v_start + make_interval(secs => p_window_seconds); v_count integer;
begin
  insert into rate_limit_counters(policy, identity_hash, window_started_at, window_ends_at, request_count)
  values (p_policy, p_identity_hash, v_start, v_end, 1)
  on conflict (policy, identity_hash, window_started_at) do update set request_count = rate_limit_counters.request_count + 1
  returning request_count into v_count;
  return query select v_count <= p_limit, greatest(1, ceil(extract(epoch from v_end - v_now))::integer);
end $$;

revoke all on rate_limit_counters from anon, authenticated;
revoke all on function consume_rate_limit(text, text, integer, integer) from public;
