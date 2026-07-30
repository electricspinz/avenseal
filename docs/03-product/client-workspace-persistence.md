# Client Workspace Persistence

**Status: Current persistence foundation.** Client Workspace persistence replaces process-local External Sessions with a tenant-scoped database table and formalizes durable appointment access-token metadata. It does not add login, accounts, passwords, email delivery, or provider integration.

## Architecture

External Sessions are persisted by the server repository boundary in `external_sessions`, scoped by organization and appointment. The UI calls only its admin API boundary; the Client Portal receives a deliberately reduced read model. The data includes provider, session name, launch URL, reference number, manual status, notes, timestamps, and safe metadata.

`appointment_access_tokens` already stores only SHA-256 token hashes, expiration, revocation, and last use. This sprint extends it with purpose, issuer, and issued-at metadata. The primary key is the token identifier. Plaintext tokens are generated only at issuance and are never persisted or logged. Validation uses a constant-time hash comparison after lookup, requires a non-revoked token, and requires an unexpired token.

## Security and lifecycle

Tokens support issue, validate, revoke, and expiry states through the durable model. Typed audit contracts cover issuance, validation, revocation, and expiry; audit persistence remains deferred. External Session changes are tenant-scoped. Portal projections never include notes, reference number, metadata, token hashes, or internal appointment/organization IDs.

## Future work

Future magic-link email, customer accounts, document uploads, provider synchronization, BlueNotary/Proof adapters, and persisted audit records require separate authorization and product work. The migration is append-only and includes RLS policies for tenant reads and owner/admin management.
