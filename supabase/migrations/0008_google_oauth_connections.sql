create table if not exists google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  state_hash text not null unique,
  redirect_path text not null default '/admin/settings/integrations',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists google_oauth_states_org_user_idx
  on google_oauth_states (organization_id, user_id, created_at desc);

create index if not exists google_oauth_states_active_idx
  on google_oauth_states (state_hash, expires_at)
  where used_at is null;

create table if not exists google_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  google_account_id text,
  google_account_email text,
  encrypted_refresh_token text,
  refresh_token_iv text,
  refresh_token_tag text,
  encrypted_access_token text,
  access_token_iv text,
  access_token_tag text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'reconnect_required', 'error')),
  last_successful_refresh_at timestamptz,
  last_verified_at timestamptz,
  last_error_category text,
  last_error_message text,
  disconnected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create index if not exists google_oauth_connections_org_status_idx
  on google_oauth_connections (organization_id, status);

alter table google_oauth_states enable row level security;
alter table google_oauth_connections enable row level security;

-- No browser-readable policies are created for these credential-bearing tables.
-- Server routes use service-role access only after application-level authorization.

drop trigger if exists touch_google_oauth_connections on google_oauth_connections;
create trigger touch_google_oauth_connections
  before update on google_oauth_connections
  for each row execute function touch_updated_at();
