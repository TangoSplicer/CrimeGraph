# Node Deployment, Operator Removal, and Mobile UI Repair

**Date:** August 18, 2026
**Status:** Fixed in source, verified, and synchronized into the Android project.

## Findings

The failed **Deploy Node**, **New Operation**, and operator-removal actions shared the same Android SQLite bridge failure mode. Although the transaction helper had been introduced, some existing case-store callbacks still closed over the base database connection. Their `run`, `execute`, and audit-ledger writes retained the bridge default of `transaction = true`, which attempted a nested auto-transaction while an explicit native transaction was open.

The node editor also placed its deployment action after all metadata and evidence-template fields in the scrollable content. On a phone, long template content could leave the action below the visible viewport or near system gesture space, making it appear unavailable.

## Repairs

The shared transaction helper now temporarily scopes legacy base-connection write methods to `transaction = false` for the duration of an explicit native transaction and restores the original methods before commit or rollback. This covers callbacks that directly use `db` and therefore repairs node deployment and user removal in addition to the previously corrected operator and case workflows.

The node editor has been converted to a standard form submit flow. The field and evidence-template content remains independently scrollable, while the **Deploy Node** / **Submit for supervisor review** action is now a persistent footer. The footer has safe-area padding, remains outside the scrolling template fields, disables repeated submissions while a write is in progress, and renders a visible inline failure message when a node cannot be created.

## Validation

| Check | Result |
|---|---|
| Transaction test for scoped callbacks that use the base connection | Passed |
| Operator lifecycle regression tests | Passed |
| Case-store and node workflow regression tests | Passed |
| Node-editor mobile action-bar structural tests | Passed |
| Full automated verification | 21 test files and 106 tests passed |
| TypeScript validation and production bundle | Passed |
| Android synchronization | Passed |

## Required Android retest

Install a newly built APK; an already-installed package does not contain these changes. Then verify the following sequence:

1. Create a new operation from **HOME** and confirm no transaction alert appears.
2. Open the operation, use **Add Intelligence Node**, enter a label, and confirm the persistent **Deploy Node** button remains visible above the device gesture area while scrolling template fields.
3. Deploy a standard node and confirm the graph workspace opens with the new record. If an error occurs, confirm it is displayed in the editor rather than disappearing silently.
4. In **SETTINGS → Operator Lifecycle**, supply a required disablement reason and disable a non-administrator operator. The lifecycle action should complete and add an audit record without a transaction alert.

> The persistent action footer is intentionally separate from the evidence-template scroll region. It keeps the final creation action reachable without pre-filling evidence facts or weakening the required provenance and review controls.
