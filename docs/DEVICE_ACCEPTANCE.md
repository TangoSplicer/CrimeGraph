# CrimeGraph Physical-Device Acceptance Protocol

**Purpose:** This protocol provides the mandatory physical-device evidence required before an authorized release owner distributes CrimeGraph beyond controlled testing. It supplements automated CI; it does not replace it.

> **Scope boundary:** Complete this protocol on a non-production test device. The secure-wipe test intentionally destroys the encrypted database, device-held storage secret, operator records, audit ledger, and locally stored evidence.

## Preconditions

| Requirement | Required state |
|---|---|
| Build | Install a debug or release candidate APK produced from a green `main` workflow. Record the commit SHA and APK artifact name. |
| Device | Supported Android device, Android version, model, and security-patch level recorded. |
| Connectivity | Run the principal test steps with airplane mode enabled after installation to confirm offline operation. |
| Test identities | One administrator, one analyst or supervisor, and one field operator with distinct badge IDs. |
| Test case | One active local operation with a non-sensitive test reference. |
| Release owner | An authorized person records pass/fail evidence and owns any approved exception. |

## Acceptance record

| Field | Value |
|---|---|
| Device model / Android version | |
| App version / commit SHA | |
| APK artifact / SHA-256 | |
| Tester / date / timezone | |
| Administrator badge | |
| Analyst or supervisor badge | |
| Field badge | |
| Overall result | Pass / fail / approved exception |

## Required tests

| ID | Procedure | Expected result | Evidence to record |
|---|---|---|---|
| DA-01 | Install on a new device and complete commissioning with a 12+ character master password. Restart the app. | A device-bound storage secret is created; encrypted SQLite opens; administrator sign-in succeeds after restart. | Screenshot of successful administrator session; device and build details. |
| DA-02 | As administrator, provision a field operator. Open **Operator lifecycle**, reset its PIN, change its role, disable it with a reason, then reinstate it with a reason. | Every change requires high-risk confirmation; disabled PIN and biometric access fail; reset/role change revoke biometric access; all actions are present in the audit ledger. | Badge, timestamps, lifecycle audit entries, and pass/fail for blocked sign-in. |
| DA-03 | As analyst, create or import an active local operation. Assign the field operator using **Assign field** and add a task note. Sign in as the field operator. | The field dashboard shows only its assigned operation, the assignment note, and field-capture guidance. It cannot create or import an operation. | Case reference, field dashboard screenshot, and assignment audit entry. |
| DA-04 | Remove the assignment with a reason. Refresh the field session and attempt to open the prior graph. | The operation disappears from the field queue and the graph cannot be loaded by that field account. | Removal reason, audit entry, and blocked-access result. |
| DA-05 | Reassign the field operator. In the assigned graph, capture an observation and a camera image while offline. Restart the app. | The submission is pending review; image media remains available from protected `.cgm` storage; provenance retains the SHA-256 attachment digest. | Case/node identifiers, provenance screenshot, restart result. |
| DA-06 | As supervisor, open **Review**, approve one submission and return another with a correction note. As field operator, correct and resubmit the returned record. | Review status and comments are visible to the field operator; returned work can be resubmitted; decisions and resubmission appear in the audit ledger. | Node identifiers, review notes, audit-chain verification result. |
| DA-07 | Background the app without starting an intentional export, then return. Separately leave the app idle for five minutes. | Both tests require a new sign-in. | Timing result and authentication method used for re-entry. |
| DA-08 | Test verified device pairing and revocation with a second test device. | The invitation expires after ten minutes; short authentication codes require in-person comparison; confirmation and revocation require high-risk authentication; no case data transfers. | Both device fingerprints, test result, and audit entries. |
| DA-09 | On the test device only, invoke **Wipe all data**, complete high-risk confirmation, and relaunch. | Protected database and local attachments cannot be reopened; a fresh commission is required. | Pre-wipe case reference, confirmation method, and post-wipe relaunch result. |
| DA-10 | Inspect Android backup/transfer configuration using approved device-management or platform tooling. | CrimeGraph application data is excluded from cloud backup and device transfer according to the installed manifest and extraction rules. | Tool output or MDM/platform evidence. |
| DA-11 | As an analyst, supervisor, or administrator, select an active field assignee and create a structured task card with an objective, checklist, context note, and optional due window. Sign in as that field operator. Complete one task with a handoff note and return a second task with an inability reason. | Task cards appear only for the assigned field operator and operation. Completion or return is written to the audit ledger. A field operator cannot complete another operator’s task or create a case. | Task identifiers, field queue screenshots, handoff note or inability reason, and audit entries. |
| DA-12 | As a field operator, select **Evidence** and exercise each guided intake class: image, video, document, physical exhibit, message, device, location observation, and witness material. Capture a new field photograph for the image class. | Guidance and editable metadata prompts change by class, but source, acquisition, custody, verification, and conclusions remain operator-entered. The protected photo retains a SHA-256 digest. | Template screenshots, one completed provenance record, and attachment digest. |
| DA-13 | As a supervisor, apply a data marking, prepare a redacted forensic dossier with a stated purpose and recipient, then verify the export on a receiving test installation. Attempt to alter a dossier manifest before import. | The disclosure register records the dossier intent and manifest digest. An intact signed dossier is verified before admission; a modified manifest or signature is rejected. | Dossier identifier, disclosure-register entry, verification receipt, and tamper-rejection result. |
| DA-14 | As an administrator or supervisor, open **System Settings → Device assurance** on the installed Android application and press **Refresh**. Compare the displayed values with the device, application build, and approved platform/MDM evidence. | The read-only report shows actual app and Android version, database-open time, protected-media count, audit-chain result, free-space warning state, backup exclusion, biometric readiness, storage-secret presence, and the Android-reported key-security level. If the OS cannot distinguish TEE from StrongBox, it states that limitation rather than guessing. Field and readonly accounts cannot view the panel. | Screenshot of the panel, device model and Android version, key-level wording, audit-chain result, and role-based access result. |
| DA-15 | As an analyst, create a case playbook milestone, mark a second milestone blocked with a stated reason, and complete a third with a completion note. As the assigned field operator, record a local lead. Return to an analyst account, review the lead, promote it to a non-evidence intelligence type, and inspect the linked node. | Only administrators, supervisors, and analysts can plan milestones or dispose/promote leads. A field operator can record a lead only in an assigned case and cannot promote it. The promoted node retains a lead reference and stated source metadata; lead, milestone, state, and promotion actions appear in the hash-linked ledger. No remote submission or transfer occurs. | Screenshots of the playbook and lead register, field denial result, lead/node identifiers, source metadata, and audit-chain entries. |

## Pass criteria and exceptions

All required tests must pass. Any failure blocks a production distribution decision unless the release owner records a time-bounded exception, compensating control, risk owner, and remediation commit. Do not accept an exception for a failure of encrypted commissioning, protected media, access control, high-risk confirmation, secure wipe, forensic dossier integrity, lead-promotion traceability, or a device assurance report that overstates hardware protection.

## Sign-off

| Role | Name | Signature / approval reference | Date |
|---|---|---|---|
| Device tester | | | |
| Security reviewer | | | |
| Release owner | | | |
