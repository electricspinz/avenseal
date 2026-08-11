# Google Analytics 4

## Configuration

Set the public `NEXT_PUBLIC_GA_MEASUREMENT_ID` environment variable for the deployment. The current Avenseal measurement ID is `G-4LQ037ZWYP`. A GA measurement ID is public configuration, not a secret.

GA4 loads once from the root layout with Next.js `afterInteractive` scripts. Client-side page views are sent only for approved public paths; token-protected appointment URLs and query strings are not tracked.

## Event taxonomy

Primary conversion: `purchase` (not yet emitted; see below).

Secondary conversions: `booking_submitted`, `bluenotary_handoff`, and `contact_submitted` (not yet emitted because the public site has no contact-submission success flow).

Diagnostic events: `schedule_appointment_click`, `booking_started`, `booking_step_completed`, `appointment_selected`, and `begin_checkout`.

`bluenotary_handoff` records only the anonymous provider label `bluenotary` immediately before the existing handoff action. It does not alter the link, redirect, or provider workflow.

## Privacy rules

Never send customer names, email addresses, phone numbers, addresses, document details, appointment notes, identity data, secure-link tokens, database identifiers, Stripe identifiers, or free-text input. Event parameters are limited to fixed action names, UI location, non-identifying booking state, service category, USD amount where a Checkout Session was successfully created, and the fixed BlueNotary provider label.

## Deferred events

`purchase` is intentionally deferred. The current client-visible payment model does not expose a privacy-safe transaction identifier, and a Stripe return page is not proof of confirmed payment. Add it only through a future reviewed server-side confirmation boundary that can ensure one event per confirmed transaction without sending sensitive identifiers.

`appointment_completed` is also deferred until a reliable, one-time customer-safe completion event can be observed without changing appointment lifecycle behavior.
