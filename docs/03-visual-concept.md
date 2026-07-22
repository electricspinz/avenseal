# Visual Concept for Approval

## Generated Concept References

Recommended approval references:

- Public website concept: `/Users/aspectaerialfl/.codex/generated_images/019f684a-3222-7663-a2e8-605e6b359850/ig_078ec7e6dbcb1eb5016a5833068c708193a4d543a4db776ec0.png`
- Booking and confirmation concept: `/Users/aspectaerialfl/.codex/generated_images/019f684a-3222-7663-a2e8-605e6b359850/ig_03caa595d3b43a09016a5861aa1a608194bb9d1cc22ec1094a.png`
- Admin dashboard concept: `/Users/aspectaerialfl/.codex/generated_images/019f684a-3222-7663-a2e8-605e6b359850/ig_0f6d7e9b9c7b66ec016a582acc24708195a00225c4681ba610.png`

These are concept references for approval only. Implementation should not begin until the visual direction is approved or revised.

The generated images are visual references, not exact compliance copy. During implementation, the written requirements in this document override any generated-image drift. Specifically:

- Do not include SMS or email automation claims in Milestone 1.
- Do not include a public confirmation button that returns to an admin dashboard.
- Do not imply Avenseal provides witnesses.
- Do not include final pricing amounts until the business approves pricing.
- Do not use official-looking seals, shields, or government-style marks.
- Use `Terms` instead of `Terms of Service` if the final route remains `/terms`.

## Design Direction

Avenseal should feel like a calm premium fintech-grade professional service, not a traditional notary site. The visual system should emphasize speed, clarity, security, and human support without implying automation of the notarial act.

## Brand System

Colors:

- Midnight navy: `#102A43`
- Deep slate: `#334E68`
- Light silver: `#D9E2EC`
- Emerald action: `#2BB673`
- White: `#FFFFFF`

Typography:

- Primary font: Geist or Inter.
- Headings: confident, high-contrast, low tracking, no decorative styling.
- Body: calm, readable, concise.
- UI labels: compact, clear, and accessible.

Shape and surfaces:

- Mostly white page background.
- Navy used for brand anchors, footer, admin sidebar, and high-emphasis text.
- Emerald used sparingly for primary action and positive state.
- Light silver used for dividers, borders, step connectors, table rows, and inactive controls.
- Border radii should stay restrained, generally 8px or less for cards and controls.

Imagery and icons:

- Use line icons or small geometric document/session motifs.
- Avoid gavels, courthouses, scales, government-style seals, script fonts, generic handshakes, and dense legal symbolism.
- Use an abstract Avenseal mark or wordmark, not a government seal.

## Public Website Concept

The homepage should open with a simple header and a direct customer-need headline. The first viewport should be spacious, mostly white, and action-oriented. A document/session visual can sit beside or behind the hero content as a restrained product-service signal, but it should not become a fake dashboard full of claims.

The trust indicators should be compact and factual:

- Commissioned Florida Remote Online Notary
- Same-Day Appointments
- Secure Online Session
- Clear Pricing

The remaining sections should alternate open white space and light silver bands rather than repeated card grids. The pricing preview should be transparent but avoid unsupported payment integration claims.

## Booking Concept

The booking flow should feel like a focused concierge chat blended with a structured form. Ava is a virtual booking assistant and must not be represented as a commissioned notary or human employee.

Key layout:

- Left or top progress rail.
- Main conversational panel.
- Persistent compliance notice.
- One primary question group at a time.
- Clear Back and Next buttons.
- Review screen before submission.
- Mobile layout collapses into a single-column guided flow.

The persistent notice is required:

> Do not sign your document until instructed by the notary. Every request is subject to review before the appointment is confirmed.

## Confirmation Concept

The confirmation screen should confirm request receipt, show status `awaiting_review`, and provide preparation guidance. It should avoid guaranteeing success.

For Milestone 1, the "what happens next" copy should say that Avenseal will review the request and contact the customer manually. It must not claim automated email or SMS delivery.

Required copy:

> A commissioned notary will review your request and make all notarial determinations during the session.

## Admin Concept

The admin area should be calm, compact, and operational. Use a restrained sidebar, clear tables, status labels, detail panels, internal notes, and audit history. It should not use fake revenue, review, conversion, or unsupported performance metrics.

Primary dashboard panels:

- Today's appointment requests
- Awaiting-review count
- Confirmed appointments
- Completed appointments
- Recent customers
- Upcoming appointment times

Appointment detail should prioritize status, requested time, customer information, intake answers, internal notes, and audit history.
