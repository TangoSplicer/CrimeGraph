# CrimeGraph Archive Cryptography Fuzzing Report

**Author:** Manus AI
**Date:** August 16, 2026
**Scope:** Defensive, local adversarial testing of the `.cgarchive` AES-GCM and PBKDF2 archive path.

## Executive Summary

A focused fuzzing and penetration-style validation pass was completed against the encrypted case archive boundary. The test campaign exercised malformed envelopes, invalid byte arrays, truncated and tampered AES-GCM inputs, unexpected KDF and cipher metadata, wrong and invalid passphrases, and oversized archive fields. The original implementation did provide AES-GCM authentication, but it trusted the JSON envelope shape and accepted unbounded arrays before decryption. That input-validation weakness was remediated.

## Test Campaign

| Test family | Attack simulation | Expected secure outcome | Result |
|---|---|---|---|
| Envelope parsing | Empty, non-JSON, scalar, array, and incomplete-object inputs | Reject before key derivation or database access | Passed |
| Byte validation | Negative, fractional, string, and greater-than-255 byte entries | Reject malformed salt, IV, and ciphertext values | Passed |
| Size controls | Oversized JSON envelope and ciphertext collection | Reject before large allocation or decryption | Passed |
| AES-GCM integrity | Single-bit changes to ciphertext, IV, and salt | Authentication failure; no database transaction | Passed |
| KDF policy pinning | Downgraded PBKDF2 iteration count or SHA-1 metadata | Reject unsupported parameters | Passed |
| Cipher policy pinning | AES-CBC substitution metadata | Reject unsupported encryption metadata | Passed |
| Credential boundary | Wrong, empty, too-short, and overlong passphrases | Fail closed before database mutation | Passed |
| Randomized malformed values | 96 deterministic malformed byte-array envelopes | No unhandled exception or database access | Passed |

## Hardening Implemented

The archive format is now self-describing and policy-pinned. New exports declare the archive format/version, PBKDF2/SHA-256 with 100,000 iterations, and AES-GCM with a 128-bit tag. Imports verify that declared parameters match the supported policy before a key is derived.

The importer now enforces a 16-byte random salt, 12-byte AES-GCM IV, integer byte values from 0 through 255, a 64 MiB maximum envelope string, a 16 MiB maximum ciphertext field, and an upper bound of 50,000 records for each decrypted collection. It also validates the decrypted case bundle before a transaction starts. Invalid inputs return controlled errors and do not reach the database layer.

A passphrase boundary was added: archive passphrases must contain 12 through 1,024 characters. This prevents accidental weak passphrases while placing an upper bound on abusive values.

## Verification Result

The full verification command completed successfully after hardening:

```text
Test Files  17 passed (17)
     Tests  87 passed (87)
```

Type checking and the Vite production build also completed successfully.

## Residual Considerations

AES-GCM protects archive confidentiality and integrity when the selected passphrase has sufficient entropy. PBKDF2 remains password-dependent; operational policy should require a unique, high-entropy archive passphrase and transfer the archive password through an approved separate channel. This fuzzing pass assessed local code and malformed inputs only; it does not replace a native Android device assessment of keystore storage, user workflow controls, or operational handling procedures.

## References

No external sources were used. This report records repository-local code review and test execution findings.
