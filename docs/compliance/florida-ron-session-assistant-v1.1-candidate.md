# Avenseal Florida RON Session Assistant — v1.1 Candidate Specification

**Status:** Candidate for final legal/compliance approval  
**Jurisdiction:** Florida  
**Workflow Version:** FL-RON-1.1  
**Predecessor:** FL-RON-1.0 Candidate  
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

FL-RON-1.0 Candidate remains immutable. FL-RON-1.1 is a new workflow version that reuses unchanged v1.0 modules verbatim where their approved content has not changed.

---

# 2. Avenseal / RON Provider Boundary

Avenseal is the notary's business, workflow, and ceremony-assistance platform.

Avenseal is **not** the RON service provider.

Avenseal does not perform or represent itself as independently performing:

- credential analysis;
- KBA or biometric identity proofing;
- statutory RON audio-video communication;
- statutory audio-video recording storage;
- statutory electronic-journal storage;
- electronic notary signature/seal infrastructure;
- tamper-evident electronic-document technology; or
- statutory RON recording/journal retention.

The RON platform performs provider-controlled RON functions.

The commissioned online notary remains responsible for the notarial act and the determinations assigned to the notary by Florida law.

Avenseal's operational/audit record must remain distinguishable from the statutory RON electronic journal.

---

# 3. Session Assistant Relevance Rule

A configuration input, confirmation, route, safeguard, or completion control belongs in the Session Assistant only if it materially changes:

- the notarial ceremony;
- a statutory prerequisite applicable to the transaction;
- deterministic routing;
- a completion requirement; or
- a STOP/BLOCK outcome.

Do not add Session Assistant controls merely to duplicate provider or notary-business qualification functions that do not change the ceremony.

Accordingly, the Session Assistant does not require confirmations concerning provider account authorization, provider certification, provider E&O, notary bond, notary E&O, RON training, or provider onboarding status.

---

# 4. Compliance Labels

### REQUIRED BY FLORIDA LAW
The step implements or captures a statutory requirement applicable to the session.

### CONDITIONAL FLORIDA REQUIREMENT
The step becomes required only because of a specific session fact.

### AVENSEAL SAFEGUARD
A workflow control or best practice intended to reduce errors, document the notary's decision-making, or improve consistency.

Avenseal must never represent an Avenseal safeguard as statutory language.

---

# 5. Control Types

### BLOCK START
A known prerequisite prevents the guided ceremony from beginning.

### CONDITIONAL ROUTE
A confirmed session fact inserts, removes, or changes an applicable workflow path.

### HARD STOP
The ceremony has begun, but the Session Assistant cannot continue through the current workflow.

### BLOCK COMPLETION
The ceremony has reached final review, but a required completion condition remains unresolved.

A BLOCK START or BLOCK COMPLETION is not automatically a declaration that the underlying transaction is legally invalid.

---

# 6. Prepare Session

The notary confirms the appointment, principals, documents, and exactly one notarial-act selection:

- Acknowledgment — Individual
- Acknowledgment — Representative Capacity
- Oath/Affirmation / Jurat
- Other / unsupported notarial act
- Notarial act not yet established

If **Notarial act not yet established**:

**BLOCK START OF NOTARIAL CEREMONY.**

> The required notarial act has not been established. Avenseal does not select a notarial act for the principal. Obtain appropriate instructions or a completed notarial certificate before proceeding.

If **Other / unsupported notarial act**:

**BLOCK SESSION ASSISTANT CEREMONY.**

> This notarial act is not supported by this version of the Avenseal Florida RON Session Assistant.

Do not state or imply that Florida law prohibits the underlying act.

---

# 7. Special Signing Procedure

If the transaction requires a special signing procedure outside the approved FL-RON-1.1 workflow:

**BLOCK SESSION ASSISTANT CEREMONY.**

> This signing procedure is not supported by this version of the Avenseal Florida RON Session Assistant.

Do not state that the transaction itself is prohibited.

---

# 8. Notary Disqualification Gate

## Notary eligibility for this transaction

> Before starting the ceremony, confirm that you are not prohibited from performing this notarization under Florida law.

Required confirmation:

**☐ I confirm that no prohibited family relationship or disqualifying financial interest/party status prevents me from performing this notarization.**

Secondary notary-only guidance:

> Florida prohibits notarizing a signature for your spouse, son, daughter, mother, or father. Florida also prohibits notarizing when you have a disqualifying financial interest in or are a party to the underlying transaction, subject to statutory exceptions.

**Reference:** Fla. Stat. §117.107(11)-(12).

If the notary cannot confirm: **BLOCK START.**

Avenseal does not independently determine whether a statutory exception applies.

Audit semantics: `notaryConfirmedNoApplicableDisqualification = true`.

---

# 9. Principal Configuration

For each principal:

- Full name
- Current physical location
- Florida / Outside Florida
- Identity method: Personally known / RON identity verification
- Individual or representative capacity
- Signing document(s)

For representative acknowledgment also require representative capacity and represented person/entity.

Record the notary's physical location:
- State: Florida
- County

If the notary is not physically located in Florida:

**BLOCK START — ONLINE NOTARIZATION MAY NOT PROCEED UNDER THIS FLORIDA ONLINE-NOTARY WORKFLOW.**

---

# 10. Witness Configuration

Select no witnesses, physical witnesses, remote witnesses, or a combination.

For each witness record:
- full name;
- physical or remote;
- current physical location;
- identity verification status if remote.

For remote witnesses also confirm U.S./territory residency and current U.S./territory physical location.

---

# 11. §117.285 Configuration

Ask whether the record falls within Fla. Stat. §117.285(5), with the same reference categories used in v1.0:

- will;
- qualifying revocable trust with testamentary aspects;
- health-care advance directive;
- specified succession agreement;
- specified waiver of spousal rights; or
- qualifying power of attorney.

Then ask:

**Will fewer than two witnesses be physically present with the principal?**

If both answers are Yes, activate `FL-117285 v1.1`.

---

# 12. Core Routing

Preflight:
`SUPPORTED ACT → SUPPORTED SIGNING PROCEDURE → NOTARY DISQUALIFICATION GATE → CONFIGURATION`

Successful ceremony:
`FL-CORE → FL-IDENTITY → FL-LOCATION → conditional modules → FL-WILLINGNESS → witness/§117.285 routing → exactly one supported notarial-act module → FL-COMPLETE`

Multiple principals retain independent principal-specific requirements.

---

# 13. FL-CORE v1.0

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

# 14. FL-IDENTITY v1.1

**Classification:** Required by Florida law

## READ ALOUD

> Please state your full legal name for the recording.

Record name.

## Identity Method A — Personally Known

Notary confirms:

**I personally know this principal with sufficient certainty to establish identity.**

## Identity Method B — RON Verification

The notary uses the RON platform to complete and observe the required provider-controlled identity-verification procedures.

Avenseal does **not** represent provider-controlled results as independently received or verified unless a future reviewed integration actually provides them.

Display:

## Confirm RON identity verification

Confirm from the RON platform that the required identity-verification procedures were successfully completed.

Required confirmations, as applicable:

- Credential presentation completed.
- Credential analysis passed.
- Identity proofing passed.

Then require:

**☐ Identity satisfactorily established.**

If a required result fails, is unavailable when required, cannot be confirmed, or the notary cannot satisfactorily establish identity:

`FL-STOP-IDENTITY`

Avenseal must **not offer credible witnesses as a substitute for failed RON identity verification**.

When Avenseal has no provider API evidence, store provider-observed results as notary confirmations rather than independently verified provider facts.

---
# 15. FL-LOCATION v1.0

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

# 16. FL-OUTSIDE-FL v1.0

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

# 17. FL-WILLINGNESS v1.0

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

# 18. Acknowledgment Language Prerequisite

Activate **only** when the selected notarial act is:

- Acknowledgment — Individual; or
- Acknowledgment — Representative Capacity.

Do not activate this control solely because the act is a jurat.

## Language requirement

**Does the principal speak or understand the English language?**

Options:
- Yes
- No
- Unable to determine

### Yes

Continue to the applicable acknowledgment module.

### No

## Translation required

> Before taking the acknowledgment, confirm that the nature and effect of the instrument has been translated into a language the principal understands.

Required confirmation:

**☐ I confirm the required translation has been provided.**

If confirmed: continue.

If not confirmed:

**BLOCK ACKNOWLEDGMENT.**

> Do not take the acknowledgment. Florida law requires the nature and effect of the instrument to be translated into a language the principal understands before the acknowledgment may be taken.

### Unable to determine

**BLOCK ACKNOWLEDGMENT** until the notary resolves the prerequisite.

Do not require through this control:
- translator identity;
- translator credentials;
- translator certification; or
- confirmation that every word of the document was translated.

Avenseal does not provide the translation or determine its adequacy.

---

# 19. FL-ACK-INDIVIDUAL v1.0

**Classification:** Notarial-act module

Use only when the notary has established that an acknowledgment in an individual capacity is required.

## READ ALOUD

> Do you acknowledge that this is your signature and that you executed this document voluntarily for the purposes stated in it?

Required affirmative response.

The principal does not need to take an oath for an acknowledgment.

Proceed to applicable signing/witness steps and completion.

---

# 20. FL-ACK-REPRESENTATIVE v1.0

Use when an acknowledgment is being taken in representative capacity.

Capture:

- principal name;
- representative capacity;
- represented person/entity.

## READ ALOUD

> Do you acknowledge that you executed this document in your stated representative capacity for the purposes stated in the document?

Required affirmative response.

---

# 21. FL-JURAT v1.0

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

# 22. FL-PHYSICAL-WITNESS v1.0

Activate for each witness physically present with the principal.

## READ ALOUD TO WITNESS

> Please state your full name and current address for the recording.

Record response.

The witness must observe the principal signing.

The witness must be included in the recording during the required witnessing activity.

---

# 23. FL-REMOTE-WITNESS v1.0

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

### Additional routing requirement

The principal and required remote witnesses must remain present through compliant audio-video communication when the signature is taken.

If compliant presence is temporarily lost:

**BLOCK SIGNING until restored.**

If compliant audio-video communication cannot be restored:

`FL-STOP-TECH`

Failure of remote-witness residency/location requirements terminates the remote-witnessing workflow; it does not automatically characterize every possible form of the underlying transaction as prohibited.

---

# 24. FL-117285 v1.1

**Classification:** Special conditional Florida requirement

Activate only when:

1. the instrument is within §117.285(5); and
2. fewer than two witnesses are physically present with the principal.

## RON PROVIDER PRE-SCREENING

Before remote witnessing is facilitated, the RON provider must complete the applicable statutory screening.

Avenseal does not claim to have independently performed the provider screening.

The notary confirms that the required provider screening was completed.

The screening addresses substantially:

1. Whether the principal is under the influence of drugs or alcohol impairing decision-making.
2. Whether a physical or mental condition or long-term disability impairs normal activities of daily living.
3. Whether the principal requires assistance with daily care.

## REQUIRED WRITTEN NOTICE

After submission of the screening answers, the required statutory written notice must be provided through the applicable RON-provider process.

Avenseal records the notary's confirmation that the required step occurred; Avenseal does not represent itself as the provider of the statutory screening infrastructure.

## EVALUATE SCREENING RESULT

If the screening result prevents remote witnessing:

**REMOTE WITNESSING NOT PERMITTED FOR THIS WORKFLOW**

Physical witnesses are required for the applicable witnessing procedure.

Do not automatically state:

**NOTARIZATION PROHIBITED.**

If physical witnesses cannot satisfy the current session requirements, the remote-witnessing attempt cannot continue.

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

# 25. FL-MULTI-PRINCIPAL v1.0

When more than one principal participates, repeat independently for each:

- identity confirmation;
- physical location;
- outside-Florida confirmation if applicable;
- willingness;
- applicable oath/affirmation or acknowledgment;
- signature declaration;
- signing event.

In FL-RON-1.1, also complete independently for each principal when applicable:

- acknowledgment-language prerequisite;
- representative-capacity data; and
- principal-specific witness or §117.285 requirements.

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

# 26. FL-STOP-IDENTITY v1.0

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

# 27. FL-STOP-TECH v1.0

Trigger when the notary determines audio-video communication is inadequate.

## READ ALOUD, IF COMMUNICATION PERMITS

> The audio-video connection is no longer sufficient for me to continue the online notarization. I am stopping the notarization at this time. A new session may begin once a compliant audio-video connection is available.

Outcome:

**Stopped — Audio/Video Failure**

Do not describe the previous transaction as automatically “legally invalid” or “legally compromised.”

---

# 28. FL-STOP-WILLINGNESS v1.0

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

# 29. FL-STOP-CAPACITY v1.0

Florida prohibits notarization when it appears that the person is mentally incapable of understanding the nature and effect of the document at the time of notarization.

When the notary reaches that determination:

## READ ALOUD

> I am unable to complete this notarization at this time, so I am ending the notarial session.

Outcome:

**Stopped — Notary Unable to Proceed**

The customer-facing record should not unnecessarily publish a medical or diagnostic characterization.

---

# 30. FL-STOP-INCOMPLETE-DOCUMENT v1.0

If the document is blank or incomplete in a manner prohibited by Florida law:

## DISPLAY

**DO NOT NOTARIZE**

> The document cannot be notarized in its current incomplete or blank state.

Allow:

**Return to Customer / Correct Document**

Do not allow completion of the notarial act until the issue is resolved.

---
# 31. FL-COMPLETE v1.1

Before completion, display:

## Final Compliance Review

For each applicable principal:

- Identity satisfactorily established.
- Physical location captured.
- Outside-Florida confirmation obtained if required.
- Knowingly and voluntarily signed.
- Applicable notarial ceremony completed.
- Signature witnessed as required.
- Acknowledgment-language prerequisite satisfied if applicable.
- Representative capacity and represented person/entity captured if applicable.

Session-level:

- Recording remained active throughout the online notarization.
- Document/general record identified.
- Notarial act identified at commencement.
- Required witnesses completed.
- §117.285 procedure completed if applicable.
- Required indication of remote-witness presence reflected in the electronic record if applicable.
- Correct certificate completed.
- Required certificate fields complete.
- Representative capacity/represented party reflected in the certificate when applicable.
- Online notarization appearance reflected in certificate.
- Venue reflects the notary's Florida location.
- Identification method recorded.
- Electronic notary signature applied.
- Electronic seal applied.
- Required RON electronic-journal step completed/confirmed.

A known unresolved required item:

**BLOCKS COMPLETION.**

Do not create a separate STOP module merely because a correctable completion item is unresolved.

## READ ALOUD

> The notarial act is complete. Your electronically notarized document will be made available through the applicable delivery process.
>
> This concludes today's remote online notarization session. Thank you.

Then end recording.

---

# 32. Journal Data and Responsibility Boundary

The workflow should capture or confirm, where applicable to Avenseal's own operational record:

- date;
- time;
- type of notarial act;
- record type/title/description;
- principal name;
- principal address;
- evidence-of-identity method;
- credential type where applicable;
- notary confirmation of credential-analysis result when required;
- notary confirmation of identity-proofing result when required;
- fee charged, if any.

Avenseal must distinguish:

**Avenseal appointment/audit data**

from

**the statutory RON electronic journal maintained through the applicable notary/provider infrastructure.**

Avenseal's operational record is **not** the Florida statutory RON electronic journal.

Avenseal does not duplicate the statutory journal merely because it lacks provider API access.

Where completion requires confirmation of a journal/provider-controlled step, the commissioned notary confirms that the required step occurred in the applicable RON workflow.

---

# 33. Certificate Completion Requirements

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

When applicable, also verify:

- representative capacity;
- represented person/entity; and
- required remote-witness indication in the electronic record.

Known required fields that are missing must prevent Session Assistant completion until appropriately resolved.

The system may validate obvious missing fields.

It must not alter a completed notarial certificate after the notarization has been completed.

---

# 34. Recording Requirements and Boundary

The workflow should remind the notary that the RON recording must capture:

- appearance of principal and required witnesses;
- identity confirmation;
- general identification of records;
- identification of the notarial act at commencement;
- declaration that the signature is knowingly and voluntarily made;
- actions and spoken words throughout the online notarization; and
- signing of the records.

The RON provider's recording must remain uninterrupted and unedited.

Avenseal does not create or retain the statutory RON audio-video recording.

The Session Assistant guides the notary through the required ceremony while the applicable RON platform's recording is active.

---

# 35. Deterministic Routing Matrix

## Preflight

`SUPPORTED ACT`
→ `SUPPORTED SIGNING PROCEDURE`
→ `NOTARY DISQUALIFICATION`
→ `CONFIGURATION`

## Base

Every supported session:

`CORE → IDENTITY → LOCATION → WILLINGNESS`

## Principal outside Florida

Insert `OUTSIDE-FL` after location.

## Acknowledgment — Individual

`ACK-LANGUAGE-PREREQUISITE → ACK-INDIVIDUAL`

## Acknowledgment — Representative

`ACK-LANGUAGE-PREREQUISITE → ACK-REPRESENTATIVE`

## Jurat

`JURAT`

Do not insert the acknowledgment-language prerequisite solely because the act is a jurat.

## Physical witness

Add `PHYSICAL-WITNESS` for each applicable witness.

## Remote witness

Add `REMOTE-WITNESS` for each applicable witness.

## §117.285 qualifying instrument + fewer than two physical witnesses

Add `117285-1.1`.

## Multiple principals

Wrap principal-specific requirements in `MULTI-PRINCIPAL`.

## Successful ending

Always `COMPLETE-1.1`.

---

# 36. Example Routes

## Florida principal, acknowledgment, no witness

`PRECHECKS`
→ `CORE-1.0`
→ `IDENTITY-1.1`
→ `LOCATION-1.0`
→ `WILLINGNESS-1.0`
→ `ACK-LANGUAGE`
→ `ACK-INDIVIDUAL-1.0`
→ `COMPLETE-1.1`

## Florida principal, jurat

`PRECHECKS`
→ `CORE-1.0`
→ `IDENTITY-1.1`
→ `LOCATION-1.0`
→ `WILLINGNESS-1.0`
→ `JURAT-1.0`
→ `COMPLETE-1.1`

## Outside-Florida principal, acknowledgment

`PRECHECKS`
→ `CORE-1.0`
→ `IDENTITY-1.1`
→ `LOCATION-1.0`
→ `OUTSIDE-FL-1.0`
→ `WILLINGNESS-1.0`
→ `ACK-LANGUAGE`
→ applicable acknowledgment module
→ `COMPLETE-1.1`

## Principal does not speak/understand English, acknowledgment

`ACK-LANGUAGE`
→ translation confirmed
→ applicable acknowledgment module

or:

`ACK-LANGUAGE`
→ translation not confirmed
→ **BLOCK ACKNOWLEDGMENT**

## Florida principal with one remote witness

`PRECHECKS`
→ `CORE-1.0`
→ `IDENTITY-1.1`
→ `LOCATION-1.0`
→ `WILLINGNESS-1.0`
→ applicable witness routing
→ applicable act
→ `COMPLETE-1.1`

## Qualifying §117.285 document with remote witnesses

`PRECHECKS`
→ base ceremony
→ `117285-1.1`
→ applicable witness routing
→ applicable act
→ `COMPLETE-1.1`

## §117.285 screening prevents remote witnessing

`117285-1.1`
→ **REMOTE WITNESSING UNAVAILABLE**
→ physical-witness route if requirements can be satisfied

Otherwise the current attempt cannot continue through the remote-witness workflow.

---

# 37. Audit Record

At the end of every attempt, store:

**Session Assistant ID:** unique identifier  
**Appointment ID:** linked appointment  
**Jurisdiction:** Florida  
**Workflow version:** FL-RON-1.1  
**Module versions used:** exact list  
**Principal(s):** IDs/names  
**Notary:** ID/name  
**Started:** timestamp  
**Completed/stopped/blocked:** timestamp  
**Outcome:** completed / stopped / blocked  
**Stop/block reason:** if applicable  
**Session parameters:** snapshot  
**Parameter changes during session:** audit history  
**Override events:** if any are permitted by an explicitly approved workflow  
**RON provider session/reference ID:** when manually available/relevant

### Provider-controlled facts

When a fact comes solely from the notary observing the RON provider, store the **notary's confirmation**.

For example:

`notaryConfirmedCredentialAnalysisPassed`

rather than an unqualified:

`credentialAnalysisPassed`

unless Avenseal actually receives independently trustworthy provider data.

The same rule applies to identity proofing, journal completion, recording/provider state, and similar provider-controlled facts.

---

# 38. Module Versions

| Module | FL-RON-1.1 version |
|---|---:|
| FL-CORE | 1.0 |
| FL-IDENTITY | 1.1 |
| FL-LOCATION | 1.0 |
| FL-OUTSIDE-FL | 1.0 |
| FL-WILLINGNESS | 1.0 |
| FL-ACK-INDIVIDUAL | 1.0 |
| FL-ACK-REPRESENTATIVE | 1.0 |
| FL-JURAT | 1.0 |
| FL-PHYSICAL-WITNESS | 1.0 |
| FL-REMOTE-WITNESS | 1.0 |
| FL-117285 | 1.1 |
| FL-MULTI-PRINCIPAL | 1.0 |
| Existing STOP modules | 1.0 |
| FL-COMPLETE | 1.1 |

The acknowledgment-language and notary-disqualification controls are deterministic workflow prerequisites rather than new READ ALOUD modules.

---

# 39. Change-Control Rule

Approved script language is stored as versioned configuration/content.

Developers may not silently modify legal script text while making UI changes.

A script change requires:

1. new module version;
2. description of change;
3. statutory/compliance review;
4. approval;
5. effective date.

Historical appointments retain the workflow and module versions that were actually used.

FL-RON-1.0 Candidate remains immutable.

---

# 40. Codex Guardrails

## DO

- implement exactly the approved module text;
- implement deterministic routing;
- preserve module/version IDs;
- preserve reused v1.0 text verbatim;
- implement BLOCK START, CONDITIONAL ROUTE, HARD STOP, and BLOCK COMPLETION distinctly;
- audit parameter changes;
- support multiple principals/witnesses;
- distinguish statutory, conditional, and Avenseal labels;
- record provider-derived information as notary confirmations when Avenseal has no provider API evidence;
- preserve Candidate-only behavior.

## DO NOT

- generate new legal language;
- paraphrase approved script copy;
- infer the notarial act from the document title;
- bypass an identity-verification failure;
- introduce a credible-witness fallback for RON identity failure;
- invent foreign-signer requirements;
- mark optional safeguards as Florida statutory requirements;
- let UI convenience override a STOP/BLOCK condition;
- imply an unsupported Avenseal act is illegal;
- make Avenseal the RON provider;
- add BlueNotary-specific API dependencies;
- claim Avenseal independently verified provider results when it did not;
- duplicate statutory recording/journal infrastructure;
- automatically determine statutory disqualification;
- automatically determine translation adequacy;
- apply the acknowledgment-language prerequisite universally to jurats;
- promote Candidate to Production.

---

# 41. Required Acceptance Tests

FL-RON-1.1 must cover at minimum:

1. Florida individual acknowledgment.
2. Florida jurat.
3. Representative acknowledgment.
4. Outside-Florida principal.
5. Outside-Florida consent refusal.
6. Personally-known identity route.
7. RON identity confirmed by notary.
8. Credential analysis failure/unconfirmed.
9. Identity proofing failure/unconfirmed.
10. Audio-video failure.
11. Audio-video loss during signing.
12. Incomplete/blank prohibited document.
13. Unsupported notarial act.
14. Notarial act not established.
15. Unsupported special signing procedure.
16. Notary cannot confirm absence of applicable disqualification.
17. English-understood acknowledgment.
18. Non-English acknowledgment + translation confirmed.
19. Non-English acknowledgment + translation not confirmed.
20. Jurat does not receive the acknowledgment-only language gate.
21. Physical witness.
22. Remote witness.
23. Remote witness location/residency failure.
24. §117.285 procedure with remote witnessing permitted.
25. §117.285 result requiring physical witnesses.
26. Missing remote-witness indication blocks completion.
27. Missing certificate requirement blocks completion.
28. Missing representative certificate information blocks completion.
29. Required journal step unconfirmed blocks completion.
30. Multiple principals remain independently tracked.
31. Provider-derived statuses are represented as notary confirmations.
32. FL-RON-1.0 remains unchanged.
33. Candidate cannot enter Production state.

---

# 42. Candidate Promotion Gate

`FL-RON-1.1` remains **Candidate-only**.

Before Production:

- final Florida legal/compliance review of changed 1.1 requirements;
- independent recheck of the §117.285 sequence;
- approval of the disqualification control;
- approval of the acknowledgment-language control;
- approval of `FL-IDENTITY v1.1`;
- approval of `FL-117285 v1.1`;
- approval of `FL-COMPLETE v1.1`;
- certificate/completion review;
- acceptance-test matrix passes;
- immutable FL-RON-1.0 history confirmed;
- explicit Production snapshot/version created;
- explicit effective date approved.

There must be **no automatic Candidate → Production promotion**.

---

# 43. Candidate Approval Status

This specification is a **Candidate** and is not approved for production notarizations.

It is ready for controlled implementation review subject to the Candidate Promotion Gate above.

FL-RON-1.0 Candidate remains preserved as the historical predecessor.
