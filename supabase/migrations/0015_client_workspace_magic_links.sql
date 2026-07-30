-- Sprint 21: supports active appointment-scoped Client Workspace link lookups.
create index if not exists appointment_access_tokens_active_appointment_idx
  on appointment_access_tokens (organization_id, appointment_request_id, issued_at desc)
  where revoked_at is null;

alter table appointment_access_tokens
  drop constraint if exists appointment_access_tokens_purpose_check;

alter table appointment_access_tokens
  add constraint appointment_access_tokens_purpose_check
  check (purpose = 'client_workspace');
