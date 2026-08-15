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
  registerPlugin: vi.fn(() => ({
    getPublicIdentity: vi.fn(),
    getStorageSecret: vi.fn(),
    destroyStorageSecret: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
  })),
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
    reviewQueue: [], caseAssignments: [], assignableFieldOperators: [], dataMarkings: [], disclosureRecords: [], fieldTasks: [], playbookMilestones: [], caseLeads: [], notes: [], selectedNodeId: null, selectedEdgeId: null, connectingFromId: null, hiddenNodeTypes: [],
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

  it('creates a structured task only for an active local field assignment and audits the handoff', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ values: [{ id: 'assignment-1' }] })
      .mockResolvedValueOnce({ values: [] });
    mocks.getDb.mockResolvedValue(db);

    await useCaseStore.getState().createFieldTask('case-1', 'field-001', 'Capture exterior', 'Record exterior observations and preserve source context.', ['Record arrival time', 'Record vantage point'], 'Remain within the assigned boundary.');

    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO field_tasks (id, case_id, assignee_id, title, objective, checklist, context_note, due_at, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [expect.stringMatching(/^task_/), 'case-1', 'field-001', 'Capture exterior', 'Record exterior observations and preserve source context.', JSON.stringify(['Record arrival time', 'Record vantage point']), 'Remain within the assigned boundary.', null, 'assigned', 'SUP-001', expect.any(String), expect.any(String)],
    );
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'CREATE_FIELD_TASK', expect.stringMatching(/^task_/), expect.stringContaining('Capture exterior'), 'SUP-001');
  });

  it('prevents a field operator from completing another operator’s task', async () => {
    mocks.getAuthState.mockReturnValue({ currentUser: { id: 'field-001', badge: 'FIELD-001', role: 'field' }, setIntentionalBackground: vi.fn() });
    const db = makeDb();
    db.query.mockResolvedValueOnce({ values: [{ id: 'task-1', case_id: 'case-1', assignee_id: 'field-002', status: 'assigned', title: 'Other task' }] });
    mocks.getDb.mockResolvedValue(db);

    await expect(useCaseStore.getState().completeFieldTask('task-1', 'complete', 'Done.')).rejects.toThrow('only their own assigned tasks');
    expect(db.run).not.toHaveBeenCalled();
  });
});


describe('case playbook and local lead register', () => {
  it('creates an accountable case milestone and writes a ledger record', async () => {
    const db = makeDb();
    db.query.mockResolvedValue({ values: [] });
    mocks.getDb.mockResolvedValue(db);

    await useCaseStore.getState().createPlaybookMilestone('case-1', 'Confirm source', 'Record and verify the stated collection source.', 'Collection', 'analyst', '', ['node-1']);

    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO case_playbook_milestones (id, case_id, title, objective, category, owner_role, status, due_at, linked_object_ids, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [expect.stringMatching(/^milestone_/), 'case-1', 'Confirm source', 'Record and verify the stated collection source.', 'Collection', 'analyst', 'not_started', null, JSON.stringify(['node-1']), 'SUP-001', expect.any(String), 'SUP-001', expect.any(String)],
    );
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'CREATE_CASE_MILESTONE', expect.stringMatching(/^milestone_/), expect.stringContaining('Confirm source'), 'SUP-001');
  });

  it('promotes a manager-reviewed lead into an explicitly linked intelligence node', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ values: [{ id: 'lead-1', case_id: 'case-1', title: 'Observed meeting', source_type: 'operator observation', source_reference: 'LOG-1', received_at: '2026-08-15T12:00:00.000Z', status: 'under_review' }] })
      .mockResolvedValueOnce({ values: [] });
    mocks.getDb.mockResolvedValue(db);
    useCaseStore.setState({ activeCaseId: 'case-1' });

    await useCaseStore.getState().promoteCaseLead('lead-1', 'event', 3, { Venue: 'Test location' });

    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status, submitted_by, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [expect.stringMatching(/^node_/), 'case-1', 'Observed meeting', 'event', 3, expect.any(String), '2026-08-15T12:00:00.000Z', expect.stringContaining('lead-1'), 'not_required', null, null],
    );
    expect(db.run).toHaveBeenCalledWith(
      "UPDATE case_leads SET status = 'promoted', disposition_note = ?, promoted_node_id = ?, promoted_by = ?, promoted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
      ['Promoted to intelligence record.', expect.stringMatching(/^node_/), 'SUP-001', expect.any(String), 'SUP-001', expect.any(String), 'lead-1'],
    );
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'PROMOTE_CASE_LEAD', 'lead-1', expect.stringContaining('Observed meeting'), 'SUP-001');
  });

  it('fails closed before reading a lead when a field account attempts lead promotion', async () => {
    mocks.getAuthState.mockReturnValue({ currentUser: { id: 'field-001', badge: 'FIELD-001', role: 'field' }, setIntentionalBackground: vi.fn() });
    const db = makeDb();
    mocks.getDb.mockResolvedValue(db);

    await expect(useCaseStore.getState().promoteCaseLead('lead-1', 'event', 3)).rejects.toThrow('lead:manage');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('controlled markings and disclosure history', () => {
  it('persists a normalized case marking and audits the policy action', async () => {
    const db = makeDb();
    db.query.mockResolvedValue({ values: [{ id: 'marking-1', case_id: 'case-1', object_type: 'case', object_id: 'case-1', marking: 'PERSONAL_DATA', handling_instructions: 'Restrict external disclosure.', created_by: 'SUP-001', created_at: '2026-08-15T12:00:00.000Z' }] });
    mocks.getDb.mockResolvedValue(db);
    useCaseStore.setState({ activeCaseId: 'case-1' });

    await useCaseStore.getState().addDataMarking('case', 'case-1', 'personal_data', 'Restrict external disclosure.');

    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO data_markings (id, case_id, object_type, object_id, marking, handling_instructions, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [expect.stringMatching(/^marking_/), 'case-1', 'case', 'case-1', 'PERSONAL_DATA', 'Restrict external disclosure.', 'SUP-001', expect.any(String), expect.any(String)],
    );
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(db, 'APPLY_DATA_MARKING', expect.stringMatching(/^marking_/), expect.stringContaining('PERSONAL_DATA'), 'SUP-001');
    expect(useCaseStore.getState().dataMarkings).toMatchObject([{ marking: 'PERSONAL_DATA', objectType: 'case' }]);
  });

  it('rejects malformed marking labels before writing to the database', async () => {
    const db = makeDb();
    mocks.getDb.mockResolvedValue(db);
    useCaseStore.setState({ activeCaseId: 'case-1' });

    await expect(useCaseStore.getState().addDataMarking('case', 'case-1', 'not valid!', '')).rejects.toThrow('Marking must contain');
    expect(db.run).not.toHaveBeenCalled();
  });
});
