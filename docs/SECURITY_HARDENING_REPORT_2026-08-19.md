# CrimeGraph Security Hardening Report

**Date:** 19 August 2026

**Scope:** Android API 36 / Capacitor 8 offline-first client and its local `.cgarchive` workflow.

**Assessment posture:** Engineering hardening and release-readiness evidence. This report is **not** an independent penetration-test certificate or a claim of formal OWASP MASVS certification.

## Executive summary

CrimeGraph has been hardened for its intended offline-first investigative use without introducing cloud services, telemetry, or remote collection. The batch enforces an Android network deny-by-default policy, prevents screen capture of the protected activity, disables WebView inspection in non-debuggable builds, scopes legacy Bluetooth/location permissions, enables R8 minification and resource shrinking, and adds the keep rules necessary for Capacitor’s reflective bridge. The release build now completes with these controls enabled.

The encrypted case-archive format now creates every new archive with a **600,000-iteration PBKDF2-HMAC-SHA-256** key derivation work factor, a new random 16-byte salt, a random 12-byte AES-GCM IV, and an explicit authenticated envelope. This matches OWASP’s stated PBKDF2-HMAC-SHA-256 recommendation of 600,000 iterations where PBKDF2 is selected.[1] A deliberately narrow import compatibility path accepts only the previously shipped 100,000-iteration format; all other work factors are rejected before decryption.

The shared high-risk reauthentication gate now invokes biometrics only for a session carrying the persisted biometric-enabled state. On Android, the native challenge requires **strong biometrics**, explicit confirmation, and prohibits device-credential fallback. If an enrolled biometric challenge fails, the protected action fails closed. The broader PIN/administrator-password reauthentication path remains for sessions without biometric enrolment and for non-native environments; it is therefore a deliberate role-credential fallback rather than a replacement for the high-risk gate.

| Release-readiness result | Evidence |
|---|---|
| Web type safety, test suite, and production bundle | `npm run verify` passed: **21 test files, 107 tests**, TypeScript check, and Vite production build. |
| Archive defensive testing | Fuzz suite verifies envelope validation, KDF allow-listing, wrong-password/tamper failure, input-size limits, and a valid 100,000-iteration legacy import. |
| Android native synchronization | `npm run sync:android` completed successfully after the production web bundle was rebuilt. |
| Minified Android release | `:app:assembleRelease` completed successfully with R8, resource shrinking, Capacitor bridge rules, and the hardened manifest. |

## Implemented controls and rationale

Android’s Network Security Configuration is the appropriate declarative mechanism for cleartext and trust-anchor policy.[2] CrimeGraph’s manifest attaches `@xml/network_security_config`, sets `usesCleartextTraffic="false"`, and uses a base policy that prohibits cleartext traffic and trusts the **system** certificate store only. This preserves the product’s offline-first design while preventing accidental future HTTP regressions or automatic trust of user-installed CAs. The application retains the Android `INTERNET` permission because Capacitor and platform components may require it, but no cloud endpoint or general web API is enabled by this policy.

| Control area | Implemented measure | Primary implementation evidence | MASVS alignment |
|---|---|---|---|
| Local storage and key handling | Existing encrypted SQLite, Android Keystore P-256 device identities, AES-GCM media/archive protection, and strict archive input limits are retained. New archive headers authenticate the selected PBKDF2 parameters before decrypting. | `src/capacitor/db.ts`, `DeviceIdentityPlugin.java`, `src/utils/caseArchive.ts` | Storage and cryptography controls; OWASP identifies encrypted storage and platform-keystore-managed keys as important L2 considerations.[3] |
| Password-derived case archives | New `.cgarchive` exports use PBKDF2-HMAC-SHA-256 at **600,000** iterations, 16-byte random salts, 12-byte random IVs, and AES-256-GCM. Only 600,000 and the documented legacy 100,000 factor pass the parser. | `src/utils/caseArchive.ts`, `caseArchive.fuzz.test.ts` | MASVS-CRYPTO; the PBKDF2-HMAC-SHA-256 600,000 recommendation is documented by OWASP.[1] |
| Archive integrity and import safety | Envelope format/version/KDF/encryption fields, byte ranges, exact salt and IV sizes, GCM tag minimum, archive/ciphertext size ceilings, and per-collection record ceilings are checked before mutation. Imports use `withDatabaseTransaction` to avoid Android bridge nested-transaction failures. | `src/utils/caseArchive.ts` | MASVS-CRYPTO and MASVS-CODE untrusted-data handling. |
| High-risk authentication | High-risk actions require an active session and reauthentication. Biometric invocation is restricted to a biometric-enabled session. Android requests strong biometrics, explicit confirmation, and has `allowDeviceCredential: false`. Failed enrolled biometrics fail closed. | `src/utils/highRiskAuth.ts`, `src/capacitor/biometrics.ts`, `highRiskAuth.test.ts` | MASVS-AUTH; OWASP lists strong biometrics and explicit user confirmation as mobile best practices.[3] |
| Network policy | Cleartext traffic is denied at both manifest and XML levels; only system trust anchors are configured. No custom CA, user CA, pin set, or cloud endpoint is introduced. | `AndroidManifest.xml`, `res/xml/network_security_config.xml` | MASVS-NETWORK. Android documents the network-security configuration as the mechanism for cleartext opt-out and trust-anchor control.[2] |
| WebView boundary | A CSP restricts default, script, connect, form, object, frame, and media sources to bundled/local Capacitor origins; `data:` is narrowly retained for locally decrypted evidence previews. WebView debugging is disabled when the app is not debuggable. | `index.html`, `MainActivity.java` | MASVS-PLATFORM / MASVS-RESILIENCE. |
| Screen and recents protection | `FLAG_SECURE` is applied before the activity is initialized, preventing screenshots, screen recording, and task-switcher snapshots of the protected screen. | `MainActivity.java` | MASVS-PLATFORM. OWASP explicitly calls out screen-capture protections as a mobile best practice.[3] |
| Least privilege | Modern BLE permissions remain only where Tactical Mesh requires them. Legacy Bluetooth and location permissions are limited to Android API 30 and below; BLE scanning declares `neverForLocation`. | `AndroidManifest.xml` | MASVS-PLATFORM / MASVS-PRIVACY. |
| Build hardening | Release builds use `minifyEnabled true`, `shrinkResources true`, optimized ProGuard defaults, and narrowly scoped Capacitor/Cordova bridge preservation. The two generated R8 rules suppress only optional JSR-305 annotation references in the packaged Tink dependency. | `android/app/build.gradle`, `proguard-rules.pro` | MASVS-RESILIENCE / MASVS-CODE. |
| Offline-first privacy | This batch adds no telemetry, remote sync service, analytics SDK, or third-party endpoint. Tactical Mesh remains device-to-device and permission controlled. | Repository configuration and Android policy review | MASVS-PRIVACY. |

## Cryptographic archive migration behavior

The archive format remains self-describing so import behavior is deterministic and auditable. New exports record `PBKDF2`, `SHA-256`, and the 600,000 iteration count in the authenticated archive envelope. The parser refuses missing, malformed, or unexpected KDF descriptors; it does **not** silently downgrade a future archive to a weaker factor. The 100,000-iteration path is compatibility-only for prior CrimeGraph archives and is covered by a dedicated positive test.

> **Operational implication:** Exporting an existing case after this update produces a stronger archive. It does not rewrite older archive files in place. Retain legacy files only according to the organisation’s evidence-retention schedule, and re-export important retained cases into the current format when operationally appropriate.

## Validation record

The validation commands below were run in the repository after the changes were made. The Android release build initially surfaced two configuration defects that debug builds would not reveal: an unavailable generated `BuildConfig` reference and missing optional Tink annotation classes during R8. Both were corrected before the final successful release assembly. This is positive release-validation evidence, not a weakness that remains in the shipped source.

| Validation activity | Result | Notes |
|---|---|---|
| Focused archive, crypto, high-risk-auth, and auth-store tests | Passed | Confirmed KDF uplift, legacy import, biometric preference condition, and operator authentication regressions. |
| `npm run verify` | Passed | **21/21 test files and 107/107 tests**, followed by TypeScript and production build completion. The React test renderer still emits a pre-existing `useLayoutEffect` server-render warning from the BottomTabBar test; it is a test-rendering warning, not a validation failure. |
| `npm run sync:android` | Passed | Copied the built web assets and refreshed Capacitor/Cordova plugin metadata. |
| `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew :app:assembleRelease --no-daemon` | Passed | Minified Android release build completed with R8 and resource shrinking. Native third-party compiler deprecation/unchecked warnings remain informational and should be tracked through dependency maintenance. |
| Archive fuzz suite | Passed | Seven vectors, including KDF tampering, bounded malformed corpus, randomized byte arrays, oversize rejection, and an authenticated legacy import. |

## Physical-device acceptance procedure

The successful local release assembly is necessary but insufficient for Tactical Mesh and biometric assurance. Before operational distribution, the release-signing authority must sign the generated APK/AAB with the approved organisational key and a trained administrator must complete the following acceptance record on each supported handset class. Do **not** use the unsigned local build as a production distribution artifact.

| Step | Acceptance action | Expected result |
|---|---|---|
| 1 | Install the organisation-signed release on a physical Android 12+ device with a secure device lock and a strong biometric enrolled. | Installation succeeds; app starts without a developer-inspection endpoint. |
| 2 | Commission the app, provision test operators, and confirm role boundaries with a field user and a read-only user. | Field users cannot access unassigned cases or administration; read-only users cannot mutate case data. |
| 3 | Capture a screenshot, start screen recording, and open the Android task switcher while a protected case is visible. | Protected content is not captured or visible in the recents thumbnail. |
| 4 | For a biometric-enabled session, perform a high-risk action and attempt device PIN/pattern/password fallback in the biometric dialogue. | The system asks for a strong biometric with explicit confirmation; device-credential fallback is not offered. Cancel/failure blocks the action. |
| 5 | Repeat the same protected action from a session without biometric enrolment. | The high-risk credential reauthentication path is required; no automatic biometric prompt appears. |
| 6 | Create a new encrypted `.cgarchive`, inspect its non-secret header through the app’s supported workflow, then test correct password, wrong password, and a one-byte tampered copy. | New archive records 600,000 iterations; correct import succeeds; wrong/tampered data fails before mutation. |
| 7 | Test an authorised historical 100,000-iteration archive in a non-production test case. | Import succeeds only if it has a valid authenticated legacy envelope; all other KDF factors are rejected. |
| 8 | Deny Nearby Devices permission and attempt Tactical Mesh; then grant it and conduct a two-device, assigned-case test. | The UI reports permission/state guidance; discovery and sync work only after permission and explicit peer trust are established. |
| 9 | Attempt HTTP-only or user-CA-intercepted traffic in a controlled test environment. | No cleartext policy regression occurs; only the system trust store is accepted by the declared network policy. |
| 10 | Record device model, Android security-patch level, app version, release signing certificate fingerprint, tester, date, and all results in the commissioning log. | The deployment record is complete and auditable. |

## Residual risks and recommended follow-up

No offline mobile control removes all endpoint risk. A physically compromised but unlocked device, a malicious accessibility service, a rooted device, or a legitimate user photographing a screen remains outside the protections of `FLAG_SECURE` and encryption at rest. The application has device assurance and protected identities, but this batch does not claim hardware attestation, root prevention, runtime anti-hooking, or remote revocation. Those capabilities must be evaluated against the product’s zero-cloud constraint and operational governance before implementation.

| Priority | Residual item | Recommended disposition |
|---|---|---|
| High | **Physical-device testing is still required** for BLE discovery, strong-biometric behavior, screen-capture protection, and permission transitions. | Complete and retain the acceptance record above before operational release. |
| High | The current `biometric_enabled` setting is a persisted per-user state and is now honoured by high-risk reauthentication, but successful operator PIN sign-in currently enables it as part of the existing login workflow. There is no independent Settings toggle for affirmative enrolment/withdrawal. | Add an explicit per-user biometric opt-in/disable control, with explanatory consent text and an audited change event. Until then, document the current behaviour during commissioning. |
| Medium | The Keystore storage-wrap key does not yet require a fresh user-authentication interval. | Assess `setUserAuthenticationRequired(true)` with a bounded validity window and clear field-operational UX; do not enable it without handset testing because it may affect recovery and background workflows. |
| Medium | External Capacitor patch updates were identified for camera and filesystem packages. | Apply in a separate dependency-maintenance change, re-run Android release validation, and review upstream release notes/CVEs. |
| Medium | The CSP retains `'unsafe-inline'` only for existing in-app inline styles and `data:` only for local decrypted evidence preview rendering. | Refactor to non-inline styles where feasible; preserve a test for evidence preview functionality before tightening further. |
| Low | The build reports upstream Java/Kotlin deprecation and unchecked-operation warnings in third-party plugins. | Track upstream Capacitor/Cordova/plugin releases; do not suppress compiler warnings globally. |

## Release decision

**Engineering recommendation: conditional approval for signed physical-device acceptance.** The source changes, automated verification, Android asset synchronization, and minified release build passed. The remaining gate is not a code-build defect: it is the documented physical-device acceptance sequence, plus use of an approved production signing key. This preserves CrimeGraph’s offline-first and zero-cloud model while introducing a materially stronger Android release posture.

## References

[1] [OWASP Cheat Sheet Series — Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

[2] [Android Developers — Network security configuration](https://developer.android.com/privacy-and-security/security-config)

[3] [OWASP Mobile Application Security Verification Standard and Mobile Application Security Testing Guide](https://mas.owasp.org/MASVS/)
