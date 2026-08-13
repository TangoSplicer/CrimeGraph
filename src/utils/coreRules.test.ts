import { beforeAll, describe, expect, it } from 'vitest';
import { can } from './permissions';
import {
  createEvidenceFingerprint,
  normaliseEvidenceProvenance,
  validateEvidenceProvenance,
} from './evidenceProvenance';
import { buildGraphInsights } from './graphInsights';
import type { GraphElement, IntelNote } from '../stores/caseStore';

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

describe('permission policy', () => {
  it('keeps device trust management with administrators and supervisors', () => {
    expect(can('admin', 'pairing:manage')).toBe(true);
    expect(can('supervisor', 'pairing:manage')).toBe(true);
    expect(can('analyst', 'pairing:manage')).toBe(false);
    expect(can('field', 'pairing:manage')).toBe(false);
    expect(can('readonly', 'case:export')).toBe(false);
  });
});

describe('evidence provenance', () => {
  const completeEvidence = {
    exhibitNumber: 'EXH-101',
    sourceType: 'digital' as const,
    sourceReference: 'Device camera capture',
    acquiredAt: '2026-08-13T12:00:00.000Z',
    acquiredBy: 'SUP-001',
    handlingStatus: 'secured' as const,
    verificationStatus: 'unverified' as const,
    chainOfCustody: 'Captured in the field and recorded locally.',
    attachmentName: 'capture.jpg',
    attachmentUri: 'file:///private/capture.jpg',
    attachmentMimeType: 'image/jpeg',
    attachmentDigest: 'A'.repeat(64),
  };

  it('normalizes and accepts a complete attachment-bound provenance record', async () => {
    const normalized = normaliseEvidenceProvenance(completeEvidence);
    expect(normalized.attachmentDigest).toBe('A'.repeat(64));
    expect(() => validateEvidenceProvenance(normalized)).not.toThrow();
    await expect(createEvidenceFingerprint(normalized)).resolves.toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('rejects incomplete or malformed attachment integrity information', () => {
    const incomplete = normaliseEvidenceProvenance({ ...completeEvidence, attachmentDigest: '' });
    expect(() => validateEvidenceProvenance(incomplete)).toThrow('Captured media must include');
    const invalidDigest = normaliseEvidenceProvenance({ ...completeEvidence, attachmentDigest: 'NOT-A-SHA-256' });
    expect(() => validateEvidenceProvenance(invalidDigest)).toThrow('invalid integrity digest');
  });
});

describe('case structure analysis', () => {
  it('reports documentation and evidence review gaps without ranking people', () => {
    const elements: GraphElement[] = [
      { data: { id: 'person-1', label: 'Entity A', type: 'person', confidence: 3, attributes: {} } },
      { data: { id: 'evidence-1', label: 'Image', type: 'evidence', confidence: 4, occurred_at: '2026-08-13T12:00:00.000Z', evidence: {
        id: 'ev-1', caseId: 'case-1', nodeId: 'evidence-1', exhibitNumber: 'EXH-101', sourceType: 'digital', sourceReference: 'Device camera', acquiredAt: '2026-08-13T12:00:00.000Z', acquiredBy: 'SUP-001', handlingStatus: 'secured', verificationStatus: 'unverified', chainOfCustody: 'Recorded', attachmentName: '', attachmentUri: '', attachmentMimeType: '', attachmentDigest: '', fingerprint: 'fp', createdAt: '2026-08-13T12:00:00.000Z', updatedAt: '2026-08-13T12:00:00.000Z', createdBy: 'SUP-001',
      } } },
      { data: { id: 'edge-1', source: 'person-1', target: 'evidence-1', label: 'RELATED_TO' } },
    ];
    const notes: IntelNote[] = [{ id: 'note-1', case_id: 'case-1', content: 'Review required.', linked_nodes: [], created_at: '2026-08-13T12:00:00.000Z' }];

    const insights = buildGraphInsights(elements, notes);
    expect(insights.entityCount).toBe(2);
    expect(insights.relationshipCount).toBe(1);
    expect(insights.evidenceCount).toBe(1);
    expect(insights.evidenceRequiringReview).toBe(1);
    expect(insights.itemsWithoutObservedTime).toBe(1);
    expect(insights.notesWithoutLinks).toBe(1);
  });
});
