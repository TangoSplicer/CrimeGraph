import { beforeAll, describe, expect, it } from 'vitest';
import { can } from './permissions';
import {
  createEvidenceFingerprint,
  normaliseEvidenceProvenance,
  validateEvidenceProvenance,
} from './evidenceProvenance';
import { buildGraphInsights, runExplainableLocalGraphQuery, searchCaseContent } from './graphInsights';
import { EVIDENCE_INTAKE_TEMPLATES, findEvidenceIntakeTemplate } from './evidenceIntakeTemplates';
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

  it('allows field capture while keeping case creation, import, and markings accountable', () => {
    expect(can('field', 'intelligence:create')).toBe(true);
    expect(can('field', 'intelligence:resubmit')).toBe(true);
    expect(can('field', 'case:create')).toBe(false);
    expect(can('field', 'case:import')).toBe(false);
    expect(can('analyst', 'case:mark')).toBe(true);
    expect(can('field', 'case:mark')).toBe(false);
    expect(can('field', 'field:task:complete')).toBe(true);
    expect(can('analyst', 'field:task:complete')).toBe(false);
    expect(can('supervisor', 'case:plan')).toBe(true);
    expect(can('analyst', 'lead:manage')).toBe(true);
    expect(can('field', 'lead:create')).toBe(true);
    expect(can('field', 'case:plan')).toBe(false);
    expect(can('field', 'lead:manage')).toBe(false);
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

describe('evidence intake templates', () => {
  it('offers common evidence classes as guidance without changing the verification decision', () => {
    expect(EVIDENCE_INTAKE_TEMPLATES).toHaveLength(8);
    const device = findEvidenceIntakeTemplate('device');
    const witness = findEvidenceIntakeTemplate('witness_material');
    expect(device).toMatchObject({ sourceType: 'physical', label: 'Device' });
    expect(witness).toMatchObject({ sourceType: 'witness', label: 'Witness material' });
    expect(EVIDENCE_INTAKE_TEMPLATES.every((template) => template.captureGuidance.length > 0 && template.provenancePrompts.length > 0)).toBe(true);
    expect(findEvidenceIntakeTemplate('unknown')).toBeUndefined();
  });
});

describe('case structure analysis', () => {
  it('reports documentation and evidence review gaps without ranking people', () => {
    const elements: GraphElement[] = [
      { data: { id: 'person-1', label: 'Entity A', type: 'person', confidence: 3, attributes: {} } },
      { data: { id: 'evidence-1', label: 'Image', type: 'evidence', confidence: 4, review_status: 'pending', occurred_at: '2026-08-13T12:00:00.000Z', evidence: {
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
    expect(insights.qualityFindings.map((finding) => finding.kind)).toEqual(expect.arrayContaining(['missing_observed_time', 'unlinked_note', 'pending_review']));
  });

  it('runs a saved local graph query with explicit match reasons rather than a score', () => {
    const elements: GraphElement[] = [
      { data: { id: 'phone-1', label: 'Primary handset', type: 'phone', confidence: 3, attributes: { identifier: '07700900123' } } },
      { data: { id: 'person-1', label: 'Operator', type: 'person', confidence: 3, attributes: {} } },
      { data: { id: 'edge-1', source: 'person-1', target: 'phone-1', label: 'CONTACTED' } },
    ];

    const results = runExplainableLocalGraphQuery(elements, { queryText: '900123', nodeTypes: ['phone'], includeRelationships: true });
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'phone-1', kind: 'node', reasons: expect.arrayContaining(['entity type is within saved filter: phone', 'entity metadata contains the saved text filter']) }),
      expect.objectContaining({ id: 'edge-1', kind: 'relationship', reasons: expect.arrayContaining(['relationship is directly connected to an entity matched by this saved query']) }),
    ]));
    expect(results.some((result) => 'score' in result)).toBe(false);
    expect(() => runExplainableLocalGraphQuery(elements, { queryText: '', nodeTypes: [], includeRelationships: false })).toThrow('requires text or at least one entity type');
  });

  it('returns local records by searchable evidence, relationship, and note fields', () => {
    const elements: GraphElement[] = [
      { data: { id: 'phone-1', label: 'Primary handset', type: 'phone', confidence: 3, attributes: { identifier: '07700900123' } } },
      { data: { id: 'phone-2', label: 'primary handset', type: 'phone', confidence: 3, attributes: {} } },
      { data: { id: 'edge-1', source: 'phone-1', target: 'phone-2', label: 'CONTACTED' } },
    ];
    const notes: IntelNote[] = [{ id: 'note-1', case_id: 'case-1', content: 'Handset was retained for review.', linked_nodes: ['phone-1'], created_at: '2026-08-13T12:00:00.000Z' }];

    expect(searchCaseContent(elements, notes, '900123')).toMatchObject([{ kind: 'node', id: 'phone-1' }]);
    expect(searchCaseContent(elements, notes, 'retained')).toMatchObject([{ kind: 'note', id: 'note-1' }]);
    expect(searchCaseContent(elements, notes, 'contacted')).toMatchObject([{ kind: 'relationship', id: 'edge-1' }]);
    expect(buildGraphInsights(elements, notes).qualityFindings.map((finding) => finding.kind)).toContain('duplicate_candidate');
  });
});
