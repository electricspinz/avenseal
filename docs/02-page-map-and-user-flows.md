# Page Map and User Flows

## Routes

Public:

- `/`
- `/how-it-works`
- `/pricing`
- `/faq`
- `/book`
- `/booking/confirmation`
- `/contact`
- `/privacy`
- `/terms`

Admin:

- `/admin/login`
- `/admin`
- `/admin/appointments`
- `/admin/appointments/[id]`
- `/admin/customers`
- `/admin/customers/[id]`
- `/admin/settings`

The requested route list did not explicitly include dynamic detail routes, but appointment and customer detail screens require stable URLs. They should be added as nested routes under the requested admin sections.

## Public Navigation

Header links only:

- How It Works
- Pricing
- FAQ
- Schedule Appointment

## Homepage Structure

1. Header
2. Hero
3. Trust indicators
4. Three-step How It Works
5. Same-day appointment explanation
6. Transparent pricing preview
7. FAQ preview
8. Final booking CTA
9. Footer

Hero copy:

- H1: Need a Document Notarized Online?
- Supporting copy: Book a same-day appointment with a commissioned Florida remote online notary.
- Primary CTA: Schedule Appointment
- Secondary CTA: How It Works

No eyebrow, kicker, badge, or pill appears above the hero headline.

## Customer Booking Flow

Entry points:

- Homepage primary CTA
- Header Schedule Appointment link
- Pricing CTA
- FAQ CTA
- Final homepage CTA

Flow:

1. Ava introduction and persistent compliance notice.
2. Customer identity: full name, email, mobile phone.
3. Document context: category, number of documents.
4. Signer context: number of signers, current state or country, government-issued ID confirmation.
5. Notarization estimate: estimated notarizations or "I'm not sure".
6. Witness context: witness lines, witnesses already available.
7. Scheduling preference: date, time, urgency.
8. Administrative notes.
9. Consent to privacy policy and terms.
10. Review screen.
11. Submit request.
12. Confirmation screen with `awaiting_review` status and preparation guidance.

Supported behavior:

- Back and next navigation.
- Progress indication.
- Local draft save.
- Keyboard navigation.
- Mobile usability.
- Client-side validation.
- Server-side validation.
- Successful submission state.

The flow does not ask the customer to upload documents, enter ID numbers, enter Social Security numbers, or provide document contents.

## Admin Flow

Login:

1. Admin visits `/admin/login`.
2. Admin authenticates through Supabase.
3. On success, redirect to `/admin`.

Dashboard:

1. Show today's appointment requests.
2. Show awaiting-review count.
3. Show confirmed appointments.
4. Show completed appointments.
5. Show recent customers.
6. Show upcoming appointment times.

Appointment management:

1. Admin opens `/admin/appointments`.
2. Admin filters by status/date and opens a request detail.
3. Admin reviews intake answers, signers, document category, witness answers, notes, consent record, and audit history.
4. Admin adds internal notes.
5. Admin adjusts appointment date/time if needed.
6. Admin changes status to awaiting payment, confirmed, declined, cancelled, ready, completed, or follow-up required.
7. Each administrative update creates an audit log entry; status changes also create status history.

Customer management:

1. Admin opens `/admin/customers`.
2. Admin searches or sorts customers.
3. Admin opens a customer detail to view appointment history and internal notes.

Settings:

1. Admin edits sample availability rules and exceptions.
2. Admin edits basic business settings.
3. Changes are audited.

