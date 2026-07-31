-- Sprint 24.2A: review metadata only. Existing documents remain uploaded.
alter table appointment_document_files
  drop constraint if exists appointment_document_files_status_check;

alter table appointment_document_files
  add constraint appointment_document_files_status_check
  check (status in ('uploaded', 'approved', 'rejected'));

alter table appointment_document_files
  add column reviewed_by uuid references user_profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_notes text check (review_notes is null or char_length(review_notes) <= 2000);

update appointment_document_files
  set status = 'uploaded'
  where status is null;

create index appointment_document_files_pending_review_idx
  on appointment_document_files (organization_id, uploaded_at desc)
  where deleted_at is null and status = 'uploaded';
