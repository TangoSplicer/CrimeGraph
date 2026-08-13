# CrimeGraph Operational Handover

**Repository:** `TangoSplicer/CrimeGraph`

**Mainline merge:** Pull request [#1](https://github.com/TangoSplicer/CrimeGraph/pull/1)

**Scope:** device-bound protected storage, secure evidence media, operator device posture, supervisory review, and release assurance.

> CrimeGraph remains an **offline, analyst-controlled case-intelligence application**. It records attributable observations and evidence provenance; it does not perform automated person-level risk scoring or opaque predictions.

## Operating model

| Role | Primary operating responsibility | Important boundary |
|---|---|---|
| Administrator | Provisions operators, performs audited emergency wipe, manages system configuration. | Wipe requires a high-risk reauthentication step. |
| Supervisor | Reviews field submissions, approves observations, or returns them with a required correction note. | Review is explicit and audit-recorded; it is not an automated confidence judgment. |
| Analyst | Creates, edits, links, and exports permitted intelligence records. | Cannot review field submissions or manage trusted pairing. |
| Field operator | Captures and submits observations and evidence; can correct only records returned to that operator. | New submissions are marked **pending review**; broad editing is not granted. |
| Read-only operator | Views permitted local intelligence. | Cannot create, alter, export, review, pair, or wipe. |

## Core field-to-supervisor workflow

A field operator creates an intelligence node through the normal capture flow. The record is stored with the submitting operator, submission time, and `pending` review state. When evidence media is captured, it is stored as an encrypted `.cgm` envelope and the evidence provenance record contains its SHA-256 digest.

A supervisor opens **REVIEW** in the bottom navigation. The inbox presents only pending records, with their case, submitter, time, and an inspection route into the graph workspace. The supervisor may approve a record, optionally explaining the rationale, or return it. A return requires a specific correction comment. Each decision creates a hash-linked audit entry.

A field operator sees pending, approved, or returned state in the graph workspace. A returned record displays the supervisor’s correction feedback. Only the originating field operator can use **Correct & resubmit**; this clears the previous decision state and returns the record to `pending` for a fresh supervisory decision.

## Security operations

| Capability | Operational behavior | Audit / assurance point |
|---|---|---|
| Local database | Android devices use an Android Keystore-wrapped 32-byte secret for encrypted SQLite. Browser preview storage is explicitly not equivalent to native protected storage. | A bridge response must be an exact base64-encoded 32-byte value. |
| Evidence attachments | AES-GCM `CGM1` envelopes are written to app-private storage; plaintext legacy attachments are migrated lazily on case load. | Migration creates `MIGRATE_EVIDENCE_MEDIA` audit activity. |
| Device pairing | Pairing uses a device-held P-256 identity, signed expiring invitation, and short-authentication-code comparison. | Peer verification and revocation require high-risk reauthentication. |
| Session posture | The app locks after five minutes of inactivity and locks when backgrounded unless an export action intentionally backgrounds it. | Re-authentication uses biometrics when available; otherwise the current credential. |
| Secure wipe | Attachment paths are deleted where possible, encrypted local storage is removed, and the device-held wrapping secret is destroyed. | The cryptographic key destruction ensures remaining encrypted media cannot be reopened with the destroyed device secret. |
| Backup posture | Android backup and data transfer are disabled through the manifest and extraction rules. | Verify this remains true after any future manifest merge. |

## Required routine checks

| Frequency | Owner | Check | Expected evidence |
|---|---|---|---|
| Every pull request and mainline push | CI | Install locked dependencies, run `npm run verify`, production audit, Android synchronization, and debug APK build. | A passing **CrimeGraph Android Build** workflow and APK artifact. |
| Before signed release | Release owner | Follow every physical-device check in [`RELEASE_READINESS.md`](./RELEASE_READINESS.md). | Recorded result, device/OS, build ID, operator, and exceptions. |
| After supervisory workflow exercise | Supervisor or auditor | Open the audit ledger and verify the hash chain. | Valid chain plus decision / correction entries. |
| After application upgrade | Technical owner | Verify Android backup controls, native plugin registry, key creation/reopen, encrypted evidence preview, and legacy attachment migration. | Release-readiness record updated with results. |

## Release commands

```bash
npm ci
npm run verify
npm audit --omit=dev --audit-level=high
npm run sync:android
cd android && ./gradlew assembleDebug --no-daemon
```

Continuous integration pins the Capacitor 8 release toolchain to Node 22, Java 21, Android API 36, and Gradle 8.14.3. Capacitor’s upgrade documentation defines this Android baseline.[1]

## Guardrails for future changes

New collaboration transports, including Bluetooth or mesh case transfer, must remain disabled until a complete authenticated secure-session protocol has been designed, threat-modelled, implemented, and independently reviewed. Do not make review status an automated decision or use it as a proxy for person-level assessment. Any future schema change must remain additive or include a tested encrypted-storage migration path.

## References

[1]: https://capacitorjs.com/docs/updating/8-0 "Capacitor 8 migration guide"
