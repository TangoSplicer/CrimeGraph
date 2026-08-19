# CrimeGraph Physical-Device Testing and Commissioning Guide

**Document owner:** Manus AI

**Status:** Release-gating protocol

**Applies to:** CrimeGraph Android release candidates built from `main`

**Companion record:** [`DEVICE_ACCEPTANCE.md`](./DEVICE_ACCEPTANCE.md)

## Purpose and release boundary

This guide defines the physical-device test programme required before CrimeGraph is issued beyond controlled testing. It complements, rather than replaces, automated TypeScript, unit, integration, archive-fuzz, application-shell, production-web-build, Android-release-build, and GitHub CI validation. Android distinguishes host-side tests from instrumented device tests; real-device testing is required where the result depends on Android hardware, OS policy, a Keystore implementation, permissions, biometrics, or Bluetooth Low Energy (BLE). [1]

> **Release rule:** An APK is not an operational release candidate until every mandatory applicable test has passed on the approved device matrix, the evidence pack is complete, and a named release owner has approved the exception register. A test marked *not applicable* requires a written reason and release-owner acceptance.

| Test tier | Purpose | Approval gate |
|---|---|---|
| Automated verification | Detect source, integration, cryptographic, and build regressions before installation. | Required before any device test. |
| Physical functional testing | Prove Android installation, launch, SQLite commissioning, permissions, security prompts, and workflows on real hardware. | Required for a candidate release. |
| Operational acceptance | Prove RBAC, evidence, archive, dossier, briefing, device assurance, and Tactical Mesh behavior using test data. | Required before controlled operational use. |
| Security acceptance | Prove local authentication, session handling, screenshot protection, backup exclusion, release posture, and denied paths. | Required before distribution. |

## Safety, privacy, and preparation

Use **synthetic, non-sensitive test material only**. The secure-wipe exercise destroys the encrypted local database, protected media, local device secret, users, and hash-linked audit ledger. Never execute it on an operational device. Place every test device in airplane mode after installation unless a test explicitly requires BLE, local file selection, or controlled MDM inspection. CrimeGraph has no cloud, telemetry, or background data-transfer requirement; an unexplained network request is a test failure requiring investigation.

Android testing guidance distinguishes functional, compatibility, accessibility, and performance testing; this programme retains all four categories because operational security cannot be inferred from a single successful functional run. [1] The biometric controls accept strong biometric authentication only and check device availability before activation; Android defines `BIOMETRIC_STRONG` as a Class 3 biometric capability. [2]

| Precondition | Required evidence |
|---|---|
| Candidate identity | Git commit SHA, GitHub workflow URL, APK file name, APK SHA-256, package name, version name, and version code. |
| Device identity | Manufacturer, model, Android version/API level, security-patch level, storage capacity, available storage, and enrolled strong-biometric modality. |
| Test identities | One administrator, one analyst, one supervisor, one field operator, and one read-only user, each with a distinct synthetic badge and credential. |
| Test case | One local active operation, synthetic nodes, notes, media, evidence, an exhibit, a field task, a playbook milestone, and a local lead. |
| Evidence pack | Screenshots or screen recordings where permitted, audit entries, event timestamps, relevant file digests, device assurance capture, and a completed pass/fail log. |
| Second handset | Required for BLE pairing/discovery/revocation. It must have a different device identity and be independently recorded. |

## Device matrix

Select actual supported handsets representing the following matrix. The release owner may substitute equivalent devices only when the substitution is recorded and all mandatory hardware capabilities remain represented.

| Matrix ID | Required representative | Why it is required | Minimum tests |
|---|---|---|---|
| DM-01 | Android API 24–29 device or managed test equivalent | Exercises the supported minimum platform family and legacy permission behavior. | All tests except features unavailable on the device. |
| DM-02 | Android API 30–33 device with fingerprint or strong face biometric | Exercises scoped Bluetooth/location permission behavior and strong-biometric enrolment. | All tests. |
| DM-03 | Android API 34–36 device with current security patch | Exercises current permission, storage, screenshot, and background behavior. | All tests. |
| DM-04 | Device reporting hardware-backed Keystore protection | Confirms device-assurance wording and Keystore key-level behavior without inferring StrongBox where Android does not state it. | PT-03, PT-08, PT-15, PT-24. |
| DM-05 | Device with BLE hardware | Proves Tactical Mesh discovery and trust workflow. | PT-26 through PT-29. |
| DM-06 | Accessibility-enabled device | Confirms usable navigation, readable system state, and no unintended privilege action. | PT-31 through PT-33. |

## Evidence-pack record

Complete one record per handset, per candidate APK. Attach approved evidence using case-free, non-sensitive identifiers.

| Field | Value |
|---|---|
| Test record ID | |
| Candidate commit / workflow URL | |
| APK SHA-256 / signer certificate digest | |
| Device model / serial asset ID | |
| Android version / API / security patch | |
| Biometric modality / Class 3 availability | |
| Tester / security reviewer / date / timezone | |
| Overall outcome | Pass / fail / approved time-bounded exception |
| Open defects / owner / remediation commit | |

## Test execution sequence

The existing twenty **DA** tests remain mandatory. The following **PT** tests add release-readiness, physical security, usability, and enhancement-specific verification. Record the precise user role, timestamp, expected result, actual result, evidence identifier, and test disposition for every row.

### A. Installation, launch, and commissioning

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| PT-01 | Verify APK SHA-256 and signer against the approved candidate record. Install on a clean physical device. | Package identity matches; installation completes without debug-only prompt or unexpected permission grant. | APK hash, signer, install screen, device record. |
| PT-02 | Launch from the Android launcher, force-stop, relaunch, then reboot the handset and relaunch. | CrimeGraph reaches commissioning or sign-in; no crash loop, blank permanent screen, or unhandled native error occurs. | Launch/relaunch timestamps and screenshots. |
| PT-03 | Commission with a 12+ character synthetic master password, restart, and sign in as administrator. | Device-bound local storage is initialized; encrypted SQLite reopens; master password is never displayed or logged. | Successful session screenshot and device-assurance capture. |
| PT-04 | Deny a requested camera, notification, Bluetooth, or location permission where the handset requests it; repeat the relevant workflow after granting only the justified permission. | Denial produces a clear, recoverable state without elevated access or crash. The workflow succeeds only after the appropriate permission is granted. | Permission-state screenshots and workflow result. |
| PT-05 | Enable airplane mode after installation and repeat normal launch, sign-in, graph access, review, and local search. | Core local operation works offline; no cloud-login, telemetry, or remote-data dependency is introduced. | Airplane-mode indicator and functional screenshots. |

### B. Authentication, session, and biometric preference

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| PT-06 | Provision analyst, supervisor, field, and read-only operators. Attempt valid and invalid PIN sign-in for each. | Valid credentials establish only the intended role; invalid PINs fail without revealing credential details. | Role session screenshots and failed-login record. |
| PT-07 | As an operator who has never enrolled biometric use, sign in with PIN and inspect **System Settings → Strong biometrics**. | The preference is **Disabled** by default. PIN reauthentication remains available; no biometric sign-in is silently enabled. | Settings screenshot and audit ledger check. |
| PT-08 | On a Class 3-capable handset, choose **Enable** under Strong biometrics and complete the native biometric confirmation. Sign out, then use biometric sign-in. | A system strong-biometric prompt is shown; activation succeeds only after confirmation; subsequent biometric sign-in works for the same active operator. The enable event is auditable. | Prompt capture where permitted, settings state, sign-in outcome, audit event. |
| PT-09 | Choose **Disable** under Strong biometrics, complete the requested high-risk reauthentication, sign out, and attempt biometric sign-in. | Preference is removed only after fresh high-risk confirmation; biometric sign-in is unavailable afterward; normal PIN sign-in remains available. The disable event is auditable. | Settings state, reauthentication method, blocked biometric attempt, audit event. |
| PT-10 | Repeat PT-08 on a handset with no Class 3 biometric enrolled or with hardware unavailable. | Activation is refused with a clear message; no device-credential fallback is substituted for the biometric confirmation. | Device configuration and failure message. |
| PT-11 | Trigger a high-risk action—operator disable, PIN reset, field-assignment removal, exhibit movement, peer confirmation/revocation, dossier/export, or wipe—first with biometric disabled and then enabled. | Disabled preference uses the credential reauthentication path. Enabled preference uses strong biometrics when available; cancellation or failure blocks the action. | Reauthentication method and resulting audit entries. |
| PT-12 | Background the app without an intentional export, return, then separately leave it idle for five minutes. | Both conditions terminate the active session and require fresh authentication. | Timing evidence and relaunch result. |

### C. Storage, visibility, and release security

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| PT-13 | Capture a synthetic image and video; force-stop/restart; reopen the evidence record. | Protected media persists only through the encrypted local workflow and retains its recorded SHA-256 provenance digest. | Before/after digest and restart result. |
| PT-14 | Open sensitive case material, then inspect Android Recents, attempt a device screenshot, and initiate screen recording according to local policy. | Sensitive content is not exposed through the expected screenshot/recording path. Record exact device/OS behavior; any captured content is a release-blocking security finding. | Recents/screenshot result and device details. |
| PT-15 | Open **System Settings → Device assurance** as administrator and supervisor, then as field and read-only. Compare app and OS values with the handset. | The panel reports actual available local posture, does not overstate key protection, and is denied to field/read-only roles. | Role-by-role screenshots and expected-value comparison. |
| PT-16 | Inspect backup and device-transfer posture with approved Android/MDM tools. Attempt a device-to-device transfer only in a non-sensitive test environment if policy permits. | CrimeGraph application data is excluded as declared by the installed manifest and extraction rules. | Tool/MDM output. |
| PT-17 | Inspect release behavior using approved tooling: debug status, WebView remote inspection availability, cleartext policy, and unneeded permissions. | Release posture reflects a non-debug build, WebView debugging disabled, cleartext denied, and only appropriate scoped permissions. | Tool output and manifest/build details. |

### D. RBAC and end-to-end operational workflows

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| PT-18 | As analyst, create/import a synthetic operation, assign a field operator, and create a structured task. Sign in as field. | Field user sees only its assigned operation and task; it cannot create/import cases or access unassigned cases. | Analyst and field screenshots, audit entries. |
| PT-19 | Remove the field assignment with a reason, refresh or re-authenticate the field session, and attempt to open the former graph. | The operation disappears and cannot be loaded by the removed field account. | Removal reason, denial result, audit entry. |
| PT-20 | As field, capture an observation and evidence offline. As supervisor, approve one item and return another. As field, correct and resubmit the returned item. | Submission, review decision, correction, and resubmission retain explicit actor, time, and audit trace. | Node IDs, review notes, audit verification. |
| PT-21 | As analyst, use **Analysis** after recording a pending item, a returned item, an evidence node without provenance, a blocked milestone, an overdue field task, an open lead, and an unlinked note. | **Case readiness cues** list the exact local state and explanation for each condition. It provides no score, rank, prediction, automatic action, or person-level risk assessment. | Analysis capture and affected record IDs. |
| PT-22 | Clear or resolve the synthetic cues from PT-21, reopen Analysis, and refresh the workspace. | Resolved or removed states no longer appear as applicable cues; unrelated case data is not altered. | Before/after captures and audit entries where actions are auditable. |
| PT-23 | Exercise playbook milestones, lead promotion, saved local queries, evidence derivatives, observation context, exhibit QR/custody, and reproducible briefings. | Existing RBAC, provenance, stated-source, high-risk authentication, digest, and explanation controls continue to work without behavioral regression. | DA-15 through DA-20 evidence plus release-specific test record. |

### E. Archives, dossiers, and integrity

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| PT-24 | Create a current encrypted `.cgarchive`, import it into a clean test installation, and verify content. Attempt an altered archive and a deliberately malformed oversized file. | Current archive import succeeds. Altered, unsupported, malformed, or oversized envelopes fail closed without partially admitting data. | Archive digest, import result, rejection messages. |
| PT-25 | Verify a legacy compatible archive only when an approved retention case requires it; then create a fresh current-format export of the admitted test case. | Approved legacy compatibility is bounded; a new archive uses the current stronger work factor. | Legacy approval reference, new export metadata, test outcome. |
| PT-26 | Prepare intact and tampered forensic dossiers with and without authorized redaction profiles; verify on a separate test installation. | Intact signed dossiers verify. Modified manifests/signatures fail. Redacted fields are represented as authorized redactions rather than silently altered source records. | Manifest digest, recipient verification result, tamper rejection. |

### F. Tactical Mesh and two-device testing

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| PT-27 | On two BLE-capable test devices, enable Bluetooth and open Tactical Mesh. Start discovery on one device, then the other. | Settings accurately reports ready, active, idle, denied, or error state. Discovery emits no case material. | Both device screens, Bluetooth state, timestamps. |
| PT-28 | Create and exchange a pairing invitation. Compare the displayed short authentication code in person before confirmation. | Invitation expiry and signature verification operate as displayed; confirmation requires high-risk reauthentication. | Device fingerprints, code-comparison record, audit entries. |
| PT-29 | Revoke local trust on one device, restart both devices, and attempt to use the revoked relationship. | Revocation persists locally and prevents future use of the trust record. No case data is transferred during this test. | Revocation event, restart result, audit entry. |
| PT-30 | Disable Bluetooth or deny the required permission while discovery is running. | Discovery stops or reports a recoverable clear state; the rest of the app remains usable and no sensitive error detail is shown. | State message and recovery result. |

### G. Usability, accessibility, resilience, and recovery

| ID | Procedure | Expected result | Evidence |
|---|---|---|---|
| PT-31 | Use Android large text, display scaling, dark mode, and portrait/landscape rotations where the device permits them. Inspect bottom action controls, top controls, dialogs, and the persistent navigation bar. | Essential controls remain visible, tappable, and not obscured by system navigation or cutouts. | Screenshots for each configuration. |
| PT-32 | Enable TalkBack or the approved accessibility service. Navigate commissioning, sign-in, settings, role guide, evidence capture, and analysis. | Labels and status messages identify controls and state. No sensitive action is triggered by focus/navigation alone. | Accessibility result and known limitations. |
| PT-33 | Constrain free storage until Device assurance shows warning/critical posture, then attempt non-destructive navigation and a small metadata action. | Storage warning is clear; the app remains stable; no integrity claim is made for an action that fails. Restore free space afterward. | Storage measurement, UI state, recovery result. |
| PT-34 | Execute secure wipe on a dedicated test device, relaunch, recommission, and complete administrator sign-in. | Prior local data and protected media cannot be reopened; the app returns to clean commissioning. | Pre-wipe reference, wipe confirmation, post-wipe state. |

## Failure management and exceptions

A failure in encrypted commissioning, protected media, RBAC, field-case isolation, high-risk reauthentication, biometric opt-in/withdrawal, secure wipe, dossier/archive integrity, screenshot protection, backup exclusion, device-assurance truthfulness, or Tactical Mesh trust revocation is **release-blocking**. Record the issue with reproduction steps, exact handset configuration, test data identifier, relevant application/audit state, impact, owner, and planned remediation commit.

An exception may be approved only when it is time-bounded, identifies a compensating control and risk owner, applies to a named device/configuration, and is signed by the release owner and security reviewer. An exception cannot convert a release-blocking cryptographic, authorization, integrity, or data-exposure failure into a pass.

## Completion and sign-off

The release owner should review the automated validation record, the per-device evidence packs, the exception register, and the existing DA protocol. The OWASP MASTG provides the relevant mobile testing areas, including storage, local authentication, platform interaction, build settings, and resilience. [3] The guide’s device-access-security testing material reinforces the need for a documented policy and test evidence rather than inferred assurance. [4]

| Role | Name | Approval reference | Date / timezone |
|---|---|---|---|
| Physical-device tester | | | |
| Security reviewer | | | |
| Operational acceptance owner | | | |
| Release owner | | | |

## References

[1] [Android Developers, *Fundamentals of testing Android apps*](https://developer.android.com/training/testing/fundamentals)

[2] [Android Developers, *Show a biometric authentication dialog*](https://developer.android.com/identity/sign-in/biometric-auth)

[3] [OWASP, *Mobile Application Security Testing Guide*](https://mas.owasp.org/MASTG/)

[4] [OWASP, *MASTG-TEST-0012: Testing the Device-Access-Security Policy*](https://mas.owasp.org/MASTG-TEST-0012/)
