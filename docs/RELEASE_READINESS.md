# CrimeGraph Release Readiness Record

**Scope:** Device-bound encrypted storage, controlled forensic dossiers and disclosure records, explainable quality review, structured field work cards and evidence intake, device posture, supervisory review, secure operator lifecycle, and Capacitor 8 Android release assurance.

**Baseline branch:** `main`

**Status:** **Conditional release candidate.** Automated checks and debug APK compilation are required but do not substitute for the physical-device acceptance evidence and controlled signing approval defined below.

> A passing browser build, synchronized Android project, or debug APK does not by itself prove Android Keystore, biometrics, camera permissions, encrypted SQLite, field assignment visibility, or backup-exclusion behavior on a real device.

## Automated release evidence

| Control area | Required evidence | Current release interpretation |
|---|---|---|
| Type safety and production bundle | `npm run verify` | Blocks release on TypeScript, unit-test, or production-build failure. |
| Security and workflow suite | `npm run test` | Covers encrypted media, storage-secret format, high-risk confirmation, secure wipe, hostile import bounds, forensic dossier tamper detection, controlled markings, explainable quality findings, supervisory review, operator lifecycle, field task access closure, and assignment visibility. |
| Production dependency surface | `npm audit --omit=dev --audit-level=high` | Blocks release on a production high or critical advisory. |
| Native bridge synchronization | `npm run sync:android` | Confirms Capacitor 8 Android assets and registered native plugins are synchronized. |
| Native debug compilation | GitHub **CrimeGraph Android Build** workflow | Builds a debug APK from the synchronized project on API 36 with Java 21. |
| Artifact retention | CI APK artifact | Retained for seven days for diagnostic comparison; not a production release artifact. |

The project uses Capacitor 8, Node 22, Java 21, Android Gradle Plugin 8.13.0, Gradle 8.14.3, and Android SDK 36, following the Capacitor 8 Android migration baseline.[1]

## Release workflow controls

The Android workflow runs on pushes and pull requests targeting `main` and `master`. It uses Node 24-compatible action releases, performs a locked dependency installation, executes verification and a production-only dependency audit, synchronizes Capacitor, installs API 36/build tools, compiles the debug APK, and uploads the artifact.

| Control | Requirement |
|---|---|
| Source provenance | The release owner identifies the exact green `main` commit SHA. |
| Dependency reproducibility | CI uses `npm ci` and the committed lockfile. |
| Native toolchain | CI provisions Java 21 and Android API 36/Build Tools 36.0.0. |
| Artifact boundary | Debug APKs are test artifacts only; a separately signed release artifact is required for distribution. |
| Action runtime maintenance | Workflow actions use Node 24-compatible major versions to avoid deprecated Node 20 action-runtime warnings. |

## Mandatory device acceptance

Complete and archive the full [physical-device acceptance protocol](./DEVICE_ACCEPTANCE.md) before authorizing distribution. Its mandatory checks include encrypted first-run commissioning, restart persistence, secure operator lifecycle actions, assigned field queues and task cards, guided evidence intake and protected camera capture, forensic dossier integrity, review/resubmission, session locks, verified pairing, secure wipe, backup/transfer exclusion, and the native device assurance report.

| Minimum required evidence | Required result |
|---|---|
| Fresh commission and restart | Device-bound encrypted database opens and remains readable after restart. |
| Operator lifecycle | Disablement blocks PIN/biometric sign-in; reset, role change, and reinstatement are reauthenticated and audited. |
| Field work queue | Field users see only assigned local operations and cannot load a removed/unassigned graph. |
| Evidence and review | Encrypted media, provenance digest, guided intake, pending review, return, correction, and resubmission are validated offline. |
| Controlled dissemination | Markings, redacted forensic dossier generation, disclosure-register recording, signature verification, and tamper rejection are demonstrated. |
| Field execution | Structured task cards are limited to the active field assignee, with completion and inability handoff audited. |
| Device assurance | Installed Android reporting is checked for actual key-security-level wording, storage-secret status, backup exclusion, biometric readiness, storage warning, protected-media count, last database open, and audit-chain state. |
| Secure wipe | Protected local data and device-held storage secret cannot be reopened after the confirmed test wipe. |

## Controlled signing and distribution

The release owner must follow the [controlled Android release procedure](./RELEASE_SIGNING.md). No keystore, signing password, distribution credential, or other release secret may be committed to source control. A production APK or AAB can be authorized only after the exact signed artifact has an archived checksum, signing-certificate fingerprint, acceptance record, CI run URL, and release-owner approval.

## Release decision gates

| Gate | Required state |
|---|---|
| Source integrity | Clean `main` checkout at an identified commit SHA. |
| Automated checks | `npm run verify` and `npm audit --omit=dev --audit-level=high` pass from a clean dependency installation. |
| Native CI | The Android workflow produces the debug APK artifact successfully for the release commit. |
| Device assurance | Every mandatory acceptance test passes, or an approved non-blocking exception is documented. |
| Security review | The audit ledger verifies after lifecycle, assignment, task handoff, field evidence, controlled dossier, and supervisory review exercises. |
| Truthful assurance | Device assurance must identify unavailable or OS-undifferentiated hardware protection as such; it must not claim StrongBox or TEE without an Android-reported security level. |
| Signing | The release artifact is produced in an approved protected environment with no secrets committed or logged. |
| Distribution | A named release owner approves the versioned artifact and target channel. |

## References

[1]: https://capacitorjs.com/docs/updating/8-0 "Capacitor 8 migration guide"
