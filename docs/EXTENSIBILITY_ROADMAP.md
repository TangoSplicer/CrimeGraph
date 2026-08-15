# CrimeGraph Extensibility Roadmap

**Purpose:** This roadmap identifies the next capabilities that can make CrimeGraph materially more useful to field operators, analysts, supervisors, and release owners while preserving its defining model: **offline-first, evidence-led, explainable, and role-governed case intelligence**.

> CrimeGraph should improve the quality, traceability, and usability of human investigation. It should not assign person-level risk scores, make opaque predictions, silently transfer case information, or use review status as a proxy for truth.

## Current foundation

CrimeGraph already has a strong extension base: encrypted SQLite with a device-bound secret, encrypted media envelopes, structured provenance, a hash-linked audit ledger, role-based permissions, high-risk reauthentication, operator lifecycle controls, local field work queues, and supervisor review. Its current graph, timeline, evidence, case-assignment, and audit structures support feature growth without replacing the core architecture.

Android Keystore keys can be non-exportable and can restrict authorized use, temporal validity, and recent user authentication. Those capabilities support richer local assurance features, but the application must report actual device capability rather than assume StrongBox or hardware-backed protection is universally available.[1] NIST’s digital-evidence preservation guidance reinforces the value of explicit handling, integrity, preservation, and access controls.[2]

## Prioritization method

Each candidate is scored out of 100 using weighted operational value (35%), architectural fit (25%), security/defensibility contribution (20%), delivery readiness (10%), and dependency readiness (10%). Scores are decision aids, not promises of exact effort.

| Rank | Extension | Score | Why it belongs here |
|---:|---|---:|---|
| 1 | Forensic export dossier and verification receipt | 98 | Converts current provenance and audit records into a defensible, reviewable package without adding live transfer. |
| 2 | Data markings, controlled redaction, and disclosure register | 94 | Extends existing classification into need-to-know handling and makes exports safer. |
| 3 | Explainable case-quality and chronology workbench | 93 | Builds directly on graph insights to surface gaps, inconsistencies, and review obligations without scoring people. |
| 4 | Field assignment task cards and completion handoff | 89 | Extends the new field queue into clear, attributable operational tasking. |
| 5 | Hardware-security and device-health posture dashboard | 84 | Makes the encryption and release assurances observable to authorized operators. |
| 6 | Structured evidence intake templates and barcode/QR labels | 83 | Reduces intake ambiguity and links physical exhibit labels to the existing provenance record. |
| 7 | Local search, saved queries, and case bookmarks | 83 | Improves analyst speed with low security risk and no new transport. |
| 8 | Offline geospatial evidence layer | 72 | Adds situational value, but needs privacy controls, offline tile management, and careful map-data licensing. |
| 9 | Secure collaboration-session protocol | 58 | Important long-term, but deliberately deferred until threat modelling, key agreement, replay protection, authorization, and independent review are complete. |

## Recommended next program

### 1. Forensic export dossier and verification receipt

This is the highest-value next extension. A case export should become a **forensic dossier** that includes a signed manifest, case metadata, graph and timeline data, evidence provenance, attachment digests, audit-chain verification outcome, classification markings, exporter identity, and export timestamp. A companion verification screen should validate every manifest digest and clearly report missing or modified objects.

The user-mediated encrypted package mechanism already exists, so this work should strengthen rather than replace it. The first release should remain an explicit file export/import action; it must not activate Bluetooth, mesh, cloud synchronization, or background transfer. CASE’s focus on standardized observables, chain of custody, chain of evidence, and data markings makes it a useful future mapping reference for the digital-evidence portion of the dossier.[3]

| Deliverable | Design constraint |
|---|---|
| Manifest v2 | Include schema version, package digest, per-object digests, provenance fingerprints, audit verification, and explicit exporter metadata. |
| Device-signed receipt | Sign the manifest with the existing device identity; record verification result and signer fingerprint. |
| Verification screen | Show pass, warning, or fail per object; never silently import a verification failure. |
| Export policy | Require high-risk confirmation for restricted classifications and a user-entered disclosure purpose. |
| Audit record | Log dossier generation, verification, and any rejected import without logging package secrets. |

### 2. Data markings, controlled redaction, and disclosure register

CrimeGraph currently stores a case classification. Extend it to explicit markings on cases, nodes, evidence provenance, notes, and export fields. Examples include `OFFICIAL`, `SENSITIVE`, `PERSONAL_DATA`, `LEGAL_PRIVILEGE`, and organization-defined caveats. The redaction workflow should create an export projection, not mutate the original local record.

Every redaction should identify the policy basis, actor, timestamp, and omitted fields. A disclosure register should record the purpose, recipient description, dossier fingerprint, and authorization reference. CASE identifies data markings as a mechanism for controlling access to privileged, proprietary, and personal information, while W3C PROV provides a useful conceptual basis for expressing entities, actions, and derivations in portable provenance descriptions.[3] [4]

### 3. Explainable case-quality and chronology workbench

Expand the existing `graphInsights` module into a workbench that presents evidence completeness and investigative hygiene rather than predictive analytics. It should flag missing observed times, isolated entities, unlinked notes, missing provenance fields, stale pending reviews, duplicate candidate records, and conflicts that are explicitly explainable from source data.

Each flag must show the exact records and rule that generated it. Analysts should be able to dismiss a flag with a reason, assign it as a task, or correct the underlying data. The interface should never compute a hidden suspicion, credibility, or person-risk score.

| Rule family | Example output |
|---|---|
| Chronology | “Three observations have no observed time; they cannot yet be placed reliably on the timeline.” |
| Provenance | “Exhibit E-014 has no handling-status update after acquisition.” |
| Review | “Two field submissions have been pending for more than the configured local review interval.” |
| Graph structure | “Entity X has no relationship or linked note.” |
| Duplicate candidates | “Two records share the same normalized phone number; analyst confirmation required.” |

### 4. Field assignment task cards and completion handoff

Extend the local field queue with structured task cards. Each card should define an objective, required evidence or observation checklist, safety/context note, optional due window, assignment author, and completion state. Completion should hand work back to the supervisor or analyst as a visible review item, with an auditable “unable to complete” reason where applicable.

This is a workflow extension, not workforce surveillance. It should avoid automated routing, background location tracking, productivity scoring, or hidden priority ranking. The field operator remains in control of what evidence is captured, and the supervisor remains responsible for explicit review.

### 5. Hardware-security and device-health posture dashboard

Create an authorized, read-only device assurance screen. It should report the app version, database encryption status, storage-secret availability, key security level where Android exposes it, backup-exclusion configuration status, audit-chain state, protected-media count, available storage warning, last successful database open, and whether biometrics are available. The dashboard should state **unavailable**, **software-backed**, **TEE-backed**, or **StrongBox-backed** based on actual platform evidence; it must not infer a hardware claim.[1]

The feature helps release owners and administrators distinguish an operational issue from an unsupported-device limitation. It should not collect or transmit device identifiers beyond the existing locally stored identity fingerprint.

### 6. Structured evidence intake templates and barcode/QR labels

Add configurable local templates for common evidence classes, such as image, video, document, physical exhibit, message, device, location observation, and witness-provided material. A template should guide required provenance fields, not auto-fill legal conclusions. Optional barcode or QR scanning can bind a physical exhibit label to a provenance record, while preserving the current digest and chain-of-custody model.

The first version should use locally generated labels and bounded metadata extraction. Any EXIF or file-metadata extraction must preserve original values, record the extraction tool/version, clearly distinguish machine-read metadata from human observation, and never overwrite manually captured provenance.

### 7. Local search, saved queries, and case bookmarks

Build a fast, offline search layer across case reference, entity labels, aliases, attributes, evidence exhibit numbers, provenance source references, notes, review status, assignment status, and timeline ranges. Saved searches should be personal to the local operator or explicitly shared only through a controlled export, not silently synchronized.

This can be implemented efficiently with SQLite indexes and full-text search where the encrypted SQLite build supports it. Search results should respect the current local role and case-assignment boundaries, especially for field accounts.

## Deferred, gated, or conditional extensions

| Extension | Gate before implementation | Reason for caution |
|---|---|---|
| Offline geospatial layer | Privacy review, permission design, offline map-tile policy, licensing review, and data-retention rules. | Location can be highly sensitive; maps must work offline without silently contacting third parties. |
| Voice notes and local transcription | Consent policy, audio-retention model, language/accuracy evaluation, and local-only processing decision. | Transcription errors must never be represented as original evidence. |
| CASE/PROV export profile | Dossier v2 complete, schema mapping workshop, validator tests, and destination-tool interoperability test set. | Standards mapping should be optional and versioned; it is not a live synchronization protocol. |
| Secure case synchronization | Complete threat model, mutually authenticated key agreement, authorization model, replay protection, encrypted framing, acknowledgment semantics, secure inbound persistence, and independent review. | The existing Bluetooth discovery path must continue to carry no case content. |
| Cloud backup or remote analytics | Explicit organizational approval, retention schedule, access model, data-protection impact assessment, and cryptographic design review. | These features conflict with the current offline security posture unless designed as a new governed product mode. |

## Recommended delivery sequence

| Program | Scope | Outcome |
|---|---|---|
| **Program A: Defensible dissemination** | Forensic dossier, verification receipt, data markings, redaction, and disclosure register. | A secure, reviewable, user-mediated output path for authorized sharing. |
| **Program B: Intelligence quality** | Explainable chronology/completeness workbench, deduplication candidates, local search, and saved queries. | Faster analysis with transparent data-quality rules rather than automated conclusions. |
| **Program C: Field execution** | Assignment task cards, structured evidence templates, and optional local QR/barcode labeling. | More consistent collection and a clearer field-to-supervisor handoff. |
| **Program D: Assurance and optional interoperability** | Device-health dashboard, CASE/PROV export profile, and tested validation tools. | Stronger release evidence and controlled cross-tool exchange. |
| **Program E: Collaboration research only** | Threat model and protocol design for secure sessions. | A decision-ready collaboration design; no activation of case transfer until it passes review. |

## Non-negotiable guardrails

The next program should preserve the current device-bound encryption, additive migrations, role checks, high-risk confirmations, audit ledger, and local assignment filter. New features must remain explainable and analyst-controlled. No person-level risk ranking, face recognition, covert tracking, background case transfer, or silent cloud dependency should be introduced as part of this roadmap.

## References

[1]: https://developer.android.com/privacy-and-security/keystore "Android Keystore system"
[2]: https://nvlpubs.nist.gov/nistpubs/ir/2022/NIST.IR.8387.pdf "NIST IR 8387: Digital Evidence Preservation"
[3]: https://caseontology.org/ontology/intro.html "CASE Community: Introduction"
[4]: https://www.w3.org/TR/prov-overview/ "W3C PROV-Overview"
