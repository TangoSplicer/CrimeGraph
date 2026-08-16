import { beforeEach, describe, expect, it } from 'vitest';
import { buildForensicDossier, sha256Hex, verifyForensicDossier } from './forensicDossier';

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

const buildFixture = async () => buildForensicDossier({
  dossierId: 'dossier-001',
  caseId: 'case-001',
  reference: 'CASE-001',
  title: 'Test Operation',
  classification: 'SENSITIVE',
  exportedAt: '2026-08-15T12:00:00.000Z',
  exportedBy: 'ANALYST-001',
  redactionProfile: { omitted: ['attachment_paths', 'observer_identity'], rationale: 'Controlled external disclosure.' },
  disclosure: { purpose: 'Court disclosure review', recipientDescription: 'Authorized legal reviewer', authorizationReference: 'AUTH-123' },
  audit: { chainValid: true, verifiedEntries: 12, auditHeadHash: 'abc123' },
  signer: { fingerprint: 'fingerprint-001', publicKey: 'public-key-001', sign: async (payload) => `signature:${payload}` },
  content: {
    case: { id: 'case-001', reference_number: 'CASE-001', title: 'Test Operation' },
    nodes: [{ data: { id: 'node-001', label: 'Evidence', type: 'evidence', submitted_by: 'FIELD-001', occurred_at: '2026-08-14T10:00:00.000Z', evidence: { acquiredBy: 'FIELD-001', createdBy: 'FIELD-001', attachmentUri: 'evidence/case-001/photo.cgm', attachmentDigest: 'digest' } } }],
    relationships: [],
    notes: [{ id: 'note-001', content: 'Sensitive note', linked_nodes: ['node-001'] }],
    markings: [{ object_type: 'node', object_id: 'node-001', marking: 'SENSITIVE' }],
    derivatives: [{ id: 'derivative-001', parent_node_id: 'node-001', parent_evidence_fingerprint: 'fingerprint', source_attachment_digest: 'digest', record_type: 'annotation', label: 'Review point', annotation_text: 'Operator-authored context', record_digest: 'ledger-digest', created_by: 'ANALYST-001', created_at: '2026-08-15T12:00:00.000Z' }],
    movements: [{ id: 'movement-001', evidence_node_id: 'node-001', movement_type: 'sealed', from_location: 'Intake room', to_location: 'Locker A', custodian: 'ANALYST-001', reference_note: 'Seal reference 001', created_by: 'ANALYST-001', created_at: '2026-08-15T12:00:00.000Z' }],
    contexts: [{ id: 'context-001', node_id: 'node-001', source_basis: 'source_report', location_precision: 'approximate', latitude: 51.5, longitude: -0.12, uncertainty_radius_meters: 120, temporal_precision: 'window', uncertainty_note: 'Coordinates supplied by source report.', created_by: 'ANALYST-001', created_at: '2026-08-15T12:00:00.000Z', updated_by: 'ANALYST-001', updated_at: '2026-08-15T12:00:00.000Z' }],
  },
});

describe('forensic dossier integrity', () => {
  it('creates a canonical manifest with a stable signed digest and validates it', async () => {
    const dossier = await buildFixture();
    const verification = await verifyForensicDossier(dossier);

    expect(dossier.schema_version).toBe(4);
    expect(dossier.manifest.integrity.manifest).toMatch(/^[a-f0-9]{64}$/);
    expect(dossier.manifest.signer.signature).toBe(`signature:${dossier.manifest.integrity.manifest}`);
    expect(verification).toMatchObject({ valid: true, errors: [], manifestDigest: dossier.manifest.integrity.manifest, signerFingerprint: 'fingerprint-001' });
  });

  it('applies configured redactions only to the dossier projection', async () => {
    const dossier = await buildFixture();
    const data = dossier.content.nodes[0] as { data: Record<string, unknown> };
    const evidence = data.data.evidence as Record<string, unknown>;

    expect(data.data.submitted_by).toBeUndefined();
    expect(data.data.occurred_at).toBe('2026-08-14T10:00:00.000Z');
    expect(evidence.acquiredBy).toBeUndefined();
    expect(evidence.createdBy).toBeUndefined();
    expect(evidence.attachmentUri).toBeUndefined();
    expect(evidence.attachmentDigest).toBe('digest');
  });

  it('continues to verify a structurally valid legacy v1 dossier without a derivative ledger', async () => {
    const v2 = await buildFixture();
    const legacy = structuredClone(v2) as any;
    legacy.schema_version = 1;
    delete legacy.content.derivatives;
    delete legacy.content.movements;
    delete legacy.content.contexts;
    delete legacy.manifest.integrity.derivatives;
    delete legacy.manifest.integrity.movements;
    delete legacy.manifest.integrity.contexts;
    legacy.manifest.integrity.content = await sha256Hex(legacy.content);
    const { signature: _signature, ...signer } = legacy.manifest.signer;
    const { manifest: _manifest, ...integrity } = legacy.manifest.integrity;
    legacy.manifest.integrity.manifest = await sha256Hex({
      dossier_id: legacy.manifest.dossier_id, case_id: legacy.manifest.case_id, reference: legacy.manifest.reference, title: legacy.manifest.title,
      classification: legacy.manifest.classification, exported_at: legacy.manifest.exported_at, exported_by: legacy.manifest.exported_by,
      redaction_profile: legacy.manifest.redaction_profile, disclosure: legacy.manifest.disclosure, audit: legacy.manifest.audit, signer, integrity,
    });

    await expect(verifyForensicDossier(legacy)).resolves.toMatchObject({ valid: true, errors: [] });
  });

  it('redacts observation operator identifiers only in the dossier projection when selected', async () => {
    const dossier = await buildForensicDossier({
      dossierId: 'dossier-context-redaction', caseId: 'case-001', reference: 'CASE-001', title: 'Test Operation', classification: 'OFFICIAL', exportedAt: '2026-08-15T12:00:00.000Z', exportedBy: 'ANALYST-001',
      disclosure: { purpose: 'Authorized review', recipientDescription: 'Reviewer' }, audit: { chainValid: true, verifiedEntries: 1, auditHeadHash: null }, signer: { fingerprint: 'fingerprint', publicKey: 'key', sign: async () => 'signature' },
      content: { case: {}, nodes: [], relationships: [], notes: [], markings: [], contexts: [{ node_id: 'node-001', source_basis: 'source_report', created_by: 'ANALYST-001', updated_by: 'SUP-001' }] },
      redactionProfile: { omitted: ['observer_identity'], rationale: 'Disclosure minimization.' },
    });
    const context = dossier.content.contexts?.[0] as Record<string, unknown>;
    expect(context.created_by).toBeUndefined();
    expect(context.updated_by).toBeUndefined();
    expect(context.redacted).toBe(true);
  });

  it('detects a modified observation context before import', async () => {
    const dossier = await buildFixture();
    (dossier.content.contexts?.[0] as { uncertainty_note: string }).uncertainty_note = 'Modified after export';
    await expect(verifyForensicDossier(dossier)).resolves.toMatchObject({ valid: false, errors: expect.arrayContaining(['Integrity mismatch for contexts.']) });
  });

  it('redacts custody locations and operator identity only in the dossier projection when selected', async () => {
    const dossier = await buildForensicDossier({
      dossierId: 'dossier-movement-redaction', caseId: 'case-001', reference: 'CASE-001', title: 'Test Operation', classification: 'OFFICIAL', exportedAt: '2026-08-15T12:00:00.000Z', exportedBy: 'ANALYST-001',
      disclosure: { purpose: 'Authorized review', recipientDescription: 'Reviewer' }, audit: { chainValid: true, verifiedEntries: 1, auditHeadHash: null }, signer: { fingerprint: 'fingerprint', publicKey: 'key', sign: async () => 'signature' },
      content: { case: {}, nodes: [], relationships: [], notes: [], markings: [], movements: [{ evidence_node_id: 'node-001', from_location: 'Intake', to_location: 'Locker A', custodian: 'ANALYST-001', created_by: 'ANALYST-001' }] },
      redactionProfile: { omitted: ['custody_locations', 'observer_identity'], rationale: 'Disclosure minimization.' },
    });

    const movement = dossier.content.movements?.[0] as Record<string, unknown>;
    expect(movement.from_location).toBeUndefined();
    expect(movement.to_location).toBeUndefined();
    expect(movement.custodian).toBeUndefined();
    expect(movement.created_by).toBeUndefined();
    expect(movement.redacted).toBe(true);
  });

  it('detects a modified exhibit movement before import', async () => {
    const dossier = await buildFixture();
    (dossier.content.movements?.[0] as { to_location: string }).to_location = 'Modified after export';

    const verification = await verifyForensicDossier(dossier);
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('Integrity mismatch for movements.');
  });

  it('redacts derivative annotation text only in the dossier projection when selected', async () => {
    const dossier = await buildForensicDossier({
      ...(await (async () => ({
        dossierId: 'dossier-derivative-redaction', caseId: 'case-001', reference: 'CASE-001', title: 'Test Operation', classification: 'OFFICIAL', exportedAt: '2026-08-15T12:00:00.000Z', exportedBy: 'ANALYST-001',
        disclosure: { purpose: 'Authorized review', recipientDescription: 'Reviewer' }, audit: { chainValid: true, verifiedEntries: 1, auditHeadHash: null }, signer: { fingerprint: 'fingerprint', publicKey: 'key', sign: async () => 'signature' },
        content: { case: {}, nodes: [], relationships: [], notes: [], markings: [], derivatives: [{ id: 'derivative-001', annotation_text: 'Sensitive annotation' }] },
      }))()),
      redactionProfile: { omitted: ['derivative_annotations'], rationale: 'External disclosure minimization.' },
    });

    expect((dossier.content.derivatives?.[0] as Record<string, unknown>).annotation_text).toBeUndefined();
    expect((dossier.content.derivatives?.[0] as Record<string, unknown>).redacted).toBe(true);
  });

  it('detects a modified derivative record before import', async () => {
    const dossier = await buildFixture();
    (dossier.content.derivatives?.[0] as { annotation_text: string }).annotation_text = 'Modified after export';

    const verification = await verifyForensicDossier(dossier);
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('Integrity mismatch for derivatives.');
  });

  it('detects a modified dossier content object before import', async () => {
    const dossier = await buildFixture();
    (dossier.content.notes[0] as { content: string }).content = 'Modified after export';

    const verification = await verifyForensicDossier(dossier);
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('Integrity mismatch for notes.');
  });

  it('requires a stated rationale for any redaction selection', async () => {
    await expect(buildForensicDossier({
      ...(await (async () => ({
        dossierId: 'dossier-002', caseId: 'case-001', reference: 'CASE-001', title: 'Test Operation', classification: 'OFFICIAL', exportedAt: '2026-08-15T12:00:00.000Z', exportedBy: 'ANALYST-001',
        disclosure: { purpose: 'Authorized review', recipientDescription: 'Reviewer' }, audit: { chainValid: true, verifiedEntries: 1, auditHeadHash: null }, signer: { fingerprint: 'fingerprint', publicKey: 'key', sign: async () => 'signature' }, content: { case: {}, nodes: [], relationships: [], notes: [], markings: [] },
      }))()),
      redactionProfile: { omitted: ['notes'], rationale: '' },
    })).rejects.toThrow('redaction rationale');
  });
});
