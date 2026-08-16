import { beforeEach, describe, expect, it } from 'vitest';
import { buildExhibitQrPayload, parseExhibitQrPayload, verifyExhibitQrReference } from './exhibitQr';

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

const reference = {
  caseId: 'case-001',
  nodeId: 'node-evidence-001',
  exhibitNumber: 'EXH-001',
  provenanceFingerprint: 'evidence-fingerprint-001',
};

describe('offline exhibit QR labels', () => {
  it('creates a deterministic opaque local payload that round-trips to the exhibit reference', () => {
    const payload = buildExhibitQrPayload(reference);

    expect(payload).toMatch(/^CGX1\./);
    expect(parseExhibitQrPayload(payload)).toEqual(reference);
    expect(verifyExhibitQrReference(payload, reference)).toBe(true);
  });

  it('fails closed when a label does not match the local provenance binding', () => {
    const payload = buildExhibitQrPayload(reference);
    expect(verifyExhibitQrReference(payload, { ...reference, provenanceFingerprint: 'different-fingerprint' })).toBe(false);
    expect(() => parseExhibitQrPayload('CGX1.invalid')).toThrow('malformed or incomplete');
    expect(() => parseExhibitQrPayload('https://example.invalid/label')).toThrow('not a CrimeGraph exhibit QR label');
  });
});
