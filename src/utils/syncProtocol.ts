import { sha256Hex } from './forensicDossier';

export interface SyncDeltaPayload {
  caseId: string;
  senderDeviceId: string;
  senderFingerprint: string;
  auditHeadHash: string | null;
  nodes: unknown[];
  edges: unknown[];
  notes: unknown[];
  provenance: unknown[];
  derivatives: unknown[];
  movements: unknown[];
  contexts: unknown[];
  timestamp: string;
  signature?: string;
}

export interface SyncValidationResult {
  valid: boolean;
  errors: string[];
  deltaHash: string | null;
}

export const computeSyncDeltaHash = async (delta: Omit<SyncDeltaPayload, 'signature'>): Promise<string> => {
  const canonical = {
    caseId: delta.caseId,
    senderDeviceId: delta.senderDeviceId,
    senderFingerprint: delta.senderFingerprint,
    auditHeadHash: delta.auditHeadHash,
    nodes: delta.nodes,
    edges: delta.edges,
    notes: delta.notes,
    provenance: delta.provenance,
    derivatives: delta.derivatives,
    movements: delta.movements,
    contexts: delta.contexts,
    timestamp: delta.timestamp,
  };
  return sha256Hex(canonical);
};

export const validateSyncDelta = async (candidate: unknown, expectedSenderFingerprint?: string): Promise<SyncValidationResult> => {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, errors: ['Sync delta is not a valid object.'], deltaHash: null };
  }
  const payload = candidate as Record<string, unknown>;
  if (typeof payload.caseId !== 'string' || !payload.caseId) errors.push('Sync delta is missing a case ID.');
  if (typeof payload.senderDeviceId !== 'string' || !payload.senderDeviceId) errors.push('Sync delta is missing a sender device ID.');
  if (typeof payload.senderFingerprint !== 'string' || !payload.senderFingerprint) errors.push('Sync delta is missing a sender fingerprint.');
  if (expectedSenderFingerprint && payload.senderFingerprint !== expectedSenderFingerprint) {
    errors.push('Sync delta sender fingerprint does not match the trusted peer registration.');
  }
  if (!Array.isArray(payload.nodes)) errors.push('Sync delta nodes collection is malformed.');
  if (!Array.isArray(payload.edges)) errors.push('Sync delta edges collection is malformed.');
  if (!Array.isArray(payload.notes)) errors.push('Sync delta notes collection is malformed.');

  const deltaHash = await computeSyncDeltaHash(payload as unknown as Omit<SyncDeltaPayload, 'signature'>);
  return { valid: errors.length === 0, errors, deltaHash };
};
