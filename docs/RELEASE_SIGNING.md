# CrimeGraph Controlled Android Release Procedure

**Purpose:** This procedure governs production signing and distribution after the automated gates and physical-device acceptance protocol have passed.

> **Security rule:** Never commit a signing keystore, keystore password, key alias password, Google Play credential, or release artifact password to this repository, issue tracker, application source, or test fixture.

## Required approvals

| Gate | Required evidence |
|---|---|
| Source baseline | Clean `main` checkout at an identified commit SHA. |
| Automated build | Green Android workflow for that exact SHA, including `npm run verify`, production audit, Capacitor synchronization, and debug APK compilation. |
| Device acceptance | Completed [`DEVICE_ACCEPTANCE.md`](./DEVICE_ACCEPTANCE.md) record with no unresolved blocking failures. |
| Security review | Audit ledger verified after the lifecycle, assignment, field evidence, and supervisor-review exercises. |
| Release authorization | Named release owner and approved distribution channel. |

## Version and provenance preparation

1. Select the exact green `main` commit and create a release candidate tag only after all gates pass.
2. Update the Android `versionCode` and `versionName` in accordance with the organization’s release policy. Record both values with the commit SHA.
3. Generate a software bill of materials or retain the locked `package-lock.json` and production audit output as release evidence.
4. Preserve the CI debug APK artifact for diagnostic comparison. It is **not** a production distribution artifact.

## Secure signing setup

The release owner must create or retrieve the organization-controlled Android signing key using an approved secret-management process. Store the keystore only in the approved secret store or a protected release workstation. Configure signing properties outside the repository, for example by using an ignored local properties file or protected CI secrets.

| Secret | Handling requirement |
|---|---|
| Keystore file | Protected secret-store binary or encrypted release-workstation file. |
| Keystore password | Protected secret only. |
| Key alias | Protected release configuration value. |
| Key password | Protected secret only. |
| Store/distribution credentials | Separate protected credential with least privilege. |

A CI signing workflow, if later authorized, must expose secrets only to protected release environments, restrict who can trigger it, retain artifacts for a defined period, and never print signing values.

## Artifact generation and verification

1. On a protected release environment, start from a clean dependency installation: `npm ci`.
2. Execute `npm run verify` and `npm audit --omit=dev --audit-level=high`.
3. Synchronize native assets: `npm run sync:android`.
4. Build the configured signed release artifact, normally an Android App Bundle: `cd android && ./gradlew bundleRelease --no-daemon`.
5. Record the SHA-256 digest, version code, version name, commit SHA, build timestamp, and signing certificate fingerprint.
6. Install the signed candidate on a fresh test device and repeat the mandatory acceptance steps that depend on the release signature: commissioning, encrypted restart, field assignment, evidence capture, review, and background lock.
7. Archive the acceptance record, checksum, CI run URL, and approval reference with the release entry.

## Distribution decision

A release may be distributed only by the approved release owner after artifact verification and acceptance sign-off. If an issue is found after signing, revoke the distribution candidate, open a remediation change, and produce a newly versioned artifact. Do not reuse a compromised or incorrectly distributed artifact.
