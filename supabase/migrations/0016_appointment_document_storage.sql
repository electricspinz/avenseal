create table appointment_document_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_request_id uuid not null references appointment_requests(id) on delete cascade,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_key text not null unique check (char_length(storage_key) between 1 and 1024),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'uploaded' check (status = 'uploaded'),
  uploaded_by_type text not null check (uploaded_by_type in ('customer', 'staff', 'system')),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointment_document_files_active_appointment_idx
  on appointment_document_files (organization_id, appointment_request_id, uploaded_at desc)
  where deleted_at is null;

alter table appointment_document_files enable row level security;

create policy "members can read appointment document files" on appointment_document_files
  for select using (organization_id in (select user_org_ids()));

create policy "owners and admins can manage appointment document files" on appointment_document_files
  for all using (can_manage_org(organization_id)) with check (can_manage_org(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('appointment-documents', 'appointment-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
