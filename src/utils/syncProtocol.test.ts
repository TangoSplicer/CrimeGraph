import { beforeEach, describe, expect, it } from 'vitest';
import { computeSyncDeltaHash, validateSyncDelta } from './syncProtocol';

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

describe('sync protocol validation', () => {
  it('computes a deterministic delta hash', async () => {
    const delta = {
      caseId: 'case-1', senderDeviceId: 'dev-1', senderFingerprint: 'fp-1', auditHeadHash: null,
      nodes: [], edges: [], notes: [], provenance: [], derivatives: [], movements: [], contexts: [], timestamp: '2026-08-16T12:00:00.000Z',
    };
    const hash = await computeSyncDeltaHash(delta);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validates a well-formed sync delta', async () => {
    const delta = {
      caseId: 'case-1', senderDeviceId: 'dev-1', senderFingerprint: 'fp-1', auditHeadHash: null,
      nodes: [], edges: [], notes: [], provenance: [], derivatives: [], movements: [], contexts: [], timestamp: '2026-08-16T12:00:00.000Z',
    };
    const result = await validateSyncDelta(delta, 'fp-1');
    expect(result.valid).toBe(true);
    expect(result.deltaHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a delta with mismatched sender fingerprint', async () => {
    const delta = {
      caseId: 'case-1', senderDeviceId: 'dev-1', senderFingerprint: 'fp-1', auditHeadHash: null,
      nodes: [], edges: [], notes: [], provenance: [], derivatives: [], movements: [], contexts: [], timestamp: '2026-08-16T12:00:00.000Z',
    };
    const result = await validateSyncDelta(delta, 'fp-2');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Sync delta sender fingerprint does not match the trusted peer registration.');
  });
});
