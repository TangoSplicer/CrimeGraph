# CrimeGraph Comprehensive Feature Documentation Suite

**Document Version:** 4.0  
**Status:** Production Release Documentation  
**Scope:** Offline-first case intelligence, secure peer-to-peer synchronization, evidence derivative ledger, physical exhibit tracking, stated observation uncertainty, spatial/temporal corroboration, and role-based access governance.

---

## 1. System Overview & Core Philosophy

CrimeGraph is an **offline-first, analyst-controlled case intelligence application** targeting Android via Capacitor 8. Designed for secure field operations and complex investigations, CrimeGraph guarantees that **no cloud telemetry, automated AI risk scoring, or unattended data transfers** are ever performed. All intelligence records, provenance metadata, and audit ledgers remain bound to encrypted device-held storage.

---

## 2. Secure Local Peer-to-Peer Synchronization

### 2.1 Architecture & Trust Model
CrimeGraph eliminates cloud relays and external servers entirely by implementing a direct, cryptographically secure peer-to-peer synchronization protocol.
* **Identity Anchor:** Every device generates and stores an **Android Keystore P-256 (secp256r1)** hardware-backed key pair. Private keys never leave the secure hardware boundary.
* **Peer Verification:** Devices establish trust through verified out-of-band invitation codes and cryptographic fingerprint exchange, storing approved peers in the encrypted `trusted_peers` database table.
* **Signed Deltas:** Outbound synchronization payloads include case nodes, edges, notes, provenance, derivatives, movements, and observation contexts, signed by the sending device's P-256 private key.

### 2.2 Security Hardening & Freshness
* **Freshness Window:** Inbound synchronization deltas enforce a strict **5-minute timestamp freshness window**, rejecting replayed, expired, or future-dated packets instantly.
* **Transactional Atomicity:** All incoming records are committed within an atomic SQLite transaction (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`). Any validation failure triggers an immediate rollback.
* **Audit Trail:** Every successful inbound sync writes an immutable entry (`SYNC_INBOUND_DELTA`) to the hash-linked audit ledger with operator attribution and peer identification.

---

## 3. Evidence Management & Derivative Ledger

### 3.1 Original Preservation
CrimeGraph strictly separates source evidence from analyst interpretation:
* **Provenance Binding:** Every evidence item is bound to an exhibit number, source type, reference, acquisition timestamp, operator, and SHA-256 file digest.
* **Derivative Ledger:** Analysts may record annotations, transcript excerpts, review notes, and redaction instructions as hash-linked child records. **Original media files and source digests are never modified.**
* **Forensic Dossiers (v1–v4):** User-mediated exports generate cryptographically signed packages containing canonical manifests, redaction profiles, exhibit movements, and stated observation contexts.

---

## 4. Physical Exhibit Tracking & Offline QR Labels

* **Local QR Generation:** Authorized operators can generate a local QR label for any evidence item containing an opaque reference and a provenance fingerprint. It acts purely as a local lookup aid; scanning or pasting a label verifies it against the displayed record without initiating any network connection.
* **Custody Ledger:** Physical movements (sealing, checkout, return, disposal) require high-risk reauthentication (PIN/biometrics) and append immutable custody events to the audit ledger.

---

## 5. Stated Observation Uncertainty & Corroboration

* **Analyst-Entered Context:** Instead of opaque AI scoring or automated confidence calculation, analysts record explicit stated uncertainty: source basis, spatial precision (exact, approximate, area), coordinates, uncertainty radius, and temporal precision (exact, approximate, window).
* **Corroboration Workbench:** The analysis panel aggregates observation contexts to surface transparent findings (e.g., broad area bounds or temporal windows) without automated risk ranking or predictive hot-spotting.
