export const EVIDENCE_SOURCE_TYPES = ['observed', 'witness', 'document', 'digital', 'physical', 'partner', 'open_source'] as const;
export const EVIDENCE_HANDLING_STATUSES = ['draft', 'recorded', 'secured', 'reviewed', 'released'] as const;
export const EVIDENCE_VERIFICATION_STATUSES = ['unverified', 'corroborated', 'verified', 'disputed'] as const;

export type EvidenceSourceType = typeof EVIDENCE_SOURCE_TYPES[number];
export type EvidenceHandlingStatus = typeof EVIDENCE_HANDLING_STATUSES[number];
export type EvidenceVerificationStatus = typeof EVIDENCE_VERIFICATION_STATUSES[number];

export interface EvidenceProvenanceInput {
  exhibitNumber?: string;
  sourceType?: EvidenceSourceType;
  sourceReference?: string;
  acquiredAt?: string;
  acquiredBy?: string;
  handlingStatus?: EvidenceHandlingStatus;
  verificationStatus?: EvidenceVerificationStatus;
  chainOfCustody?: string;
  attachmentName?: string;
  attachmentUri?: string;
  attachmentMimeType?: string;
  attachmentDigest?: string;
}

export interface EvidenceProvenance extends Required<EvidenceProvenanceInput> {
  id: string;
  caseId: string;
  nodeId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  fingerprint: string;
}

const inSet = <T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] =>
  typeof value === 'string' && values.includes(value) ? value as T[number] : fallback;

const clean = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, limit) : '';

export const normaliseEvidenceProvenance = (input: EvidenceProvenanceInput = {}): Required<EvidenceProvenanceInput> => ({
  exhibitNumber: clean(input.exhibitNumber, 80),
  sourceType: inSet(input.sourceType, EVIDENCE_SOURCE_TYPES, 'document'),
  sourceReference: clean(input.sourceReference, 240),
  acquiredAt: clean(input.acquiredAt, 40),
  acquiredBy: clean(input.acquiredBy, 120),
  handlingStatus: inSet(input.handlingStatus, EVIDENCE_HANDLING_STATUSES, 'recorded'),
  verificationStatus: inSet(input.verificationStatus, EVIDENCE_VERIFICATION_STATUSES, 'unverified'),
  chainOfCustody: clean(input.chainOfCustody, 2000),
  attachmentName: clean(input.attachmentName, 160),
  attachmentUri: clean(input.attachmentUri, 2048),
  attachmentMimeType: clean(input.attachmentMimeType, 100),
  attachmentDigest: clean(input.attachmentDigest, 128).toUpperCase(),
});

export const validateEvidenceProvenance = (input: Required<EvidenceProvenanceInput>): void => {
  if (!input.exhibitNumber) throw new Error('Evidence requires an exhibit or reference number.');
  if (!input.sourceReference) throw new Error('Evidence requires a source reference.');
  if (!input.acquiredAt || Number.isNaN(Date.parse(input.acquiredAt))) throw new Error('Evidence requires a valid acquisition date and time.');
  if (!input.acquiredBy) throw new Error('Evidence requires the acquiring operator or source.');
  const attachmentFields = [input.attachmentName, input.attachmentUri, input.attachmentMimeType, input.attachmentDigest];
  if (attachmentFields.some(Boolean) && attachmentFields.some((value) => !value)) throw new Error('Captured media must include its name, local URI, media type, and integrity digest.');
  if (input.attachmentDigest && !/^[A-F0-9]{64}$/.test(input.attachmentDigest)) throw new Error('Captured media has an invalid integrity digest.');
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

export const createEvidenceFingerprint = async (input: Required<EvidenceProvenanceInput>): Promise<string> => {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([
    input.exhibitNumber, input.sourceType, input.sourceReference, input.acquiredAt, input.acquiredBy,
    input.handlingStatus, input.verificationStatus, input.chainOfCustody,
    input.attachmentName, input.attachmentUri, input.attachmentMimeType, input.attachmentDigest,
  ])));
  return toBase64(new Uint8Array(digest));
};
