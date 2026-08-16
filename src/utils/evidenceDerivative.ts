import { sha256Hex } from './forensicDossier';

export const EVIDENCE_DERIVATIVE_TYPES = ['annotation', 'transcript_excerpt', 'review_note', 'redaction_instruction'] as const;

export type EvidenceDerivativeType = typeof EVIDENCE_DERIVATIVE_TYPES[number];

export interface EvidenceDerivativeDigestInput {
  caseId: string;
  parentNodeId: string;
  parentEvidenceFingerprint: string;
  sourceAttachmentDigest: string;
  recordType: EvidenceDerivativeType;
  label: string;
  annotationText: string;
  timecodeStartSeconds: number | null;
  timecodeEndSeconds: number | null;
  createdBy: string;
  createdAt: string;
}

const cleanSingleLine = (value: string, limit: number): string => value.replace(/[\r\n]+/g, ' ').trim().slice(0, limit);

export const isEvidenceDerivativeType = (value: unknown): value is EvidenceDerivativeType =>
  typeof value === 'string' && (EVIDENCE_DERIVATIVE_TYPES as readonly string[]).includes(value);

export const normaliseDerivativeTimecode = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 604800) throw new Error('Timecodes must be between zero and seven days.');
  return Math.round(parsed * 1000) / 1000;
};

export const normaliseDerivativeRecord = (input: Omit<EvidenceDerivativeDigestInput, 'label' | 'annotationText' | 'timecodeStartSeconds' | 'timecodeEndSeconds'> & {
  label: string;
  annotationText: string;
  timecodeStartSeconds?: unknown;
  timecodeEndSeconds?: unknown;
}): EvidenceDerivativeDigestInput => {
  if (!isEvidenceDerivativeType(input.recordType)) throw new Error('Derivative record type is not supported.');
  const label = cleanSingleLine(input.label, 160);
  const annotationText = input.annotationText.trim().slice(0, 8000);
  const timecodeStartSeconds = normaliseDerivativeTimecode(input.timecodeStartSeconds);
  const timecodeEndSeconds = normaliseDerivativeTimecode(input.timecodeEndSeconds);
  if (label.length < 3) throw new Error('Derivative record label must contain at least three characters.');
  if (annotationText.length < 3) throw new Error('Derivative record text must contain at least three characters.');
  if (timecodeStartSeconds !== null && timecodeEndSeconds !== null && timecodeEndSeconds < timecodeStartSeconds) {
    throw new Error('Derivative record end timecode cannot precede its start timecode.');
  }
  return {
    ...input,
    label,
    annotationText,
    sourceAttachmentDigest: input.sourceAttachmentDigest.trim().toUpperCase(),
    parentEvidenceFingerprint: input.parentEvidenceFingerprint.trim(),
    timecodeStartSeconds,
    timecodeEndSeconds,
  };
};

export const createEvidenceDerivativeDigest = async (input: EvidenceDerivativeDigestInput): Promise<string> =>
  sha256Hex({
    case_id: input.caseId,
    parent_node_id: input.parentNodeId,
    parent_evidence_fingerprint: input.parentEvidenceFingerprint,
    source_attachment_digest: input.sourceAttachmentDigest,
    record_type: input.recordType,
    label: input.label,
    annotation_text: input.annotationText,
    timecode_start_seconds: input.timecodeStartSeconds,
    timecode_end_seconds: input.timecodeEndSeconds,
    created_by: input.createdBy,
    created_at: input.createdAt,
  });
