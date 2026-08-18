# Android Case Creation and Tactical Mesh Repair

**Date:** August 18, 2026
**Status:** Fixed in source, verified, and synchronized into the Android project.

## Observed device issues

The supplied device screens showed three related conditions. Operator provisioning had succeeded for one account, but subsequent attempts exposed a raw SQLite unique-constraint message. Creating a new operation produced the same `no current transaction` error previously observed in provisioning. Tactical Mesh did not visibly distinguish an inactive radio, a ready radio, active discovery, or an initialization failure.

## Root cause and repair

The Android SQLite bridge treats the `transaction` argument of `run`, `execute`, and `executeSet` as `true` by default. An explicit native transaction therefore conflicted with these per-call auto-transactions whenever an audited workflow wrote a business record and then appended an audit entry.

The transaction helper now creates a scoped write context that forces all writes to `transaction = false` while the outer native transaction is active. It also temporarily routes legacy callbacks that close over the base connection through that scoped context. This corrects the issue for case creation and all audited case-store workflows, operator lifecycle management, verified pairing, sync-conflict resolution, and inbound synchronization.

The provisioning flow now checks for an existing badge before writing. A duplicate is reported as a clear local condition—for example, `Badge WYP-001 is already provisioned on this device. Choose a different badge ID.`—rather than exposing raw SQLite error code 2067.

## Tactical Mesh changes

The Tactical Mesh panel now has three explicit states:

| State | Meaning |
|---|---|
| `INACTIVE` | Bluetooth LE initialization failed or has not been requested. The panel shows the specific bridge, Bluetooth, permission, advertising, or timeout reason. |
| `READY — IDLE` | The device is locally advertising a generic CrimeGraph beacon. Discovery scanning has not started. |
| `DISCOVERY ACTIVE` | A local BLE scan is running for the CrimeGraph service identifier. Peer labels and signal strength may be displayed. No case content is transferred. |

The Bluetooth adapter now returns specific failure messages instead of reducing initialization failure to an uninformative boolean. Messages instruct the operator to install the current Android build, enable Bluetooth, and grant the Android **Nearby devices** permission when applicable.

## Verification and installation

| Check | Result |
|---|---|
| Full automated suite | 20 test files and 103 tests passed |
| Native transaction scoped-write coverage | Passed |
| Case-store regression coverage | Passed |
| Tactical Mesh bridge, active-state, and failure-state coverage | Passed |
| TypeScript validation and production web bundle | Passed |
| Android synchronization | Passed; the corrected bundle and Bluetooth plugin are present in the Android project |

The changes require a freshly built and installed Android package. After installation, use this device acceptance sequence:

1. Sign in as the administrator, open **HOME**, and create a new operation with a reference and title. The operation should appear in the active list without a database transaction alert.
2. In **SETTINGS**, provision an unused badge. If a previously used badge is entered, the app should show the clear duplicate-badge message rather than a raw constraint error.
3. In **SETTINGS → Tactical Mesh & Sync Conflicts**, select **Initialize Radio Hardware**. The status panel must show either `READY — IDLE` or `INACTIVE` with an actionable reason.
4. If ready, select **Start Tactical Scan**. The badge must change to `DISCOVERY ACTIVE`; selecting **Stop Scanning** must return the radio to `READY — IDLE`.

> Tactical Mesh Discovery is intentionally proximity-only. It advertises and scans generic local BLE service beacons but never transfers, authorizes, or exposes case intelligence.
