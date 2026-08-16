export type RedactionOption = 'notes' | 'attachment_paths' | 'observer_identity' | 'observed_time' | 'derivative_annotations' | 'custody_locations';

export interface DossierRedactionProfile {
  omitted: RedactionOption[];
  rationale: string;
}

export interface DossierDisclosure {
  purpose: string;
  recipientDescription: string;
  authorizationReference?: string;
}

export interface DossierIntegrity {
  case: string;
  nodes: string;
  relationships: string;
  notes: string;
  markings: string;
  derivatives?: string;
  movements?: string;
  contexts?: string;
  content: string;
  manifest: string;
}

export interface ForensicDossier {
  dossier_type: 'crimegraph-forensic-dossier';
  schema_version: 1 | 2 | 3 | 4;
  manifest: {
    dossier_id: string;
    case_id: string;
    reference: string;
    title: string;
    classification: string;
    exported_at: string;
    exported_by: string;
    redaction_profile: DossierRedactionProfile;
    disclosure: DossierDisclosure;
    audit: {
      chain_valid: boolean;
      verified_entries: number;
      audit_head_hash: string | null;
    };
    signer: {
      fingerprint: string;
      public_key: string;
      signature: string;
    };
    integrity: DossierIntegrity;
  };
  content: {
    case: Record<string, unknown>;
    nodes: unknown[];
    relationships: unknown[];
    notes: unknown[];
    markings: unknown[];
    derivatives?: unknown[];
    movements?: unknown[];
    contexts?: unknown[];
  };
}

export interface DossierBuildInput {
  dossierId: string;
  caseId: string;
  reference: string;
  title: string;
  classification: string;
  exportedAt: string;
  exportedBy: string;
  redactionProfile: DossierRedactionProfile;
  disclosure: DossierDisclosure;
  audit: { chainValid: boolean; verifiedEntries: number; auditHeadHash: string | null };
  signer: { fingerprint: string; publicKey: string; sign: (payload: string) => Promise<string> };
  content: {
    case: Record<string, unknown>;
    nodes: unknown[];
    relationships: unknown[];
    notes: unknown[];
    markings: unknown[];
    derivatives?: unknown[];
    movements?: unknown[];
    contexts?: unknown[];
  };
}

export interface DossierVerificationResult {
  valid: boolean;
  errors: string[];
  manifestDigest: string | null;
  signerFingerprint: string | null;
}

const encoder = new TextEncoder();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
};

export const sha256Hex = async (value: unknown): Promise<string> => {
  const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(canonicalize(value)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const ensureValidProfile = (profile: DossierRedactionProfile): DossierRedactionProfile => {
  const allowed = new Set<RedactionOption>(['notes', 'attachment_paths', 'observer_identity', 'observed_time', 'derivative_annotations', 'custody_locations']);
  const omitted = [...new Set(profile.omitted)].filter((entry): entry is RedactionOption => allowed.has(entry));
  const rationale = profile.rationale.trim().slice(0, 500);
  if (omitted.length > 0 && rationale.length < 5) throw new Error('A redaction rationale of at least five characters is required.');
  return { omitted, rationale };
};

const ensureDisclosure = (disclosure: DossierDisclosure): DossierDisclosure => {
  const purpose = disclosure.purpose.trim().slice(0, 500);
  const recipientDescription = disclosure.recipientDescription.trim().slice(0, 500);
  const authorizationReference = disclosure.authorizationReference?.trim().slice(0, 160) || undefined;
  if (purpose.length < 5) throw new Error('A disclosure purpose of at least five characters is required.');
  if (recipientDescription.length < 3) throw new Error('A recipient description of at least three characters is required.');
  return { purpose, recipientDescription, authorizationReference };
};

const redactNode = (candidate: unknown, profile: DossierRedactionProfile): unknown => {
  if (!isPlainObject(candidate)) return candidate;
  const node = structuredClone(candidate);
  const data = isPlainObject(node.data) ? { ...node.data } : null;
  if (!data) return node;
  if (profile.omitted.includes('observed_time')) delete data.occurred_at;
  if (profile.omitted.includes('observer_identity')) {
    delete data.submitted_by;
    if (isPlainObject(data.evidence)) {
      const evidence = { ...data.evidence };
      delete evidence.acquiredBy;
      delete evidence.createdBy;
      data.evidence = evidence;
    }
  }
  if (profile.omitted.includes('attachment_paths') && isPlainObject(data.evidence)) {
    const evidence = { ...data.evidence };
    delete evidence.attachmentUri;
    data.evidence = evidence;
  }
  return { ...node, data };
};

const redactNote = (candidate: unknown, profile: DossierRedactionProfile): unknown => {
  if (!profile.omitted.includes('notes')) return candidate;
  if (!isPlainObject(candidate)) return candidate;
  const redacted = { ...candidate };
  delete redacted.content;
  redacted.redacted = true;
  return redacted;
};

const redactDerivative = (candidate: unknown, profile: DossierRedactionProfile): unknown => {
  if (!profile.omitted.includes('derivative_annotations')) return candidate;
  if (!isPlainObject(candidate)) return candidate;
  const redacted = { ...candidate };
  delete redacted.annotation_text;
  redacted.redacted = true;
  return redacted;
};

const redactMovement = (candidate: unknown, profile: DossierRedactionProfile): unknown => {
  if (!isPlainObject(candidate)) return candidate;
  const redacted = { ...candidate };
  if (profile.omitted.includes('custody_locations')) {
    delete redacted.from_location;
    delete redacted.to_location;
    redacted.redacted = true;
  }
  if (profile.omitted.includes('observer_identity')) {
    delete redacted.custodian;
    delete redacted.created_by;
    redacted.redacted = true;
  }
  return redacted;
};

const redactObservationContext = (candidate: unknown, profile: DossierRedactionProfile): unknown => {
  if (!profile.omitted.includes('observer_identity') || !isPlainObject(candidate)) return candidate;
  const redacted = { ...candidate };
  delete redacted.created_by;
  delete redacted.updated_by;
  redacted.redacted = true;
  return redacted;
};

export const buildForensicDossier = async (input: DossierBuildInput): Promise<ForensicDossier> => {
  const redactionProfile = ensureValidProfile(input.redactionProfile);
  const disclosure = ensureDisclosure(input.disclosure);
  const content = {
    case: structuredClone(input.content.case),
    nodes: input.content.nodes.map((node) => redactNode(node, redactionProfile)),
    relationships: structuredClone(input.content.relationships),
    notes: input.content.notes.map((note) => redactNote(note, redactionProfile)),
    markings: structuredClone(input.content.markings),
    derivatives: (input.content.derivatives || []).map((derivative) => redactDerivative(derivative, redactionProfile)),
    movements: (input.content.movements || []).map((movement) => redactMovement(movement, redactionProfile)),
    contexts: (input.content.contexts || []).map((context) => redactObservationContext(context, redactionProfile)),
  };
  const integrityWithoutManifest = {
    case: await sha256Hex(content.case),
    nodes: await sha256Hex(content.nodes),
    relationships: await sha256Hex(content.relationships),
    notes: await sha256Hex(content.notes),
    markings: await sha256Hex(content.markings),
    derivatives: await sha256Hex(content.derivatives),
    movements: await sha256Hex(content.movements),
    contexts: await sha256Hex(content.contexts),
    content: await sha256Hex(content),
  };
  const unsignedManifest = {
    dossier_id: input.dossierId,
    case_id: input.caseId,
    reference: input.reference,
    title: input.title,
    classification: input.classification,
    exported_at: input.exportedAt,
    exported_by: input.exportedBy,
    redaction_profile: redactionProfile,
    disclosure,
    audit: {
      chain_valid: input.audit.chainValid,
      verified_entries: input.audit.verifiedEntries,
      audit_head_hash: input.audit.auditHeadHash,
    },
    signer: {
      fingerprint: input.signer.fingerprint,
      public_key: input.signer.publicKey,
    },
    integrity: integrityWithoutManifest,
  };
  const manifestDigest = await sha256Hex(unsignedManifest);
  const signature = await input.signer.sign(manifestDigest);
  return {
    dossier_type: 'crimegraph-forensic-dossier',
    schema_version: 4,
    manifest: {
      ...unsignedManifest,
      signer: { ...unsignedManifest.signer, signature },
      integrity: { ...integrityWithoutManifest, manifest: manifestDigest },
    },
    content,
  };
};

export const verifyForensicDossier = async (candidate: unknown): Promise<DossierVerificationResult> => {
  const errors: string[] = [];
  if (!isPlainObject(candidate) || candidate.dossier_type !== 'crimegraph-forensic-dossier' || (candidate.schema_version !== 1 && candidate.schema_version !== 2 && candidate.schema_version !== 3 && candidate.schema_version !== 4)) {
    return { valid: false, errors: ['Package is not a supported forensic dossier.'], manifestDigest: null, signerFingerprint: null };
  }
  const manifest = candidate.manifest;
  const content = candidate.content;
  if (!isPlainObject(manifest) || !isPlainObject(content) || !isPlainObject(manifest.integrity) || !isPlainObject(manifest.signer)) {
    return { valid: false, errors: ['Forensic dossier is missing its manifest or content.'], manifestDigest: null, signerFingerprint: null };
  }
  const integrity = manifest.integrity as Record<string, unknown>;
  const expectedParts: Array<[keyof Omit<DossierIntegrity, 'manifest'>, unknown]> = [
    ['case', content.case], ['nodes', content.nodes], ['relationships', content.relationships], ['notes', content.notes], ['markings', content.markings],
  ];
  if (candidate.schema_version === 2 || candidate.schema_version === 3 || candidate.schema_version === 4) {
    if (!Array.isArray(content.derivatives)) errors.push(`Forensic dossier v${candidate.schema_version} is missing derivative ledger content.`);
    else expectedParts.push(['derivatives', content.derivatives]);
  }
  if (candidate.schema_version === 3 || candidate.schema_version === 4) {
    if (!Array.isArray(content.movements)) errors.push(`Forensic dossier v${candidate.schema_version} is missing exhibit movement content.`);
    else expectedParts.push(['movements', content.movements]);
  }
  if (candidate.schema_version === 4) {
    if (!Array.isArray(content.contexts)) errors.push('Forensic dossier v4 is missing observation context content.');
    else expectedParts.push(['contexts', content.contexts]);
  }
  expectedParts.push(['content', content]);
  for (const [name, value] of expectedParts) {
    const actual = await sha256Hex(value);
    if (integrity[name] !== actual) errors.push(`Integrity mismatch for ${name}.`);
  }
  const { signature: _signature, ...signerWithoutSignature } = manifest.signer as Record<string, unknown>;
  const { manifest: _storedManifest, ...integrityWithoutManifest } = integrity;
  const manifestWithoutDigest = {
    dossier_id: manifest.dossier_id,
    case_id: manifest.case_id,
    reference: manifest.reference,
    title: manifest.title,
    classification: manifest.classification,
    exported_at: manifest.exported_at,
    exported_by: manifest.exported_by,
    redaction_profile: manifest.redaction_profile,
    disclosure: manifest.disclosure,
    audit: manifest.audit,
    signer: signerWithoutSignature,
    integrity: integrityWithoutManifest,
  };
  const calculatedManifestDigest = await sha256Hex(manifestWithoutDigest);
  if (integrity.manifest !== calculatedManifestDigest) errors.push('Manifest digest does not match the dossier content.');
  const signerFingerprint = typeof (manifest.signer as Record<string, unknown>).fingerprint === 'string'
    ? String((manifest.signer as Record<string, unknown>).fingerprint)
    : null;
  return { valid: errors.length === 0, errors, manifestDigest: typeof integrity.manifest === 'string' ? integrity.manifest : null, signerFingerprint };
};
