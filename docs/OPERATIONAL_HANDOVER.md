# CrimeGraph Operational Handover

**Repository:** `TangoSplicer/CrimeGraph`

**Mainline merge:** Pull request [#1](https://github.com/TangoSplicer/CrimeGraph/pull/1)

**Scope:** device-bound protected storage, secure evidence media, evidence derivative and annotation ledger, controlled forensic dossiers and disclosure records, analyst-controlled quality review and saved local graph queries, case playbooks, local lead registers, secure operator lifecycle management, structured field work queues and evidence intake, truthful device assurance, and release assurance.

> CrimeGraph remains an **offline, analyst-controlled case-intelligence application**. It records attributable observations and evidence provenance; it does not perform automated person-level risk scoring or opaque predictions.

## Operating model

| Role | Primary operating responsibility | Important boundary |
|---|---|---|
| Administrator | Provisions operators; audits lifecycle actions; performs audited emergency wipe; manages system configuration, markings, and controlled dissemination. | PIN reset, role change, disablement, reinstatement, and wipe require high-risk reauthentication. |
| Supervisor | Reviews field submissions, approves observations, or returns them with a required correction note; may assign active field operators, apply markings, prepare controlled dossiers, and inspect device assurance. | Review, marking, tasking, and dissemination are explicit and audit-recorded; none is an automated confidence judgment. |
| Analyst | Creates, edits, links, marks, and exports permitted intelligence records; may assign active field operators and prepare authorized dossiers. | Cannot review field submissions, manage trusted pairing, or view device assurance. |
| Field operator | Captures and submits observations and evidence only for locally assigned active cases; can correct only records returned to that operator, complete only their own assigned task cards, and record a locally sourced lead. | New submissions are marked **pending review**; case creation, import, marking, assignment, lead disposition/promotion, dossier preparation, and broad editing are not granted. |
| Read-only operator | Views permitted local intelligence. | Cannot create, alter, export, review, pair, or wipe. |

## Core field-to-supervisor workflow

A field operator creates an intelligence node through the normal capture flow. The record is stored with the submitting operator, submission time, and `pending` review state. When evidence media is captured, it is stored as an encrypted `.cgm` envelope and the evidence provenance record contains its SHA-256 digest.

A supervisor opens **REVIEW** in the bottom navigation. The inbox presents only pending records, with their case, submitter, time, and an inspection route into the graph workspace. The supervisor may approve a record, optionally explaining the rationale, or return it. A return requires a specific correction comment. Each decision creates a hash-linked audit entry.

A field operator sees pending, approved, or returned state in the graph workspace. A returned record displays the supervisor’s correction feedback. Only the originating field operator can use **Correct & resubmit**; this clears the previous decision state and returns the record to `pending` for a fresh supervisory decision.

## Operator lifecycle and field assignment

An administrator opens **SETTINGS** and uses **Operator lifecycle** to list locally provisioned non-administrator accounts. Disablement and reinstatement require a reason; PIN resets and role changes revoke biometric sign-in. Every lifecycle action requires high-risk confirmation and creates a hash-linked audit entry. A disabled account cannot use PIN or biometric sign-in.

An administrator, supervisor, or analyst uses **ASSIGN FIELD** on an active operation in **HOME**. They select an active field operator and may add an assignment note. The field operator’s HOME screen then becomes a local work queue showing only active assigned operations and their notes. Removing an assignment requires a reason, is audited, and prevents that field account from loading the operation. Assignments remain local to the encrypted device; they do not transfer case intelligence.

## Evidence derivative ledger and saved local queries

The **Derivative and annotation ledger** appears within an evidence record’s detail panel. Administrators, supervisors, and analysts can add an operator-authored `annotation`, `transcript excerpt`, `review note`, or `redaction instruction`. Each record is tied to the parent evidence node, the stated provenance fingerprint, and source attachment digest; it receives a canonical SHA-256 record digest and a hash-ledger audit entry. It **does not modify** the original evidence attachment, evidence provenance, or source digest. A redaction instruction is only an auditable instruction; it does not render, transform, or automatically redact media.

Forensic dossiers are now schema version 2 and include the derivative ledger in signed content. Dossier export may omit derivative annotation text under the `derivative_annotations` redaction profile while retaining an explicit redacted record. Verified legacy schema-version-1 dossiers remain accepted. On verified v2 import, a ledger record is admitted only when it maps to an accepted imported evidence item; it retains the stated source-provenance fingerprint and receives a new local record digest.

The **Saved local queries** workbench is available from **Analysis** to administrators, supervisors, and analysts. A saved query contains an explicit name, optional text filter, optional entity-type filters, and an explicit choice to include directly connected relationships. Each run displays why every result matched—such as metadata containing the text filter or a relationship directly connected to a matched entity. Results are local and ephemeral; the app saves the filters, not any inferred conclusion, score, or automatic decision.

## Case playbook and local lead register

The **Case playbook** is available in the **Analysis** panel to administrators, supervisors, and analysts. It records optional case-scoped milestones with an objective, category, accountable role, due window, blocker note, completion note, linked local objects, and hash-ledger state transition. A blocked or overdue milestone is a work-state cue only; it must never be read as a personnel-performance score, case-priority prediction, or likelihood-of-outcome assessment.

The **Local lead register** preserves an incoming follow-up opportunity with its stated source type, source reference, received time, sensitivity marking, factual summary, and disposition. Field operators may create a lead only in a locally assigned case. Administrators, supervisors, and analysts may review, action, close, or deliberately promote a lead. Promotion creates a linked intelligence node in the same local transaction and leaves the lead record intact; it does not validate the source or convert an observation into a legal conclusion.

## Controlled dossiers, markings, and local analysis

The **Analysis** panel provides an explainable local search and quality workbench. It identifies records with missing observed time, incomplete custody notes, unlinked notes, isolated graph entities, possible duplicate labels, and pending supervisory review. These are visible documentation and graph-structure cues, not predictions, scoring, or statements about a person’s risk or relevance. The analyst must inspect and decide every outcome.

Administrators, supervisors, and analysts may apply controlled data markings to a case, node, note, or evidence record. A forensic dossier is a user-mediated export: the operator states a purpose and recipient, selects the permitted redaction profile, and the app records a canonical SHA-256 manifest, signature state, verification result, and disclosure-register entry. Import verifies the dossier before it is admitted. A failed verification, altered manifest, or invalid signature must be treated as a rejection, not a warning to override.

## Field task cards and guided evidence intake

The **ASSIGN FIELD** sheet includes a structured task card for an already active field-case assignment. Managers provide an objective, optional checklist, contextual or safety note, and optional due window. The assigned field operator opens **Tasks** from the local operation card and may complete the task with a handoff note or return it with an inability reason. The task and state transition are entered in the local audit ledger; tasks do not send data to another device.

When creating **Evidence**, operators may select a guided class for image, video, document, physical exhibit, message, device, location observation, or witness material. The template adds editable metadata prompts and provenance reminders. It does not populate acquisition facts, chain of custody, verification status, source identity, or legal conclusions. The protected camera workflow remains the approved route for new field photos and binds the generated SHA-256 digest to the provenance record.

## Device assurance

Administrators and supervisors can open **SETTINGS → Device assurance**. The panel is read-only and refreshes a local snapshot of the installed app version, Android version, encrypted-database marker, device-storage-secret presence, identity and storage-wrap key state, Android-reported key security level, backup-exclusion flag, biometric readiness, free storage, protected-media count, last database open, and freshly verified audit-chain state.

> **Important:** A reported key level of `hardware-backed-level-not-exposed` means the Android version did not expose a TEE-versus-StrongBox distinction. It is not evidence of StrongBox. Browser preview deliberately reports native attestation fields as unavailable rather than secure.

## Security operations

| Capability | Operational behavior | Audit / assurance point |
|---|---|---|
| Local database | Android devices use an Android Keystore-wrapped 32-byte secret for encrypted SQLite. Browser preview storage is explicitly not equivalent to native protected storage. | A bridge response must be an exact base64-encoded 32-byte value. |
| Evidence attachments | AES-GCM `CGM1` envelopes are written to app-private storage; plaintext legacy attachments are migrated lazily on case load. | Migration creates `MIGRATE_EVIDENCE_MEDIA` audit activity. |
| Device pairing | Pairing uses a device-held P-256 identity, signed expiring invitation, and short-authentication-code comparison. | Peer verification and revocation require high-risk reauthentication. |
| Session posture | The app locks after five minutes of inactivity and locks when backgrounded unless an export action intentionally backgrounds it. | Re-authentication uses biometrics when available; otherwise the current credential. |
| Secure wipe | Attachment paths are deleted where possible, encrypted local storage is removed, and the device-held wrapping secret is destroyed. | The cryptographic key destruction ensures remaining encrypted media cannot be reopened with the destroyed device secret. |
| Backup posture | Android backup and data transfer are disabled through the manifest and extraction rules. | Verify this remains true after any future manifest merge and compare the installed-app assurance value to approved device-management evidence. |
| Device assurance | Admins and supervisors can refresh an installed-device posture snapshot without accessing case contents. | The view must report unavailable or OS-undifferentiated capabilities explicitly; never infer StrongBox or TEE. |
| Controlled dossier | Dossiers are user-mediated files with manifest, signature/verification state, redaction profile, stated purpose, recipient description, and disclosure record. | Treat any failed import verification as a hard stop and retain the source file for approved incident handling. |
| Case playbook | Managers record bounded local milestones, blockers, completion notes, and accountable role. | Milestone cues record work state only. Do not use them to rank personnel, forecast case outcomes, or generate automatic task escalation. |
| Local lead register | Leads retain source, sensitivity, status, disposition, and deliberate promotion history. | A promoted lead remains a source-bound local record; promotion must be audited and is never an automatic source-validation decision. |
| Evidence derivative ledger | Operator-authored annotations and instructions retain a parent evidence reference, stated provenance fingerprint, source digest, canonical record digest, and audit event. | Treat entries as analyst context, not source evidence. Do not alter the original media or imply that a redaction instruction performed a redaction. |
| Saved local queries | Only explicit text, type, and relationship filters are saved; every run explains why a record matched. | Do not add opaque ranking, automatic entity merge, person-level scoring, external lookup, or background query transfer. |

## Required routine checks

| Frequency | Owner | Check | Expected evidence |
|---|---|---|---|
| Every pull request and mainline push | CI | Install locked dependencies, run `npm run verify`, production audit, Android synchronization, and debug APK build. | A passing **CrimeGraph Android Build** workflow and APK artifact. |
| Before signed release | Release owner | Complete [`DEVICE_ACCEPTANCE.md`](./DEVICE_ACCEPTANCE.md) and follow [`RELEASE_SIGNING.md`](./RELEASE_SIGNING.md). | Device acceptance record, artifact digest, certificate fingerprint, approval reference, and exceptions. |
| After supervisory workflow exercise | Supervisor or auditor | Open the audit ledger and verify the hash chain. | Valid chain plus decision / correction entries. |
| Before any authorized disclosure | Analyst, supervisor, or administrator | Verify the dossier manifest, redaction profile, stated purpose, recipient, authorization reference where applicable, and disclosure-register record. | Verified dossier and disclosure-register entry; no background or mesh transfer. |
| After a case-planning or lead-review exercise | Supervisor or auditor | Verify playbook and lead lifecycle entries in the audit ledger, including any promotion into intelligence. | Valid chain plus milestone, disposition, and promotion entries; source remains identifiable in the promoted node metadata. |
| Before a derivative or saved-query workflow is relied upon | Analyst or supervisor | Verify the parent evidence provenance, ledger record digest, query filters, displayed result reasons, and associated audit entries. | Original media remains unchanged; the evidence-linked ledger and query explanation remain locally traceable. |
| After application upgrade | Technical owner | Verify Android backup controls, native plugin registry, key creation/reopen, encrypted evidence preview, device assurance output, and legacy attachment migration. | Release-readiness record updated with results. |

## Release commands

```bash
npm ci
npm run verify
npm audit --omit=dev --audit-level=high
npm run sync:android
cd android && ./gradlew assembleDebug --no-daemon
```

Continuous integration pins the Capacitor 8 release toolchain to Node 22, Java 21, Android API 36, and Gradle 8.14.3. It uses Node 24-compatible workflow actions and uploads a diagnostic debug APK artifact. Capacitor’s upgrade documentation defines this Android baseline.[1]

## Guardrails for future changes

New collaboration transports, including Bluetooth or mesh case transfer, must remain disabled until a complete authenticated secure-session protocol has been designed, threat-modelled, implemented, and independently reviewed. Do not make review status, quality findings, task status, lead status, milestone state, derivative record, saved query, or markings into an automated decision or a proxy for person-level assessment. Any future schema change must remain additive or include a tested encrypted-storage migration path. Do not alter templates to pre-fill evidential conclusions, convert a redaction instruction into automatic media editing, or change device assurance wording to infer hardware capability that Android does not report.

## References

[1]: https://capacitorjs.com/docs/updating/8-0 "Capacitor 8 migration guide"
