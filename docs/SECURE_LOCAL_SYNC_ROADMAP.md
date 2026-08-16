# CrimeGraph Secure Local Mesh Synchronization Roadmap

**Status:** Architecture Design & Implementation Draft  
**Scope:** Device-bound, offline-first peer-to-peer case synchronization across trusted Android tablets and field units without cloud relays, central servers, or unauthenticated transport channels.

---

## 1. Architectural Principles & Security Guardrails

CrimeGraph remains an **offline-first, analyst-controlled case intelligence tool**. To introduce multi-device collaboration without violating data sovereignty or security boundaries, the local sync architecture enforces five absolute constraints:

1. **Zero Cloud Dependencies:** All synchronization occurs strictly over direct local transports (Wi-Fi Direct / Local IP sockets or Bluetooth Low Energy for discovery/signaling), with zero telemetry, zero intermediate cloud relays, and zero external STUN/TURN servers.
2. **Identity-Bound Trust:** Peers must already establish a trusted pairing relationship anchored by their Android Keystore P-256 device identities before any case material can be exchanged.
3. **Mutual Authentication & Session Encryption:** Direct connections require ephemeral Diffie-Hellman key exchange (ECDH) signed by both devices' P-256 Keystore keys, resulting in an authenticated AES-256-GCM session tunnel.
4. **Audit-Ledger Convergence:** Synchronization is structured as an exchange of hash-linked audit-ledger deltas and additive SQLite record sets. Conflicts are never silently resolved by heuristics or opaque AI scoring; they follow deterministic operational rules (e.g., supervisor precedence or manual analyst merge).
5. **Role-Bound Permissions:** A field operator device can synchronize only assigned active case deltas and submit field observations; it cannot pull unassigned cases, modify case markings, or export forensic dossiers during a mesh session.

---

## 2. Core Protocol Phases

### Phase A: Local Discovery & Proximity Pairing
- **Transport Layer:** Local Wi-Fi socket listener bound to a specific ephemeral port when initiated by an operator, combined with BLE advertising for local device discovery (broadcasting only device fingerprint hash and alias).
- **Out-of-Band (OOB) Verification:** When two devices establish initial proximity contact, operators compare a short authentication string (SAS) or scan a temporary pairing QR code displayed on the supervisor/analyst screen.
- **Trusted Peer Registration:** Successful verification writes a peer record into the encrypted `trusted_peers` table, storing the peer’s P-256 public key, device ID, and assigned trust level.

### Phase B: Authenticated Handshake (SPAKE2 / ECDH over Keystore)
1. **Initiator Hello:** Device A sends its device ID, ephemeral ECDH public key, and a Keystore signature over the hello payload.
2. **Responder Challenge:** Device B verifies Device A’s signature against its trusted peer store, validates proximity/trust, and responds with its device ID, ephemeral ECDH public key, and its own Keystore signature.
3. **Session Key Derivation:** Both devices derive a shared master session key using HKDF-SHA256 over the shared ECDH secret. All subsequent frames within the session are encrypted with AES-256-GCM using rotating sequence nonces.
4. **High-Risk Confirmation:** Initiating an active sync session on the supervisor/analyst terminal requires explicit operator confirmation (and biometric/PIN reauthentication if configured).

### Phase C: Delta-Based Ledger & Record Synchronization
- **Vector Clock / Ledger Head Comparison:** Devices exchange their current audit-ledger head hash and latest sequence number.
- **Delta Transfer:** The sending device transmits only records, notes, provenance entries, and audit log items created or modified after the common ancestor hash.
- **Encrypted Media Handoff:** Large `.cgm` encrypted media attachments are transferred as independent chunked streams with SHA-256 integrity verification before being admitted into local app-private storage.
- **Merge & Commit:** SQLite updates are wrapped in an atomic database transaction. Every incoming record is appended with an audit ledger entry (`SYNC_INBOUND_RECORD`) citing the peer device ID and signature.

---

## 3. Implementation Roadmap (Next Build Batches)

| Milestone | Capability | Security & Workflow Control |
|---|---|---|
| **P1: Local Transport & Discovery** | Wi-Fi socket listener and local IP discovery bounded by trusted peer storage. | Unpaired devices are silently dropped; listener shuts down immediately upon session close. |
| **P2: Ephemeral Handshake & Tunnel** | Keystore-signed ECDH key exchange establishing an AES-256-GCM session tunnel. | Requires valid P-256 trust relationship; prevents replay and MITM attacks on local networks. |
| **P3: Audit-Delta Exchange & Merge** | Hash-linked ledger comparison and incremental SQLite record synchronization. | Preserves provenance and append-only audit trail; rejects malformed or unsigned deltas. |
| **P4: Role-Restricted Field Sync** | Field device sync profile restricted to assigned cases and pending submission queue. | Enforces RBAC boundary over the air; field devices cannot pull restricted operational intelligence. |
| **P5: Conflict Review Workbench** | Supervisor/analyst review queue for concurrent local edits requiring manual resolution. | Eliminates opaque auto-merge; every conflict resolution is analyst-controlled and audited. |

---

## 4. Guardrails & Explicit Exclusions

- **No Background Sync:** Synchronization is strictly user-initiated via the **Sync & Pairing** console. Background polling or automatic background mesh relaying is prohibited.
- **No Internet Fallback:** The protocol stack explicitly binds to local network interfaces (`192.168.x.x`, `10.x.x.x`, `127.0.0.1`, or Wi-Fi Direct interface) and throws an error if local routing is unavailable.
- **No Unsigned Records:** Any synced record or audit entry failing P-256 signature verification against the registered peer key is rejected instantly, triggering an audit security alert.
