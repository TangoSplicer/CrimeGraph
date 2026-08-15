# CrimeGraph Next-Wave Enhancement Roadmap

**Status:** Approved for staged implementation under the existing offline-first and analyst-controlled security model.

**Design principle:** CrimeGraph should not imitate vendor interfaces or reproduce cloud-platform assumptions. The goal is an original field-to-analysis workspace that is more defensible on a disconnected device: every observation, workflow decision, derivative, disclosure, and capability claim remains attributable, reviewable, and controlled by an operator.

## Competitive position

| Capability | Typical market pattern | CrimeGraph advantage to preserve | Original enhancement direction |
|---|---|---|---|
| Case workflow | Configurable stages, tasks, dashboards, and reports. [1] [3] [6] | Local operation works without an account, network, or central scheduler. | Evidence-linked **Case Playbook** with explicit milestones, blockers, owner role, and accountable completion. |
| Evidence lifecycle | Centralized cloud evidence, tags, transcripts, redaction, original preservation, and sharing. [1] [2] | Device-bound encrypted storage, media envelopes, signed dossiers, and user-mediated export. | **Derivative & Annotation Ledger** that records every locally created extract, transcript, annotation, or redaction as a hash-linked child of the original. |
| Link analysis | Visual queries, saved searches, entity resolution, geospatial views, and analytics. [3] [5] | Explainable graph findings and no automated person-level ranking. | **Saved Local Queries**, human-approved duplicate resolution, source-constrained graph paths, and a non-predictive observation map. |
| Intake and leads | Tip portals, incident intake, routing, and tasking. [4] [6] | No public-facing upload or background data transfer. | **Local Lead Register** with provenance, sensitivity, review state, and explicit promotion into case intelligence. |
| Evidence logistics | Barcode labels, physical-property tracking, storage history. [4] | Existing provenance and custody fields are bound to case evidence. | **Offline Exhibit Register** with QR labels, packaging/container location, and auditable handling events. |
| Command visibility | Workload, status, trend, and performance dashboards. [1] [6] | Role-gated device assurance and audit verification without personnel scoring. | **Case Health & Readiness** summarizing missing provenance, pending review, blocked milestones, disclosure state, and storage readiness. |
| Interoperability | Cloud APIs, cross-agency sharing, automatic ingestion. [1] [3] [5] | No unattended transfer and no mesh session protocol. | Maintain dossier-only user-mediated exchange; define future CASE/PROV mapping separately from any transport. |

## Sequenced delivery

| Priority | Program | User outcome | Security and governance boundary |
|---|---|---|---|
| **P0** | Case Playbook and Local Lead Register | Investigators can plan work, preserve blockers, trace leads, and deliberately promote verified lead material to intelligence. | Local only; no public tip portal, automated prioritization, confidence scoring, or background notification. |
| **P1** | Evidence Derivative & Annotation Ledger | Every analyst-created derivative or annotation is tied to the original with purpose, creator, digest, and review state. | Preserve originals; no destructive edit; no opaque auto-redaction. |
| **P1** | Saved Local Queries and Graph Paths | Analysts can repeat transparent searches and show why records appear together. | Queries are local, readable, role-gated, and never produce a person-level score. |
| **P2** | Offline Exhibit Register and QR Labels | Physical exhibits gain label, location, container, and custody-event discipline. | QR encodes only a non-sensitive local exhibit reference; scanning never initiates transfer. |
| **P2** | Observation Map and Temporal Corroboration | Analysts can inspect source-bound location observations and uncertainties alongside the timeline. | No live tracking, geofence alerting, predictive hot-spotting, or automatic inferred location. |
| **P3** | Court and Briefing Builder | Operators can create a reproducible local briefing packet with manifest, exhibits, chronology, markings, and disclosure status. | Export is dossier-mediated and requires existing high-risk controls where applicable. |
| **Research only** | CASE/PROV mapping and secure-session protocol | A documented interoperability design becomes reviewable before any integration. | No API sync, Bluetooth/mesh transfer, or peer-to-peer case movement is enabled. |

## P0 functional specification

### Case Playbook

A playbook is an optional, case-scoped set of milestones. Each milestone has a category, objective, accountable role, state, optional due window, linked local objects, blocker reason, completion note, and immutable audit history. States are **not started**, **in progress**, **blocked**, and **complete**. The app must surface blocked or overdue milestones as case-health cues only; it must not infer investigator performance, urgency, likelihood of closure, or person-level risk.

### Local Lead Register

A lead is a case-scoped, local record of an incoming observation or follow-up opportunity. It has a title, summary, source type and reference, sensitivity marking, received time, handling state, and explicit disposition. An authorized analyst, supervisor, or administrator may promote a lead into a normal intelligence node only after choosing the source/provenance facts; promotion leaves the original lead intact and writes an audit event. Field operators may view leads only where their case assignment already permits access; they cannot create/import cases, apply markings, or promote leads.

## Acceptance conditions for P0

| Control | Required outcome |
|---|---|
| Local storage | Tables are additive migrations within the encrypted SQLite database. |
| Access control | Playbook creation and lead promotion are limited to admin, supervisor, and analyst roles. Field accounts retain their existing case-assignment boundary. |
| Auditability | Create, state change, block, complete, lead disposition, and lead promotion actions append to the hash-linked ledger. |
| Explainability | Any health cue names the exact milestone or lead state that caused it; there is no autonomous recommendation or score. |
| Security | No external endpoint, cloud upload, public intake link, remote notification, Bluetooth, or mesh transfer is created. |
| Validation | Unit tests cover permissions, input bounds, assignment closure, audit calls, and promotion provenance. Android CI and physical-device acceptance are updated before release. |

## References

[1]: https://www.nicepublicsafety.com/law-enforcement/investigations "NiCE: Police Digital Evidence Management for Investigations"
[2]: https://www.axon.com/resources/digital-evidence-management-guide "Axon: Digital Evidence Management Guide"
[3]: https://www.kaseware.com/ "Kaseware: Investigative Solutions"
[4]: https://caseclosedsoftware.com/ "Case Closed: Law Enforcement Case Management Software"
[5]: https://datawalk.com/industries/law-enforcement/ "DataWalk: Law Enforcement Intelligence Software"
[6]: https://www.soundthinking.com/blog/3-considerations-when-choosing-the-best-investigation-management-software/ "SoundThinking: Investigation Management Software Considerations"
