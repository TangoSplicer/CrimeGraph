import { beforeEach, describe, expect, it } from 'vitest';
import { createEvidenceDerivativeDigest, normaliseDerivativeRecord } from './evidenceDerivative';

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

const baseInput = {
  caseId: 'case-001',
  parentNodeId: 'node-001',
  parentEvidenceFingerprint: 'provenance-fingerprint',
  sourceAttachmentDigest: 'a'.repeat(64),
  recordType: 'annotation' as const,
  label: 'Visible marker',
  annotationText: 'Operator-authored context.',
  timecodeStartSeconds: '12.25',
  timecodeEndSeconds: '14.5',
  createdBy: 'ANALYST-001',
  createdAt: '2026-08-15T12:00:00.000Z',
};

describe('evidence derivative ledger', () => {
  it('normalises a bounded, source-bound record and creates a stable canonical digest', async () => {
    const record = normaliseDerivativeRecord(baseInput);
    const second = normaliseDerivativeRecord(baseInput);

    expect(record).toMatchObject({ timecodeStartSeconds: 12.25, timecodeEndSeconds: 14.5, sourceAttachmentDigest: 'A'.repeat(64) });
    await expect(createEvidenceDerivativeDigest(record)).resolves.toBe(await createEvidenceDerivativeDigest(second));
  });

  it('rejects a reverse media interval before a record can be stored', () => {
    expect(() => normaliseDerivativeRecord({ ...baseInput, timecodeStartSeconds: 15, timecodeEndSeconds: 10 })).toThrow('cannot precede');
  });

  it('rejects unsupported record types and oversized timecode assumptions', () => {
    expect(() => normaliseDerivativeRecord({ ...baseInput, recordType: 'automatic_summary' as never })).toThrow('not supported');
    expect(() => normaliseDerivativeRecord({ ...baseInput, timecodeEndSeconds: 604801 })).toThrow('seven days');
  });
});
