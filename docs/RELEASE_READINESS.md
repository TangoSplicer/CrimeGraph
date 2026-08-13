# CrimeGraph Release Readiness Record

**Scope:** secure storage, device posture, supervisory review workflow, and Capacitor 8 modernization.

**Branch:** `feat/secure-storage-and-supervision`

**Status:** **Conditional release candidate.** The application-level suite and native synchronization are validated. A signed production release must remain blocked until the listed physical-device checks have passed and been recorded by an authorized release owner.

> This record separates **automated evidence** from **device-dependent assurance**. A passing browser build or a synchronized Android project is not evidence that Android Keystore, biometrics, camera permissions, encrypted SQLite, or device backup controls behave correctly on a real device.

## Automated evidence

| Control area | Evidence executed | Result | Release interpretation |
|---|---|---:|---|
| Type safety | `npm run typecheck` | Passed | TypeScript contracts compile without errors. |
| Rules and security suite | `npm run test` | Passed: **5 files, 22 tests** | Verifies RBAC boundaries, evidence provenance, encrypted-media envelopes, exact storage-secret validation, high-risk confirmation, migration, wipe orchestration, review decisions, and hostile import bounds. |
| Production bundle | `npm run build` | Passed | Vite production assets build successfully. |
| Dependency surface | `npm audit --omit=dev --audit-level=high` | Passed: **0 production high/critical findings** | Blocks release if the production dependency surface has a high or critical known advisory. |
| Native bridge synchronization | `npm run sync:android` | Passed | Capacitor 8 synchronized Android web assets and detected the nine expected Capacitor plugins plus the Cordova Bluetooth plugin. |
| Gradle toolchain bootstrap | `./android/gradlew --version` | Passed: **Gradle 8.14.3, Java 21** | Confirms the upgraded wrapper launches with the release toolchain. |

The project now uses Capacitor 8, Node 22 in continuous integration, Android Gradle Plugin 8.13.0, Gradle 8.14.3, Java 21, and Android SDK 36. These match the current Capacitor 8 Android migration baseline.[1]

## Native build status

| Native step | Status | Evidence and constraint |
|---|---|---|
| Android source synchronization | Complete | `cap sync android` completed with the expected plugin registry. |
| Android debug APK compilation in sandbox | Environment-blocked | The sandbox has no `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or Android SDK packages. The failure is therefore an SDK-location error, not a TypeScript, Capacitor sync, or Gradle-wrapper error. |
| Android debug APK compilation in CI | Configured | The workflow installs Node 22, Java 21, Android command-line tools, API 36, and Build Tools 36.0.0 before `assembleDebug`. |
| Signed production APK/AAB | Not performed | Signing identity, distribution channel, and release-owner authorization were not provided. |

> The CI workflow is the authoritative unattended APK gate. It runs `npm ci`, `npm run verify`, a production-only dependency audit, Capacitor synchronization, and `./gradlew assembleDebug --no-daemon` on every pull request to `main` and on mainline pushes.

## Mandatory physical-device validation

The release owner must test on at least one supported Android device with Android 7.0/API 24 or later. The Android 24 minimum follows the Capacitor 8 baseline.[1]

| Test | Expected result | Record required |
|---|---|---|
| Fresh installation and first login | The app creates a device-held encryption secret, opens its encrypted SQLite database, and permits the configured operator to sign in. | Device model, Android version, app build identifier, operator role. |
| Restart and offline persistence | Cases, encrypted media, and review state remain available after app restart while offline. | Pass/fail and any recovery warning. |
| Camera evidence capture | A field photo is captured into app-private encrypted `.cgm` storage; the displayed SHA-256 digest and provenance record remain bound to the evidence item. | Screenshot or operator verification of provenance and attachment preview. |
| Legacy-media migration | A pre-upgrade plaintext attachment is lazily migrated to encrypted storage, its provenance URI updates, and an audit entry is created. | Migration case reference and audit-entry identifier. |
| Background and inactivity lock | Backgrounding without an intentional export locks the session; five minutes of inactivity also requires login. | Timing result and authentication method used on re-entry. |
| High-risk confirmation | Peer verification, peer revocation, and system wipe require biometric confirmation when available, otherwise the current credential. | Biometric availability/result and fallback result. |
| Secure wipe | After confirmed wipe, attachment paths are deleted where possible, the wrapped storage secret is destroyed, and previously protected local data cannot be reopened. | Device test identifier and post-wipe relaunch result. |
| Supervisor review | A field submission appears as pending; a supervisor can approve it or return it only with a correction note; a returned field item can be corrected and resubmitted; each step is present in the audit ledger. | Case reference, node identifier, and audit-chain verification result. |
| Backup/extraction posture | System backup and transfer do not include CrimeGraph application data according to the Android manifest and data-extraction rules. | Device/MDM validation or platform inspection evidence. |

## Release decision gates

A release owner may move this branch into a release candidate only after the following conditions are met. The branch must remain blocked if any condition fails.

| Gate | Required state |
|---|---|
| Source integrity | Working tree is clean and all review commits are present. |
| Automated checks | `npm run verify` and `npm audit --omit=dev --audit-level=high` pass from a clean dependency installation. |
| Native CI | The Android workflow produces the debug APK artifact successfully. |
| Device assurance | Every mandatory physical-device test above is recorded as passed, or an approved exception is documented. |
| Security review | The audit ledger verifies after review workflow exercise; no plaintext evidence is retained after migration or wipe testing. |
| Distribution | The authorized release owner provides signing, versioning, and deployment approval. |

## References

[1]: https://capacitorjs.com/docs/updating/8-0 "Capacitor 8 migration guide"
