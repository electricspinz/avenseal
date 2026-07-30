# Magic-Link Client Access

## Current behavior

Avenseal uses one appointment-scoped Client Workspace link instead of customer accounts. A token is opaque, stored only as a SHA-256 hash, expires after the appointment window, and is validated server-side on every workspace request. Avenseal coordinates booking, preparation, and payment; identity verification and the video notarization occur with an independent RON provider.

## Lifecycle and privacy

Booking issues a link and sends the confirmation email through the existing communications service. A replacement revokes active links before issuing a new one. Revoked, malformed, replaced, and expired links receive the same generic response. The request-new-link endpoint always gives the same response and limits requests to three per normalized-email hash and ten per IP hash in fifteen minutes.

The portal is an allowlisted projection: it omits internal IDs, notes, token metadata, provider references, and audit data. Token URLs receive `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and noindex/nofollow protections. Tokens and token URLs never appear in audit metadata.

## Admin controls

The repository exposes safe access metadata and rotation/revocation operations. Future admin controls must display only issued, expiration, revocation, and delivery state—never hashes or historic plaintext links.

## Customer workspace rules

The server derives exactly one next step. Cancellation and completion take priority, followed by payment, document guidance, waiting for a session, a joinable session, an in-progress session, and ordinary preparation. The checklist records only persisted facts; government-issued photo ID remains a reminder, never a verified completion. A joinable session explains the handoff to the independent RON provider.

Audit actions cover issuance, rotation, revocation, request, delivery outcome, and successful access. They contain only record identifiers and safe lifecycle metadata. Invalid requests remain generic and do not reveal token, appointment, email, or provider details.

## Future extensions

Email delivery can be expanded without changing the access capability model. Accounts, OAuth, provider synchronization, and persistent browser sessions remain out of scope.
