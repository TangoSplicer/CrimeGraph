import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  filesystem: { readFile: vi.fn(), deleteFile: vi.fn() },
  getDb: vi.fn(),
  destroyProtectedLocalStorage: vi.fn(),
  writeEncryptedEvidenceMedia: vi.fn(),
  requireHighRiskReauthentication: vi.fn(),
  appendAuditEntry: vi.fn(),
  verifyAuditChain: vi.fn(),
  getAuthState: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: mocks.filesystem,
  Directory: { Cache: 'CACHE', Data: 'DATA' },
  Encoding: { UTF8: 'UTF8' },
}));

vi.mock('@capacitor/share', () => ({
  Share: { canShare: vi.fn(), share: vi.fn() },
}));

vi.mock('../capacitor/db', () => ({
  getDb: mocks.getDb,
  destroyProtectedLocalStorage: mocks.destroyProtectedLocalStorage,
}));

vi.mock('../utils/secureMedia', () => ({
  writeEncryptedEvidenceMedia: mocks.writeEncryptedEvidenceMedia,
}));

vi.mock('../utils/highRiskAuth', () => ({
  requireHighRiskReauthentication: mocks.requireHighRiskReauthentication,
}));

vi.mock('../utils/auditLedger', () => ({
  appendAuditEntry: mocks.appendAuditEntry,
  verifyAuditChain: mocks.verifyAuditChain,
}));

vi.mock('./authStore', () => ({
  useAuthStore: { getState: mocks.getAuthState },
}));

import { migrateLegacyEvidenceAttachments, useCaseStore } from './caseStore';

const makeDb = () => ({
  execute: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ values: [] }),
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
  vi.clearAllMocks();
  mocks.isNativePlatform.mockReturnValue(true);
  mocks.getAuthState.mockReturnValue({
    currentUser: { badge: 'SUP-001', role: 'supervisor' },
    setIntentionalBackground: vi.fn(),
  });
  mocks.writeEncryptedEvidenceMedia.mockResolvedValue('file:///protected/evidence/case-1/photo.jpg.cgm');
  mocks.requireHighRiskReauthentication.mockResolvedValue(undefined);
  mocks.destroyProtectedLocalStorage.mockResolvedValue(undefined);
  mocks.appendAuditEntry.mockResolvedValue(undefined);
  useCaseStore.setState({
    cases: [], activeCaseId: null, graphElements: [], auditLogs: [], auditVerification: null,
    reviewQueue: [], notes: [], selectedNodeId: null, selectedEdgeId: null, connectingFromId: null, hiddenNodeTypes: [],
  });
});

describe('legacy evidence migration', () => {
  it('rewraps a plaintext attachment, updates provenance, audits the migration, and then deletes the old file', async () => {
    const db = makeDb();
    const record = { id: 'prov-1', case_id: 'case-1', attachment_name: 'photo.jpg', attachment_uri: 'legacy/photo.jpg' };
    mocks.filesystem.readFile.mockResolvedValue({ data: btoa('legacy image') });

    await migrateLegacyEvidenceAttachments(db, [record]);

    expect(mocks.writeEncryptedEvidenceMedia).toHaveBeenCalledWith('case-1', 'photo.jpg', btoa('legacy image'));
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE evidence_provenance SET attachment_uri = ?, updated_at = ? WHERE id = ?',
      ['file:///protected/evidence/case-1/photo.jpg.cgm', expect.any(String), 'prov-1'],
    );
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'MIGRATE_EVIDENCE_MEDIA', 'prov-1', expect.stringContaining('Migrated legacy attachment'), 'SUP-001');
    expect(mocks.filesystem.deleteFile).toHaveBeenCalledWith({ path: 'legacy/photo.jpg' });
    expect(record.attachment_uri).toBe('file:///protected/evidence/case-1/photo.jpg.cgm');
  });

  it('does not migrate an already protected envelope URI', async () => {
    const db = makeDb();
    await migrateLegacyEvidenceAttachments(db, [{ id: 'prov-2', case_id: 'case-1', attachment_name: 'photo.jpg', attachment_uri: 'evidence/case-1/photo.jpg.cgm' }]);
    expect(mocks.filesystem.readFile).not.toHaveBeenCalled();
    expect(mocks.writeEncryptedEvidenceMedia).not.toHaveBeenCalled();
  });
});

describe('review decision and secure wipe orchestration', () => {
  it('records a returned decision with a supervisor comment and removes it from the pending queue', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ values: [{ id: 'node-1', label: 'Observation', case_id: 'case-1', review_status: 'pending' }] })
      .mockResolvedValueOnce({ values: [] });
    mocks.getDb.mockResolvedValue(db);
    useCaseStore.setState({ graphElements: [{ data: { id: 'node-1', label: 'Observation', type: 'event', review_status: 'pending' } }] });

    await useCaseStore.getState().reviewNode('node-1', 'returned', 'Add the observed time and source reference.');

    expect(db.run).toHaveBeenCalledWith(
      'UPDATE nodes SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ? WHERE id = ? AND review_status = ?',
      ['returned', 'SUP-001', expect.any(String), 'Add the observed time and source reference.', 'node-1', 'pending'],
    );
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'RETURN_INTELLIGENCE_FOR_CORRECTION', 'node-1', expect.stringContaining('Add the observed time'), 'SUP-001');
    expect(useCaseStore.getState().graphElements[0].data.review_status).toBe('returned');
    expect(useCaseStore.getState().reviewQueue).toEqual([]);
  });

  it('fails closed when a return-for-correction request omits the required comment', async () => {
    const db = makeDb();
    mocks.getDb.mockResolvedValue(db);
    await expect(useCaseStore.getState().reviewNode('node-1', 'returned', '   ')).rejects.toThrow('correction comment is required');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('reauthenticates, deletes attachments, destroys protected storage, and resets in-memory state during a wipe', async () => {
    mocks.getAuthState.mockReturnValue({ currentUser: { badge: 'ADMIN-001', role: 'admin' }, setIntentionalBackground: vi.fn() });
    const db = makeDb();
    db.query.mockResolvedValueOnce({ values: [{ attachment_uri: 'evidence/case-1/photo.jpg.cgm' }] });
    mocks.getDb.mockResolvedValue(db);
    useCaseStore.setState({ activeCaseId: 'case-1', cases: [{ id: 'case-1', reference_number: 'CASE-1', title: 'Case', case_type: 'other', status: 'active', classification: 'OFFICIAL', date_opened: '2026-08-13T00:00:00.000Z' }] });

    await useCaseStore.getState().wipeDatabase();

    expect(mocks.requireHighRiskReauthentication).toHaveBeenCalledWith('Permanently wipe all protected CrimeGraph data');
    expect(mocks.filesystem.deleteFile).toHaveBeenCalledWith({ path: 'evidence/case-1/photo.jpg.cgm' });
    expect(mocks.destroyProtectedLocalStorage).toHaveBeenCalledOnce();
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'SYSTEM_WIPE', 'DEVICE', expect.stringContaining('encryption secret was destroyed'), 'SYSTEM_WIPE');
    expect(useCaseStore.getState().activeCaseId).toBeNull();
    expect(useCaseStore.getState().cases).toEqual([]);
  });
});


describe('case assignment and field work queue', () => {
  it('shows a field operator only their active local assignments', async () => {
    mocks.getAuthState.mockReturnValue({ currentUser: { id: 'field-001', badge: 'FIELD-001', role: 'field' }, setIntentionalBackground: vi.fn() });
    const db = makeDb();
    db.query.mockResolvedValue({ values: [{ id: 'case-1', reference_number: 'CASE-1', title: 'Assigned case', case_type: 'operation', status: 'active', classification: 'OFFICIAL', date_opened: '2026-08-14T00:00:00.000Z', assignment_id: 'assignment-1', assignment_note: 'Capture initial observations.', assigned_at: '2026-08-14T00:00:00.000Z', assigned_by: 'SUP-001' }] });
    mocks.getDb.mockResolvedValue(db);

    await useCaseStore.getState().loadCases();

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INNER JOIN case_assignments'), ['field-001']);
    expect(useCaseStore.getState().cases).toMatchObject([{ id: 'case-1', assignment_note: 'Capture initial observations.' }]);
  });

  it('records a field assignment only after validating an active field operator', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ values: [{ reference_number: 'CASE-1', status: 'active' }] })
      .mockResolvedValueOnce({ values: [{ id: 'field-001', badge: 'FIELD-001', name: 'Field Operator' }] })
      .mockResolvedValueOnce({ values: [] })
      .mockResolvedValueOnce({ values: [] });
    mocks.getDb.mockResolvedValue(db);

    await useCaseStore.getState().assignFieldOperator('case-1', 'field-001', 'Capture scene observations.');

    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO case_assignments (id, case_id, operator_id, status, assignment_note, assigned_by, assigned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [expect.stringMatching(/^assignment_/), 'case-1', 'field-001', 'active', 'Capture scene observations.', 'SUP-001', expect.any(String), expect.any(String)],
    );
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'ASSIGN_FIELD_OPERATOR', 'case-1', expect.stringContaining('FIELD-001'), 'SUP-001');
  });

  it('fails closed when a field operator attempts to load an unassigned graph', async () => {
    mocks.getAuthState.mockReturnValue({ currentUser: { id: 'field-001', badge: 'FIELD-001', role: 'field' }, setIntentionalBackground: vi.fn() });
    const db = makeDb();
    db.query.mockResolvedValue({ values: [] });
    mocks.getDb.mockResolvedValue(db);

    await expect(useCaseStore.getState().loadGraphElements('case-1')).rejects.toThrow('not assigned');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('case_assignments'), ['case-1', 'field-001']);
  });
});
