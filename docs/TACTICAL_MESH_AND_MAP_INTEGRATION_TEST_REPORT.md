# Tactical Mesh and Map-Creation Integration Test Report

**Author:** Manus AI

**Execution date:** August 19, 2026

**Release under test:** [`1f7347d`](https://github.com/TangoSplicer/CrimeGraph/commit/1f7347d701b862d350751b8e1d506cb9b6b97650) — `feat: harden offline workflows and mobile operations`

**Verdict:** **PASS — 35 of 35 integration and regression vectors passed.** The focused run completed in 715 ms, followed by a successful TypeScript check. A subsequent production build, Android synchronization, and GitHub Android workflow for the release commit also completed successfully.[1] [2]

> **Scope boundary.** This report covers the local integration and regression layer: the Bluetooth LE bridge contract, Tactical Mesh state handling, native-safe SQLite transaction behavior, and map-creation persistence/audit workflow. It does not represent a physical two-handset radio-range test. That final acceptance activity remains necessary because this execution environment has no Android Bluetooth hardware.

## 1. Test Configuration and Evidence

The test run used Vitest 2.1.9 against three suites: `mesh.test.ts`, `meshAndTransaction.test.ts`, and `caseStoreSecurity.test.ts`. It exercised controlled Bluetooth-adapter, database, audit-ledger, authentication, and storage fixtures. The dedicated map-creation integration assertion was introduced for the run, executed successfully, and then removed so the local tree remained byte-for-byte aligned with the audited GitHub deployment after verification.

| Dimension | Configuration / result |
|---|---|
| Execution command | `npx vitest run src/capacitor/mesh.test.ts src/stores/meshAndTransaction.test.ts src/stores/caseStoreSecurity.test.ts --reporter=verbose && npm run typecheck` |
| Test files | 3 passed |
| Test cases | 35 passed |
| Mesh-adapter vectors | 4 |
| Mesh state and transaction vectors | 7 |
| Map-creation and secure case-workflow vectors | 24 |
| TypeScript check | Passed |
| Production build and Android synchronization | Passed after the focused run |
| GitHub Android workflow for deployed commit | Completed successfully |

## 2. Tactical Mesh Validation Vectors

The Tactical Mesh vectors validate the local Bluetooth LE adapter and the Zustand-based discovery state machine. They deliberately verify **presence discovery only**: no test path transfers case material, authorizes a peer, or creates a synchronization session merely by observing a beacon.

| ID | Vector | Stimulus / fixture | Expected control | Outcome |
|---|---|---|---|---|
| TM-01 | Missing native bridge | `window.bluetoothle` absent | Initialization fails closed with an explicit installed-build / bridge message | Pass |
| TM-02 | Callback-first BLE lifecycle | Stub adapter exposes initialize, peripheral initialization, service add, advertising, scan, and stop callbacks | Calls use Cordova callback-first ordering with the CrimeGraph service UUID and produce a peer observation | Pass |
| TM-03 | Disabled radio state | Adapter returns `status: disabled` during initialization | Store/adapter reports Bluetooth radio as not ready; it does not claim active mesh state | Pass |
| TM-04 | Scan error propagation | Adapter invokes scan error callback with permission-denied message | Error is propagated rather than leaving scan state ambiguous | Pass |
| TM-05 | Discovery happy path | Ready adapter emits repeated beacon results for one nearby device | Hardware initializes, scan enters active state, peer is deduplicated, and stopping ends scanning without transfer | Pass |
| TM-06 | Discovery precondition | Operator requests scan before radio initialization | Scan is blocked; state exposes an explicit initialize-first status | Pass |

### 2.1 Tactical Mesh control assertions

The executed vectors prove four operational properties. The app reports absent, disabled, and permission-related Bluetooth failures as actionable state rather than silently returning a false-ready value. It follows the installed Cordova plugin’s callback-first calling convention for initialization, peripheral advertising, service creation, scan start, and scan stop. It only scans for the CrimeGraph service UUID. Finally, it deduplicates repeated radio observations by device identity before exposing peers to the interface.[3] [4]

The test suite does not treat the presence of a BLE beacon as device trust. Trust, authenticated pairing, replay protection, signed delta validation, and synchronization remain separate workflows. This maintains the requirement that discovery cannot itself widen access to local case intelligence.

## 3. Native-Safe Transaction Validation Vectors

Five transaction vectors were executed alongside Tactical Mesh because both map creation and secure offline workflows depend on audited SQLite writes. These vectors specifically target the Android bridge behavior that formerly emitted `Cannot perform this operation because there is no current transaction.`

| ID | Vector | Stimulus / fixture | Expected control | Outcome |
|---|---|---|---|---|
| TX-01 | Native lifecycle selection | Mock connection supports native begin, commit, and rollback methods | Helper uses native bridge lifecycle APIs rather than raw SQL transaction control | Pass |
| TX-02 | Scoped writes | Callback writes with `run`, `execute`, and `executeSet` inside an explicit transaction | Each inner write disables per-call auto-transactioning (`transaction = false`) | Pass |
| TX-03 | Legacy base connection | Callback closes over the base DB object rather than accepting the scoped connection | Helper temporarily scopes base writes safely and restores originals after completion | Pass |
| TX-04 | Rollback preservation | Callback throws while a transaction is active | Rollback is attempted and original error remains observable | Pass |
| TX-05 | Browser compatibility | Fixture omits native lifecycle methods | Helper uses the controlled SQL fallback appropriate to the browser SQLite test bridge | Pass |

> **Root-cause coverage.** The key Android regression was a nested transaction lifecycle: a store opened an explicit native transaction and a subsequent write auto-opened another. TX-02 and TX-03 directly validate the corrected boundary by proving that both scoped callbacks and legacy base-connection callbacks issue inner writes with auto-transactions disabled.[4]

## 4. Map-Creation Integration Vector

One direct map-creation integration vector was introduced for this fresh run. The controlled fixture represented an active supervisor, a database connection, the audited transaction wrapper, the immutable audit append helper, and the subsequent local-case reload.

| ID | Vector | Validation steps | Expected result | Outcome |
|---|---|---|---|---|
| MAP-01 | Create map / operation through audited transaction | Invoke `addCase('Tactical Mesh Exercise', 'MAP-INT-2026', 'operation', 'OFFICIAL')`; inspect transaction invocation, `cases` insert parameters, audit record, and post-create reload | A new active operation is written in the scoped transaction, audit event `CREATE_CASE` is appended by the acting supervisor, and the reloaded case list contains `MAP-INT-2026` | Pass |

The vector confirms that normal map creation follows the repaired transaction path rather than relying on a screen-only change. It validates the case reference, title, type, active status, classification, timestamps, audit attribution, and the reload behavior used by the Operations screen after deployment. The test did not seed or persist actual case data on a user device.

## 5. Supporting Secure Case-Workflow Regression Vectors

The other 23 map-adjacent vectors were run as protective regression coverage. They ensure that the new map-creation transaction path did not weaken or regress evidence integrity, access boundaries, field workflows, or audit behavior.

| Family | Cases | Specific validation vectors | Result |
|---|---:|---|---|
| Evidence media migration | 2 | Encrypt legacy attachment and update provenance/audit; skip already-protected envelope | Pass |
| Review decision and secure wipe | 3 | Record supervisor return; reject commentless return; reauthenticate and wipe protected material/state | Pass |
| Case assignment and field work | 5 | Filter assignments; validate field operator; block unassigned graph load; create audited task; prevent cross-operator completion | Pass |
| Observation context | 2 | Store source, precision, and audit; deny field user before read/write | Pass |
| Exhibit custody | 2 | Reauthenticated movement with audit; deny field user before movement access | Pass |
| Evidence derivatives | 2 | Source-bound derivative digest; deny field user before source read | Pass |
| Saved graph queries | 2 | Persist explicit local filters with audit; deny field user before storage operation | Pass |
| Playbook and lead register | 3 | Create milestone/audit; promote manager-reviewed lead; deny field user before lead read | Pass |
| Controlled markings | 2 | Persist normalized marking/audit; reject malformed marking before write | Pass |

These checks are directly relevant to map creation because a newly created operation becomes the parent boundary for nodes, evidence, field assignments, markings, review records, and immutable ledger entries. They show that the repaired transaction mechanism did not simply make inserts succeed; it preserved failure-closed authorization and evidential controls across adjacent case workflows.[5]

## 6. Coverage Assessment

| Requirement | Evidence provided by the 35-vector run | Assessment |
|---|---|---|
| Mesh initialization is observable | Missing bridge and disabled radio return explicit errors | Covered |
| Mesh discovery state is observable | Initialize-first state, active scan, deduplication, stop action, and scan-error behavior tested | Covered |
| Mesh does not transfer intelligence merely through discovery | Discovery fixtures only exchange generic peer metadata; transfer path is not invoked | Covered at application layer |
| New map creation is transaction-safe | Scoped transaction, base-connection compatibility, case insert, audit append, and reload tested | Covered |
| User/field/security boundaries remain intact | 23 supporting secure-case regressions passed | Covered |
| Real Android BLE behavior | No physical radio or permission dialog available in the sandbox | Requires device acceptance |

## 7. Residual Acceptance Checks

The integration outcome is suitable for release-candidate validation, subject to the following physical-device checks:

1. On two Android devices with the GitHub build installed, enable Bluetooth and grant **Nearby devices** permission to both installations.
2. On each device, open **Settings → Tactical Mesh & Sync Conflicts** and select **Initialize Radio Hardware**. Confirm `READY — IDLE` or an actionable `INACTIVE` reason.
3. Start discovery on one or both devices. Confirm `DISCOVERY ACTIVE`, peer visibility, deduplication, and a clean transition back to `READY — IDLE` after stopping.
4. Create a new operation on a device using a unique reference, then deploy a standard node. Confirm no transaction alert, an audit entry, and the new graph record after workspace reload.
5. Disable a non-administrator operator with a required reason. Confirm the lifecycle audit entry and absence of any `no current transaction` alert.

> A passing local integration run verifies the software contracts; it cannot establish Bluetooth range, manufacturer-specific permission behavior, or battery/advertising restrictions on a real handset. Those are device acceptance characteristics, not gaps in the tested application logic.

## 8. Conclusion

The fresh integration pass completed with **35/35 successful cases**. Tactical Mesh correctly distinguishes unavailable, disabled, ready, scanning, and failed states at the tested adapter and store boundaries. Map creation correctly persists an operation through the scoped native transaction path, appends its audit event, and reloads the case list. The supporting secure-case regression set confirms that these changes preserve the system’s offline-first RBAC, evidence, and audit constraints.

## References

[1]: https://github.com/TangoSplicer/CrimeGraph/commit/1f7347d701b862d350751b8e1d506cb9b6b97650 "Audited CrimeGraph release commit"
[2]: https://github.com/TangoSplicer/CrimeGraph/actions/runs/32189451017 "CrimeGraph Android Build for the release commit"
[3]: https://github.com/TangoSplicer/CrimeGraph/blob/1f7347d701b862d350751b8e1d506cb9b6b97650/src/capacitor/mesh.test.ts "Tactical Mesh adapter test source"
[4]: https://github.com/TangoSplicer/CrimeGraph/blob/1f7347d701b862d350751b8e1d506cb9b6b97650/src/stores/meshAndTransaction.test.ts "Tactical Mesh state and native transaction test source"
[5]: https://github.com/TangoSplicer/CrimeGraph/blob/1f7347d701b862d350751b8e1d506cb9b6b97650/src/stores/caseStoreSecurity.test.ts "Secure case-workflow regression source"
