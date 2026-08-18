# Operator Provisioning Transaction Fix

**Date:** August 17, 2026
**Status:** Fixed in source and synchronized into the Android project.

## User-visible symptom

When an administrator selected **Provision Operator**, the Settings screen displayed:

> `EXECUTE: CANNOT PERFORM THIS OPERATION BECAUSE THERE IS NO CURRENT TRANSACTION.`

No operator record was created.

## Root cause

The Android SQLite bridge supports an explicit native transaction lifecycle through `beginTransaction`, `commitTransaction`, and `rollbackTransaction`. Separately, its JavaScript `run`, `execute`, and `executeSet` methods default their `transaction` argument to `true`.

The original provisioning flow opened an explicit transaction, then performed `run` calls with their default auto-transaction behavior. This created an incompatible nested transaction lifecycle: individual writes attempted to manage their own transaction context while the outer native transaction was still active. The bridge could then close or invalidate the outer context, producing the reported “no current transaction” error.

## Repair

The transaction helper now creates a scoped database proxy for an explicit transaction. Within that scope, all `run`, `execute`, and `executeSet` calls are forced to `transaction = false`. The outer native transaction therefore owns the complete lifecycle, including the user insert and hash-linked audit entry.

Operator provisioning, disablement, reinstatement, PIN reset, and role change have all been updated to use the scoped connection for both the user write and the audit-ledger write.

## Validation

| Check | Result |
|---|---|
| Provisioning and lifecycle regression tests | Passed |
| Transaction-scoped write regression test | Passed; verifies that `run`, `execute`, and `executeSet` receive `transaction = false` inside an explicit transaction |
| Full test suite | 20 test files, 102 tests passed |
| TypeScript validation | Passed |
| Production bundle | Passed |
| Android synchronization | Passed; the repaired bundle was copied into the Android project |

## Required update procedure

The correction takes effect only after a new Android build is installed. Build and install the current application package using the project’s normal release path, then sign in as the administrator and retry **Settings → Admin Command Deck → Provision Operator**.

Use a badge of 3–32 uppercase letters, digits, or hyphens, a non-empty display name of no more than 100 characters, a six-digit PIN, and a non-administrator role. A successful provision creates a local operator record and a corresponding hash-linked audit entry.

If an installed build still displays the old error after update, confirm that the old application package was replaced rather than launched from a stale build artifact, then capture the complete message and installed app version for follow-up.
