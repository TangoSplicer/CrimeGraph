# CrimeGraph Next-Phase Development Roadmap

**Scope:** Forward-looking enhancements for CrimeGraph following the successful delivery of peer-to-peer sync, evidence derivatives, physical exhibit custody, stated observation uncertainty, and spatial/temporal corroboration.

---

## 1. Guiding Principles for Future Capabilities

Future development will strictly adhere to CrimeGraph’s foundational architecture:
1. **Zero Cloud Telemetry:** No external servers, cloud backups, or automatic telemetry.
2. **Analyst Control:** No automated AI risk scoring, predictive profiling, or autonomous graph layout transformations.
3. **Immutability & Provenance:** Every record modification requires explicit operator action and appends to the hash-linked audit ledger.

---

## 2. Prioritized Next-Phase Milestones

| Priority | Program / Feature | Operational Objective | Security & Governance Boundary |
|---|---|---|---|
| **Phase 1** | **Conflict Resolution Workbench (P2P Sync)** | Provide an interactive supervisor review queue for concurrent local edits during offline peer-to-peer synchronization, allowing manual merge decisions. | No silent auto-merge; every conflict resolution is analyst-controlled and recorded in the audit ledger. |
| **Phase 2** | **Advanced Temporal Timeline Corroboration** | Implement interactive timeline filtering that correlates stated observation uncertainty windows and provenance timestamps against case milestones. | Visual timeline grouping only; no predictive forecasting or automatic urgency scoring. |
| **Phase 3** | **Encrypted Case Archive & Restoration** | Enable password-derived PBKDF2 encrypted local case archive packages (`.cgarchive`) for long-term secure cold storage and offline migration. | Requires high-risk reauthentication; archive packages are encrypted with AES-256-GCM. |
| **Phase 4** | **Multi-Language Field Prompt Localization** | Support localized field prompt templates for international law enforcement and investigative agencies operating in disconnected environments. | Static string localization; no machine translation cloud APIs. |

---

## 3. Explicitly Excluded Capabilities

To maintain CrimeGraph’s security and legal defensibility, the following capabilities remain **permanently excluded**:
- **Cloud Database Sync:** Any synchronization architecture relying on central cloud servers, AWS S3 buckets, or third-party relays.
- **Automated Person-Level Scoring:** Any algorithm ranking individuals by threat level, recidivism risk, or behavioural prediction.
- **Mesh Radio Background Relaying:** Unattended background mesh packet forwarding without explicit operator session initiation.
- **Destructive Media Modification:** Automated background image cropping, face blurring, or destructive audio filtering that alters original evidence digests.
