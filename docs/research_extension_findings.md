# Extension Research Findings

## Evidence preservation

- NIST IR 8387, *Digital Evidence Preservation: Considerations for Evidence Handlers*, is a relevant source for extending CrimeGraph’s provenance and preservation workflows. Its subject matter supports prioritizing explicit evidence handling, integrity verification, controlled access, and preservation records rather than opaque analytical claims.
- Source: <https://nvlpubs.nist.gov/nistpubs/ir/2022/NIST.IR.8387.pdf>

## Android key protection

- Android’s Keystore documentation states that Keystore key material remains non-exportable and can be restricted by authorized cryptographic purpose, temporal validity, or recent user authentication.
- It describes hardware-backed key protection through the Trusted Execution Environment or StrongBox where supported, and exposes a way to inspect the security level for a generated key.
- This supports a future **device-security posture report** and a **hardware-backed key assurance tier**, but not an unsupported promise that all devices have StrongBox.
- Source: <https://developer.android.com/privacy-and-security/keystore>

## Product implication

The current device-bound secret and protected SQLite model is a strong base for extensions that surface assurance, integrity, evidence-quality, and explicit operational workflow. Collaboration transport remains out of scope until a secure-session protocol is designed and reviewed.

## Structured interoperability and portable provenance

CASE is an international standard focused on standardized exchange of cyber-investigation information. It models observable objects, sources, actions, provenance, chain of custody, chain of evidence, and data markings. It is therefore a strong **optional export-mapping reference** for CrimeGraph’s digital-evidence subset, but it should not be treated as a justification to enable live Bluetooth or mesh transfer.

W3C PROV defines provenance as information about the entities, activities, and people involved in producing data. Its conceptual model and vocabulary support provenance interchange and validation through object attribution, processing steps, derivation, reproducibility, versioning, and procedures. A compact PROV-inspired export manifest is suitable for a later evidence dossier extension.

Sources:

- <https://caseontology.org/ontology/intro.html>
- <https://www.w3.org/TR/prov-overview/>

## Product implication

A staged **forensic export dossier** should precede any collaboration transport. It can deliver signed package manifests, hash verification, explicit provenance, data markings, and controlled redaction while keeping information transfer entirely user-mediated and offline.
