-- Sprint 26.1D-B1.1: durable security scan and storage lifecycle state.
alter table appointment_document_files
  add column scan_status text not null default 'pending',
  add column storage_status text not null default 'quarantined',
  add column scan_provider text,
  add column scan_requested_at timestamptz,
  add column scanned_at timestamptz,
  add column scan_failure_category text,
  add column scan_attempt_count integer not null default 0;

alter table appointment_document_files
  add constraint appointment_document_files_scan_status_check
    check (scan_status in ('pending', 'clean', 'infected', 'suspicious', 'failed')),
  add constraint appointment_document_files_storage_status_check
    check (storage_status in ('quarantined', 'active', 'removed')),
  add constraint appointment_document_files_scan_attempt_count_check
    check (scan_attempt_count >= 0),
  add constraint appointment_document_files_active_requires_clean_check
    check (storage_status <> 'active' or scan_status = 'clean');

create index appointment_document_files_pending_scan_idx
  on appointment_document_files (uploaded_at)
  where scan_status = 'pending' and deleted_at is null;

create index appointment_document_files_active_clean_appointment_idx
  on appointment_document_files (organization_id, appointment_request_id, uploaded_at desc)
  where scan_status = 'clean' and storage_status = 'active' and deleted_at is null;

create index appointment_document_files_cleanup_idx
  on appointment_document_files (storage_status, scan_status, uploaded_at)
  where deleted_at is null;
