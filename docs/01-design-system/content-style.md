# Content Style

**Status:** Current writing standard; terminology conflicts are noted as **Technical Debt** rather than silently changed in production.

## Voice and tone

Avenseal is calm, direct, helpful, professional, human, respectful, and precise. It is not cute, promotional in operational workflows, alarmist, robotic, judgmental, overconfident, or verbose. State the fact, what remains safe, and the next action.

## Terminology

| Prefer | Use when | Avoid / note |
| --- | --- | --- |
| Appointment | The customer request and operational record | “Booking” only for the act of submitting a request |
| Customer | Person receiving notary service | **Technical Debt:** legacy copy may use client |
| Communication | Any customer-facing message record | Email when channel matters specifically |
| Reminder | Time-based appointment communication | Do not use as a synonym for every notification |
| Calendar event | Provider-synced calendar record | Do not imply it exists when no mapping exists |
| Attention Required | Actionable, source-backed operational issue | Not a generic warning bucket |
| Mission Control | Planned default operations homepage | “Dashboard” remains current route/navigation terminology |
| AI recommendation | Future decision-support suggestion | Never call it an instruction or decision |

## Writing patterns

| Element | Standard | Example |
| --- | --- | --- |
| Buttons/actions | Verb-first and specific | “Review Appointment”, “Retry Communication” |
| Labels/headings | Noun or concise task | “Today’s Schedule”, “Calendar Sync” |
| Helper text | Explain consequence or constraint | “Customers will not receive automated reminder emails.” |
| Empty states | State absence + next useful path | “No appointments are recorded today.” |
| Success | Confirm the completed action, not celebration | “Settings saved.” |
| Warning | Explain effect and action | “2 communications failed. Review eligible retries.” |
| Confirmation | Name the exact impact | “Cancel Appointment” rather than “Yes” |

Avoid vague actions (“Submit”, “Manage”, “Click here”) when a specific verb is available. Do not say “Everything is healthy” unless the exact verified scope is clear.

## Errors and system health

Every error answers: what happened, what remains safe, and what to do next. Example: “We couldn’t load communication health. Appointment information is still available. Try again.” Do not expose stack traces, database identifiers, credentials, or provider tokens.

Use **Healthy**, **Needs Attention**, **Degraded**, and **Unknown** for system health. Unknown is an honest outcome when a data source is unavailable. Pair all status color with text.

## AI, dates, names, and accessibility

AI copy must name itself as a recommendation, explain evidence, distinguish fact from suggestion, and preserve user control: “Two appointments are approaching their requested times and still need review.” Never claim certainty or fabricate urgency.

Use the organization/user locale and timezone when available. Prefer unambiguous absolute dates and times for consequential actions; relative time may supplement, not replace, it. Use names as recorded; do not infer title, pronouns, or familiarity.

For accessibility, write unique action names, avoid color-only meaning, keep abbreviations expanded where context is absent, and make timestamp labels understandable to screen readers.

## Prohibited patterns

- Fake metrics, fake delivery/provider health, or unsupported claims.
- “Something went wrong” when a safe specific explanation is available.
- Artificial urgency, routine celebration, or long prose above operational content.
- AI that pretends to be human, makes a notarial/legal decision, or hides its evidence.
