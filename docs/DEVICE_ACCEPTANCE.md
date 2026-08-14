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

## Pass criteria and exceptions

All required tests must pass. Any failure blocks a production distribution decision unless the release owner records a time-bounded exception, compensating control, risk owner, and remediation commit. Do not accept an exception for a failure of encrypted commissioning, protected media, access control, high-risk confirmation, or secure wipe.

## Sign-off

| Role | Name | Signature / approval reference | Date |
|---|---|---|---|
| Device tester | | | |
| Security reviewer | | | |
| Release owner | | | |
