# Avenseal Florida RON Session Assistant — v1.0 Candidate Specification

**Status:** Candidate for final legal/compliance approval
**Jurisdiction:** Florida
**Workflow Version:** FL-RON-1.0
**Purpose:** Source of truth for the Avenseal Admin Session Assistant

---

# 1. Governing Product Principle

Avenseal does **not generate notarial scripts dynamically with AI** during a session.

The Session Assistant assembles a workflow from pre-approved, versioned modules according to facts confirmed by the commissioned Florida Online Notary Public.

**Architecture:**

Appointment Data
→ Notary Confirmation
→ Deterministic Rules Engine
→ Approved Script Modules
→ Guided Session
→ Completion Record

The commissioned notary remains responsible for determining whether the notarial act may lawfully proceed.

---

# 2. Compliance Labels

Every module displayed in the Session Assistant must have one of the following classifications.

### REQUIRED BY FLORIDA LAW

The step implements or captures a statutory requirement applicable to the session.

### CONDITIONAL FLORIDA REQUIREMENT

The step becomes required only because of a specific fact, such as:

- principal outside Florida;
- remote witness;
- physical witness;
- special §117.285 instrument;
- multiple principals; or
- particular notarial act.

### AVENSEAL SAFEGUARD

A workflow control or best practice intended to reduce errors, document the notary's decision-making, or improve consistency.

Avenseal must never represent an Avenseal safeguard as statutory language.

---

# 3. Session Configuration

Before the Session Assistant begins, the Admin displays a **Prepare Session** screen.

The notary confirms:

## Appointment

- Jurisdiction
- Appointment ID
- Principal(s)
- Document(s)

## Notarial Act

Select:

- Acknowledgment — Individual
- Acknowledgment — Representative Capacity
- Oath/Affirmation / Jurat
- Other authorized Florida notarial act
- Notarial act not yet established

If **Notarial act not yet established** is selected:

**BLOCK START OF NOTARIAL CEREMONY.**

Display:

> The required notarial act has not been established. Avenseal does not select a notarial act for the principal. Obtain appropriate instructions or a completed notarial certificate before proceeding.

---

# 4. Principal Configuration

For each principal:

- Full name
- Current physical location
- Florida / Outside Florida
- Identity method:
  - Personally known
  - RON identity verification
- Identity verification status:
  - Pending
  - Passed
  - Failed
- Individual or representative capacity
- Signing document(s)

The notary's own physical location must also be recorded:

- State: Florida
- County: \_\_\_\_\_\_\_\_\_\_

If the notary is not physically located in Florida:

**STOP — ONLINE NOTARIZATION MAY NOT PROCEED UNDER THIS FLORIDA ONLINE-NOTARY WORKFLOW.**

---

# 5. Witness Configuration

Select:

- No witnesses
- Witness(es) physically present with principal
- Remote witness(es)
- Combination of physical and remote witnesses

For each witness:

- Full name
- Physical or remote
- Current physical location
- Identity verification status if remote

If remote:

- U.S./territory residency confirmation
- Current U.S./territory physical-location confirmation

---

# 6. §117.285 Configuration

Ask:

**Does this electronic record fall within the special document categories governed by Fla. Stat. §117.285(5)?**

Examples presented to the notary for reference may include:

- will;
- qualifying revocable trust with testamentary aspects;
- health-care advance directive;
- specified succession agreement;
- specified waiver of spousal rights; or
- qualifying power of attorney.

Then ask:

**Will fewer than two witnesses be physically present with the principal?**

If both answers are **Yes**, activate:

`FL-117285`

If at least two witnesses are physically present with the principal, do not activate the special remote-witnessing questionnaire.

---

# 7. Core Module Routing

Every successful Florida session begins with:

`FL-CORE`

Then:

`FL-IDENTITY`

Then:

`FL-LOCATION`

Then applicable conditional modules.

Then exactly one applicable notarial-act module.

Then:

`FL-COMPLETE`

---

# 8. FL-CORE v1.0

**Classification:** Required + Avenseal operational safeguards

## Notary checklist before reading

- Recording active.
- Two-way audio/video communication working.
- Notary physically located in Florida.
- Document/general record description available.
- Notarial act established.

## READ ALOUD

> Hello. My name is **[Commissioned Notary Name]**. I am a commissioned Florida Online Notary Public, and I am physically located in **[County] County, Florida**.
>
> Today's date is **[Date]**.
>
> We are conducting a remote online notarization using real-time audio-video communication technology, and this session is being recorded.
>
> The record being presented for notarization is **[Document Title or General Description]**.
>
> The notarial act being performed is **[Notarial Act]**.
>
> Can you see and hear me clearly?

Record answer.

### Avenseal safeguard

> Do you consent to continuing this notarization using audio-video communication technology, and do you understand that this session is being recorded?

Record answer.

If principal does not consent:

`FL-STOP-DECLINE`

---

# 9. FL-IDENTITY v1.0

**Classification:** Required by Florida law

## READ ALOUD

> Please state your full legal name for the recording.

Record name.

## Identity Method A — Personally Known

Notary confirms:

**I personally know this principal with sufficient certainty to establish identity.**

## Identity Method B — RON Verification

Required workflow must confirm:

- remote presentation of a government-issued identification credential;
- credential analysis; and
- compliant identity proofing.

The Session Assistant should receive these results from the RON provider when technically available.

Display to notary:

**Credential presented:** ✓
**Credential analysis:** Passed
**Identity proofing:** Passed

The notary confirms:

**Identity satisfactorily established.**

### Hard stop

If required identity verification fails:

`FL-STOP-IDENTITY`

Avenseal must **not offer credible witnesses as a substitute for failed RON identity verification**.

---

# 10. FL-LOCATION v1.0

**Classification:** Required/conditional

## READ ALOUD

> Please state your current physical location, including your city, state or province, and country.

Record response.

Compare the spoken location with session configuration.

If Florida:

Continue.

If outside Florida:

Insert `FL-OUTSIDE-FL`.

If spoken location differs from configuration:

Prompt:

**Session circumstances changed. Update principal location?**

The notary confirms the actual location before continuing.

---

# 11. FL-OUTSIDE-FL v1.0

**Classification:** Conditional Florida requirement

Activate whenever the principal is **not physically located in Florida**, including another U.S. state or another country.

## READ ALOUD

> Do you want this notarial act to be performed by a Florida Notary Public and under the general law of the State of Florida?

Required response:

**Yes**

If valid written consent satisfying the requirement has already been captured, the Admin may show:

**Written confirmation on file ✓**

and permit the notary to acknowledge it instead of repeating the question.

If required confirmation is not obtained:

**STOP.**

---

# 12. FL-WILLINGNESS v1.0

**Classification:** Part statutory recording requirement + Avenseal safeguards

Florida requires the recording to capture a declaration that the principal's signature is knowingly and voluntarily made.

## READ ALOUD

> Are you participating in this notarization voluntarily and of your own free will?

Required affirmative response.

> Do you understand the general nature and purpose of the document you are signing?

Avenseal safeguard.

> Is anyone forcing, threatening, coercing, or improperly pressuring you to sign?

Expected response:

**No**

Do not ask the notary to explain the legal meaning or consequences of the document.

### Required signature declaration

At the appropriate signing point:

> Are you knowingly and voluntarily placing your signature on this record?

Required affirmative response.

If willingness is questionable:

`FL-STOP-WILLINGNESS`

---

# 13. FL-ACK-INDIVIDUAL v1.0

**Classification:** Notarial-act module

Use only when the notary has established that an acknowledgment in an individual capacity is required.

## READ ALOUD

> Do you acknowledge that this is your signature and that you executed this document voluntarily for the purposes stated in it?

Required affirmative response.

The principal does not need to take an oath for an acknowledgment.

Proceed to applicable signing/witness steps and completion.

---

# 14. FL-ACK-REPRESENTATIVE v1.0

Use when an acknowledgment is being taken in representative capacity.

Capture:

- principal name;
- representative capacity;
- represented person/entity.

## READ ALOUD

> Do you acknowledge that you executed this document in your stated representative capacity for the purposes stated in the document?

Required affirmative response.

---

# 15. FL-JURAT v1.0

**Classification:** Required when oath or affirmation applies

Do not substitute an acknowledgment.

## READ ALOUD

> I am now going to administer an oath or affirmation. You may swear or affirm according to your preference.

Optional Avenseal practice:

> Please raise your right hand.

Raising the hand is **not treated by Avenseal as a statutory requirement**.

## OATH / AFFIRMATION

> Do you solemnly swear or affirm that the statements contained in this document are true and correct to the best of your knowledge and belief?

Required affirmative response.

Accept responses such as:

- I swear.
- I affirm.
- I do.
- Yes.

The principal must sign as required for the jurat while appearing through the compliant RON session.

---

# 16. FL-PHYSICAL-WITNESS v1.0

Activate for each witness physically present with the principal.

## READ ALOUD TO WITNESS

> Please state your full name and current address for the recording.

Record response.

The witness must observe the principal signing.

The witness must be included in the recording during the required witnessing activity.

---

# 17. FL-REMOTE-WITNESS v1.0

Activate for each remote witness.

The remote witness's identity must be verified under the applicable remote identity procedures.

## READ ALOUD

> Please state your full legal name.

Record response.

> Are you a resident of the United States or a territory of the United States?

Required affirmative response.

> Are you physically located within the United States or a territory of the United States right now?

Required affirmative response.

> Please state your current physical location.

Record response.

The witness must be present through audio-video technology when the principal signs.

After the principal signs:

> [Principal Name], please state for the recording whether you signed this electronic record.

Principal must affirm that the record was signed.

If witness residency/location requirements are not satisfied:

**STOP REMOTE WITNESSING WORKFLOW.**

---

# 18. FL-117285 v1.0

**Classification:** Special conditional Florida requirement

Activate only when:

1. the instrument is within §117.285(5); and
2. fewer than two witnesses are physically present with the principal.

## RON PROVIDER PRE-SCREENING

Before remote witnessing is facilitated, the RON provider must complete the statutory screening.

The workflow must confirm that the provider asked substantially:

1. Whether the principal is under the influence of drugs or alcohol impairing decision-making.
2. Whether a physical or mental condition or long-term disability impairs normal activities of daily living.
3. Whether the principal requires assistance with daily care.

### If any response is affirmative

Display:

**REMOTE WITNESSING NOT PERMITTED FOR THIS WORKFLOW**

Witnesses must be physically present with the principal for the signature to be validly witnessed under this procedure.

The required statutory written notice must also be delivered by the RON provider before proceeding with remote witnessing.

## NOTARY QUESTIONS DURING SESSION

The notary asks substantially:

> Are you currently married? If so, please state your spouse's name.

> Please state the names of anyone who assisted you in accessing this video conference today.

> Please state the names of anyone who assisted you in preparing the documents you are signing today.

> Where are you currently located?

> Who is in the room with you?

Record each response separately.

The UI must instruct:

**Consider these responses in determining whether the notarial act may appropriately proceed.**

Avenseal must not automatically decide capacity, vulnerability, undue influence, or legal validity.

---

# 19. FL-MULTI-PRINCIPAL v1.0

When more than one principal participates, repeat independently for each:

- identity confirmation;
- physical location;
- outside-Florida confirmation if applicable;
- willingness;
- applicable oath/affirmation or acknowledgment;
- signature declaration;
- signing event.

Never treat a group response as completing an individually required step.

UI example:

**Principal 1 — John Smith**
Identity ✓
Location ✓
Willingness ✓
Act ✓
Signature ✓

**Principal 2 — Jane Smith**
Identity ✓
Location ✓
Willingness ○
Act ○
Signature ○

---

# 20. FL-STOP-IDENTITY v1.0

Trigger:

- required credential presentation unavailable;
- credential analysis fails;
- identity proofing fails;
- insufficient identity-proofing information; or
- notary cannot satisfactorily establish identity.

Display:

## DO NOT CONTINUE THE NOTARIZATION

## READ ALOUD

> I am unable to satisfactorily complete the identity-verification requirements for this online notarization, so I cannot complete the notarial act during this session.

Outcome:

**Stopped — Identity Verification**

---

# 21. FL-STOP-TECH v1.0

Trigger when the notary determines audio-video communication is inadequate.

## READ ALOUD, IF COMMUNICATION PERMITS

> The audio-video connection is no longer sufficient for me to continue the online notarization. I am stopping the notarization at this time. A new session may begin once a compliant audio-video connection is available.

Outcome:

**Stopped — Audio/Video Failure**

Do not describe the previous transaction as automatically “legally invalid” or “legally compromised.”

---

# 22. FL-STOP-WILLINGNESS v1.0

Triggers may include:

- apparent coercion;
- principal refuses to continue;
- notary doubts voluntariness;
- circumstances prevent the notary from determining that the signature is knowingly and voluntarily made.

## READ ALOUD

> I am unable to continue with the notarization at this time, so I am stopping the notarial session.

The notary may select an internal reason.

Do not disclose sensitive internal notes to other participants through the script.

---

# 23. FL-STOP-CAPACITY v1.0

Florida prohibits notarization when it appears that the person is mentally incapable of understanding the nature and effect of the document at the time of notarization.

When the notary reaches that determination:

## READ ALOUD

> I am unable to complete this notarization at this time, so I am ending the notarial session.

Outcome:

**Stopped — Notary Unable to Proceed**

The customer-facing record should not unnecessarily publish a medical or diagnostic characterization.

---

# 24. FL-STOP-INCOMPLETE-DOCUMENT v1.0

If the document is blank or incomplete in a manner prohibited by Florida law:

## DISPLAY

**DO NOT NOTARIZE**

> The document cannot be notarized in its current incomplete or blank state.

Allow:

**Return to Customer / Correct Document**

Do not allow completion of the notarial act until the issue is resolved.

---

# 25. FL-COMPLETE v1.0

Before completion, display:

## Final Compliance Review

For each applicable principal:

- Identity satisfactorily established.
- Physical location captured.
- Outside-Florida confirmation obtained if required.
- Knowingly and voluntarily signed.
- Applicable notarial ceremony completed.
- Signature witnessed as required.

Session-level:

- Recording remained active throughout the online notarization.
- Document/general record identified.
- Notarial act identified at commencement.
- Required witnesses completed.
- §117.285 procedure completed if applicable.
- Correct certificate completed.
- Online notarization appearance reflected in certificate.
- Venue reflects the notary's Florida location.
- Identification method recorded.
- Electronic notary signature applied.
- Electronic seal applied.
- Electronic journal entry completed.

## READ ALOUD

> The notarial act is complete. Your electronically notarized document will be made available through the applicable delivery process.
>
> This concludes today's remote online notarization session. Thank you.

Then end recording.

---

# 26. Journal Data Requirements

The workflow should capture or confirm:

- date;
- time;
- type of notarial act;
- record type/title/description;
- principal name;
- principal address;
- evidence of identity;
- credential type where applicable;
- credential-analysis result;
- identity-proofing result;
- fee charged, if any.

Avenseal should distinguish:

**Avenseal appointment/audit data**

from

**statutory RON electronic journal maintained by the notary/provider.**

Do not assume Avenseal itself is the statutory repository unless intentionally implemented and legally reviewed for that role.

---

# 27. Certificate Completion Requirements

The completion screen should verify that the certificate includes the required Florida elements applicable to the act, including:

- State of Florida;
- county representing the notary's location;
- type of act;
- online/audio-video appearance;
- exact date;
- principal name;
- identification method;
- official notary signature;
- commissioned name; and
- official seal.

The system may validate obvious missing fields.

It must not alter a completed notarial certificate after the notarization has been completed.

---

# 28. Recording Requirements

The workflow should remind the notary that the RON recording must capture:

- appearance of principal and required witnesses;
- identity confirmation;
- general identification of records;
- identification of the notarial act at commencement;
- declaration that the signature is knowingly and voluntarily made;
- actions and spoken words throughout the online notarization; and
- signing of the records.

The RON provider's recording must remain uninterrupted and unedited.

Required journal and recording retention is at least 10 years, subject to special rules for electronic wills.

---

# 29. Dynamic Routing Matrix

## Base

Every session:

`CORE → IDENTITY → LOCATION → WILLINGNESS`

## Principal outside Florida

Insert:

`OUTSIDE-FL`

after location.

## Acknowledgment — Individual

Add:

`ACK-INDIVIDUAL`

## Acknowledgment — Representative

Add:

`ACK-REPRESENTATIVE`

## Jurat

Add:

`JURAT`

## Physical witness

Add for each:

`PHYSICAL-WITNESS`

## Remote witness

Add for each:

`REMOTE-WITNESS`

## §117.285 qualifying instrument + fewer than two physical witnesses

Add:

`117285`

## Multiple principals

Wrap principal-specific modules in:

`MULTI-PRINCIPAL`

## Successful ending

Always:

`COMPLETE`

---

# 30. Example Routes

## Florida principal, acknowledgment, no witness

`CORE`
→ `IDENTITY`
→ `LOCATION`
→ `WILLINGNESS`
→ `ACK-INDIVIDUAL`
→ `COMPLETE`

## Georgia principal, jurat

`CORE`
→ `IDENTITY`
→ `LOCATION`
→ `OUTSIDE-FL`
→ `WILLINGNESS`
→ `JURAT`
→ `COMPLETE`

## Florida principal with one remote witness

`CORE`
→ `IDENTITY`
→ `LOCATION`
→ `WILLINGNESS`
→ applicable act
→ `REMOTE-WITNESS`
→ `COMPLETE`

## Qualifying §117.285 document with remote witnesses

`CORE`
→ `IDENTITY`
→ `LOCATION`
→ conditional `OUTSIDE-FL`
→ `WILLINGNESS`
→ `117285`
→ `REMOTE-WITNESS × N`
→ applicable act
→ `COMPLETE`

---

# 31. Audit Record

At the end of every attempt, store:

**Session Assistant ID:** unique identifier
**Appointment ID:** linked appointment
**Jurisdiction:** Florida
**Workflow version:** FL-RON-1.0
**Module versions used:** exact list
**Principal(s):** IDs/names
**Notary:** ID/name
**Started:** timestamp
**Completed/stopped:** timestamp
**Outcome:** completed / stopped
**Stop reason:** if applicable
**Session parameters:** snapshot
**Parameter changes during session:** audit history
**Override events:** if any
**RON provider session/reference ID:** when available

Example:

**Workflow:** FL-RON-1.0
**Modules:** FL-CORE-1.0 / FL-IDENTITY-1.0 / FL-LOCATION-1.0 / FL-OUTSIDE-FL-1.0 / FL-JURAT-1.0 / FL-COMPLETE-1.0

---

# 32. Change-Control Rule

Approved script language is stored as versioned configuration/content.

Developers may not silently modify legal script text while making UI changes.

A script change requires:

1. new module version;
2. description of change;
3. statutory/compliance review;
4. approval;
5. effective date.

Historical appointments retain the module versions that were actually used.

---

# 33. Codex Guardrails

Codex should be instructed:

**DO:**

- implement exactly the approved module text;
- implement deterministic routing;
- preserve module/version IDs;
- implement hard stops;
- audit parameter changes;
- support multiple principals/witnesses;
- distinguish statutory, conditional, and Avenseal labels.

**DO NOT:**

- generate new legal language;
- paraphrase approved script copy;
- infer the notarial act from the document title;
- bypass an identity-verification failure;
- introduce a credible-witness fallback for RON identity failure;
- invent foreign-signer requirements;
- mark optional safeguards as Florida statutory requirements;
- let UI convenience override a STOP condition.

---

# 34. Approval Status

Before production release:

- Florida RON legal/compliance review
- RON-provider workflow comparison
- Confirmation of provider identity-proofing implementation
- Confirmation of provider §117.285 screening behavior
- Certificate-field review
- Electronic-journal responsibility review
- Recording/retention responsibility review
- Final approval of every v1.0 script module

After approval:

**FL-RON-1.0 Candidate → FL-RON-1.0 Production**