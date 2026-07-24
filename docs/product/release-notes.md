# Release Notes

## Unreleased

### Added

- Product and engineering documentation system.

### Changed

- No application behavior changes.

### Fixed

- None.

### Security

- None.

### Operations

- None.

### Known limitations

- Communications scheduling and automated Calendar retry processing remain planned work.

## Platform milestones to date

### Added

- Staging safeguards, tenant-aware service configuration, booking-time service snapshots, Google Calendar-aware availability, and idempotent Calendar event synchronization.
- Secure appointment access, guarded staging integration tests, and desktop/mobile E2E coverage.

### Operations

- Google Calendar retries are currently invoked through a protected administrative endpoint rather than a scheduled processor.
