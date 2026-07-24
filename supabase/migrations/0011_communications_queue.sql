alter type communication_status add value if not exists 'processing';
alter type communication_status add value if not exists 'cancelled';

alter table communication_messages
  add column if not exists channel text not null default 'email' check (channel in ('email', 'sms', 'push')),
  add column if not exists body_html text,
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_attempted_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz;

create unique index if not exists communication_messages_idempotency_idx
  on communication_messages (organization_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists communication_messages_queue_idx
  on communication_messages (organization_id, status, next_attempt_at, created_at);
