import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { destroyProtectedLocalStorage, getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';
import { decryptPackage, encryptPackage } from '../capacitor/crypto';
import { getDeviceIdentity, signWithDeviceIdentity, verifyDeviceSignature } from '../capacitor/deviceIdentity';
import { buildForensicDossier, verifyForensicDossier, type DossierDisclosure, type DossierRedactionProfile } from '../utils/forensicDossier';
import { writeEncryptedEvidenceMedia } from '../utils/secureMedia';
import { requireHighRiskReauthentication } from '../utils/highRiskAuth';
import { appendAuditEntry, verifyAuditChain, type AuditVerificationResult } from '../utils/auditLedger';
import { assertPermission, can } from '../utils/permissions';
import {
  createEvidenceFingerprint,
  normaliseEvidenceProvenance,
  validateEvidenceProvenance,
  type EvidenceProvenance,
  type EvidenceProvenanceInput,
} from '../utils/evidenceProvenance';

export interface Case { id: string; reference_number: string; title: string; case_type: string; status: string; classification: string; date_opened: string; assignment_id?: string | null; assignment_note?: string | null; assigned_at?: string | null; assigned_by?: string | null; }
export interface AssignableFieldOperator { id: string; badge: string; name: string; lastLogin: string | null; }
export interface CaseAssignment { id: string; caseId: string; operatorId: string; operatorBadge: string; operatorName: string; status: 'active' | 'removed'; note: string; assignedBy: string; assignedAt: string; removedBy: string | null; removedAt: string | null; removalReason: string | null; }
export type MarkingObjectType = 'case' | 'node' | 'note' | 'evidence';
export interface DataMarking { id: string; caseId: string; objectType: MarkingObjectType; objectId: string; marking: string; handlingInstructions: string; createdBy: string; createdAt: string; }
export interface DisclosureRecord { id: string; dossierId: string; caseId: string; purpose: string; recipientDescription: string; authorizationReference: string | null; disclosedBy: string; disclosedAt: string; status: 'prepared' | 'shared' | 'cancelled'; manifestDigest: string; verificationStatus: string; }
export type FieldTaskStatus = 'assigned' | 'complete' | 'unable';
export interface FieldTask { id: string; caseId: string; assigneeId: string; assigneeBadge: string; assigneeName: string; title: string; objective: string; checklist: string[]; contextNote: string; dueAt: string | null; status: FieldTaskStatus; createdBy: string; createdAt: string; completedBy: string | null; completedAt: string | null; completionNote: string; inabilityReason: string; }
export type PlaybookMilestoneStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete';
export type PlaybookOwnerRole = 'admin' | 'supervisor' | 'analyst' | 'field';
export interface CasePlaybookMilestone { id: string; caseId: string; title: string; objective: string; category: string; ownerRole: PlaybookOwnerRole; status: PlaybookMilestoneStatus; dueAt: string | null; linkedObjectIds: string[]; blockerReason: string; completionNote: string; createdBy: string; createdAt: string; updatedBy: string; updatedAt: string; completedBy: string | null; completedAt: string | null; }
export type CaseLeadStatus = 'new' | 'under_review' | 'actioned' | 'closed' | 'promoted';
export interface CaseLead { id: string; caseId: string; title: string; summary: string; sourceType: string; sourceReference: string; receivedAt: string; sensitivityMarking: string; status: CaseLeadStatus; dispositionNote: string; promotedNodeId: string | null; promotedBy: string | null; promotedAt: string | null; createdBy: string; createdAt: string; updatedBy: string; updatedAt: string; }
export type ReviewStatus = 'not_required' | 'pending' | 'approved' | 'returned';

export interface GraphElement { data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; created_at?: string; occurred_at?: string | null; attributes?: Record<string, string>; evidence?: EvidenceProvenance; review_status?: ReviewStatus; submitted_by?: string | null; submitted_at?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; review_notes?: string | null; }; }
export interface ReviewQueueItem { nodeId: string; caseId: string; caseReference: string; caseTitle: string; label: string; nodeType: string; submittedBy: string; submittedAt: string; reviewNotes: string; }
export interface AuditLog { id: string; timestamp: string; user_id: string; action: string; target_id: string; details: string; previous_hash?: string | null; entry_hash?: string | null; }
export interface IntelNote { id: string; case_id: string; content: string; linked_nodes: string[]; created_at: string; }

interface CaseState {
  cases: Case[];
  activeCaseId: string | null;
  graphElements: GraphElement[];
  auditLogs: AuditLog[];
  auditVerification: AuditVerificationResult | null;
  reviewQueue: ReviewQueueItem[];
  caseAssignments: CaseAssignment[];
  assignableFieldOperators: AssignableFieldOperator[];
  dataMarkings: DataMarking[];
  disclosureRecords: DisclosureRecord[];
  fieldTasks: FieldTask[];
  playbookMilestones: CasePlaybookMilestone[];
  caseLeads: CaseLead[];
  notes: IntelNote[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectingFromId: string | null;
  hiddenNodeTypes: string[];
  loadCases: () => Promise<void>;
  setActiveCase: (id: string) => void;
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>;
  restoreCase: (caseId: string) => Promise<void>;
  loadCaseAssignments: (caseId: string) => Promise<void>;
  loadAssignableFieldOperators: () => Promise<void>;
  assignFieldOperator: (caseId: string, operatorId: string, note: string) => Promise<void>;
  removeFieldAssignment: (assignmentId: string, reason: string) => Promise<void>;
  loadDataMarkings: (caseId: string) => Promise<void>;
  addDataMarking: (objectType: MarkingObjectType, objectId: string, marking: string, handlingInstructions?: string) => Promise<void>;
  removeDataMarking: (markingId: string) => Promise<void>;
  loadDisclosureRecords: (caseId: string) => Promise<void>;
  loadFieldTasks: (caseId: string) => Promise<void>;
  createFieldTask: (caseId: string, assigneeId: string, title: string, objective: string, checklist: string[], contextNote?: string, dueAt?: string) => Promise<void>;
  completeFieldTask: (taskId: string, status: Extract<FieldTaskStatus, 'complete' | 'unable'>, note: string) => Promise<void>;
  loadPlaybookMilestones: (caseId: string) => Promise<void>;
  createPlaybookMilestone: (caseId: string, title: string, objective: string, category: string, ownerRole: PlaybookOwnerRole, dueAt?: string, linkedObjectIds?: string[]) => Promise<void>;
  updatePlaybookMilestone: (milestoneId: string, status: PlaybookMilestoneStatus, note?: string) => Promise<void>;
  loadCaseLeads: (caseId: string) => Promise<void>;
  createCaseLead: (caseId: string, title: string, summary: string, sourceType: string, sourceReference: string, sensitivityMarking?: string, receivedAt?: string) => Promise<void>;
  updateCaseLead: (leadId: string, status: Exclude<CaseLeadStatus, 'promoted'>, dispositionNote?: string) => Promise<void>;
  promoteCaseLead: (leadId: string, nodeType: string, confidence: number, attributes?: Record<string, string>, occurredAt?: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number, attributes?: Record<string, string>, evidence?: EvidenceProvenanceInput, occurredAt?: string) => Promise<string>;
  updateNode: (id: string, label: string, confidence: number, attributes: Record<string, string>, occurredAt?: string) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>;
  importCase: (encryptedData: string) => Promise<void>;
  loadAuditLogs: () => Promise<void>;
  loadReviewQueue: () => Promise<void>;
  reviewNode: (nodeId: string, decision: 'approved' | 'returned', notes: string) => Promise<void>;
  wipeDatabase: () => Promise<void>;
  toggleFilter: (nodeType: string) => void;
  loadNotes: (caseId: string) => Promise<void>;
  addNote: (content: string, linkedNodeIds: string[]) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
}

const ENTITY_TYPES = new Set(['person', 'vehicle', 'phone', 'location', 'event', 'digital_account', 'organisation', 'evidence']);
const MAX_ATTRIBUTE_ENTRIES = 40;
const MAX_ATTRIBUTE_KEY_LENGTH = 80;
const MAX_ATTRIBUTE_VALUE_LENGTH = 500;
const MAX_NOTE_LENGTH = 10000;
const MAX_REVIEW_NOTE_LENGTH = 2000;
const MAX_IMPORT_BASE64_LENGTH = 12 * 1024 * 1024;
const MAX_IMPORT_NODES = 2000;
const MAX_IMPORT_EDGES = 6000;
const MAX_IMPORT_NOTES = 2000;

const createId = (prefix: string): string => window.crypto?.randomUUID ? `${prefix}_${window.crypto.randomUUID()}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const currentOperator = (): string => useAuthStore.getState().currentUser?.badge || 'SYSTEM_UNKNOWN';
const assertCurrentPermission = (permission: Parameters<typeof assertPermission>[1]): void =>
  assertPermission(useAuthStore.getState().currentUser?.role, permission);

const ensureCaseAccess = async (caseId: string): Promise<void> => {
  const user = useAuthStore.getState().currentUser;
  if (!user) throw new Error('An active operator session is required.');
  if (user.role !== 'field') return;
  const db = await getDb();
  const assignment = await db.query("SELECT id FROM case_assignments WHERE case_id = ? AND operator_id = ? AND status = 'active' LIMIT 1", [caseId, user.id]);
  if (!assignment.values?.length) throw new Error('This operation is not assigned to the current field operator.');
};

const ensureNotesTable = async () => {
  const db = await getDb();
  await db.run('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, content TEXT NOT NULL, linked_nodes TEXT NOT NULL, created_at TEXT NOT NULL)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_notes_case_id ON notes(case_id);');
};

const normaliseOccurredAt = (value: string | undefined): string | null => {
  const candidate = value?.trim();
  if (!candidate) return null;
  const timestamp = new Date(candidate);
  if (Number.isNaN(timestamp.getTime())) throw new Error('Observed date and time is not valid.');
  return timestamp.toISOString();
};

const normaliseAttributes = (attributes: Record<string, string> = {}): Record<string, string> => {
  const entries = Object.entries(attributes)
    .map(([key, value]) => [key.trim().slice(0, MAX_ATTRIBUTE_KEY_LENGTH), String(value).trim().slice(0, MAX_ATTRIBUTE_VALUE_LENGTH)] as const)
    .filter(([key, value]) => Boolean(key && value))
    .slice(0, MAX_ATTRIBUTE_ENTRIES);
  return Object.fromEntries(entries);
};

const parseLinkedNodes = (rawValue: string | null | undefined): string[] => {
  try {
    const parsed = JSON.parse(rawValue || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const readElementData = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  return data && typeof data === 'object' ? data as Record<string, unknown> : null;
};

export const validateImportedPackage = (candidate: unknown) => {
  if (!candidate || typeof candidate !== 'object') throw new Error('Package is not a JSON object.');
  const data = candidate as Record<string, unknown>;
  const metadata = data.metadata;
  if (!metadata || typeof metadata !== 'object') throw new Error('Package metadata is missing.');
  const reference = String((metadata as Record<string, unknown>).reference || '').trim().slice(0, 80);
  const title = String((metadata as Record<string, unknown>).title || '').trim().slice(0, 160);
  const classification = String((metadata as Record<string, unknown>).classification || 'OFFICIAL').trim().slice(0, 40);
  if (!reference || !title) throw new Error('Package metadata is incomplete.');

  const nodes = Array.isArray(data.intelligence_nodes) ? data.intelligence_nodes : [];
  const relationships = Array.isArray(data.relationships) ? data.relationships : [];
  const notes = Array.isArray(data.notes) ? data.notes : [];
  if (nodes.length > MAX_IMPORT_NODES || relationships.length > MAX_IMPORT_EDGES || notes.length > MAX_IMPORT_NOTES) {
    throw new Error('Package exceeds the supported import size.');
  }
  return { reference, title, classification, nodes, relationships, notes };
};

const withTransaction = async <T>(db: any, operation: () => Promise<T>): Promise<T> => {
  await db.execute('BEGIN IMMEDIATE;');
  try {
    const result = await operation();
    await db.execute('COMMIT;');
    return result;
  } catch (error) {
    try { await db.execute('ROLLBACK;'); } catch { /* Transaction was not opened or has already been closed. */ }
    throw error;
  }
};

export const migrateLegacyEvidenceAttachments = async (db: any, records: any[]): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  for (const record of records) {
    const legacyUri = String(record.attachment_uri || '');
    if (!legacyUri || legacyUri.endsWith('.cgm')) continue;
    try {
      const legacyFile = await Filesystem.readFile({ path: legacyUri });
      if (typeof legacyFile.data !== 'string') continue;
      const encryptedUri = await writeEncryptedEvidenceMedia(String(record.case_id), String(record.attachment_name), legacyFile.data);
      const now = new Date().toISOString();
      await withTransaction(db, async () => {
        await db.run('UPDATE evidence_provenance SET attachment_uri = ?, updated_at = ? WHERE id = ?', [encryptedUri, now, record.id]);
        await appendAuditEntry(db, 'MIGRATE_EVIDENCE_MEDIA', String(record.id), `Migrated legacy attachment ${String(record.attachment_name)} to encrypted device storage.`, currentOperator());
      });
      record.attachment_uri = encryptedUri;
      record.updated_at = now;
      try { await Filesystem.deleteFile({ path: legacyUri }); } catch { /* The DB now references the protected copy; retain an inaccessible legacy file if deletion fails. */ }
    } catch (error) {
      console.warn('Legacy evidence attachment migration deferred.', error);
    }
  }
};

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [],
  activeCaseId: null,
  graphElements: [],
  auditLogs: [],
  auditVerification: null,
  reviewQueue: [],
  caseAssignments: [],
  assignableFieldOperators: [],
  dataMarkings: [],
  disclosureRecords: [],
  fieldTasks: [],
  playbookMilestones: [],
  caseLeads: [],
  notes: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  connectingFromId: null,
  hiddenNodeTypes: [],

  loadCases: async () => {
    const db = await getDb();
    const user = useAuthStore.getState().currentUser;
    const response = user?.role === 'field'
      ? await db.query(
        `SELECT c.*, ca.id AS assignment_id, ca.assignment_note, ca.assigned_at, ca.assigned_by
         FROM cases c
         INNER JOIN case_assignments ca ON ca.case_id = c.id
         WHERE ca.operator_id = ? AND ca.status = 'active'
         ORDER BY ca.assigned_at DESC, c.date_opened DESC`,
        [user.id],
      )
      : await db.query('SELECT * FROM cases ORDER BY date_opened DESC');
    const cases = response.values || [];
    const activeCaseId = get().activeCaseId;
    const activeCaseIsVisible = !activeCaseId || cases.some((entry: Case) => entry.id === activeCaseId);
    set(activeCaseIsVisible ? { cases } : { cases, activeCaseId: null, graphElements: [], notes: [], selectedNodeId: null, selectedEdgeId: null });
  },

  setActiveCase: (id) => {
    set({ activeCaseId: id, hiddenNodeTypes: [], selectedNodeId: null, selectedEdgeId: null });
    void get().loadGraphElements(id);
    void get().loadNotes(id);
  },

  addCase: async (title, refNumber, caseType, classification) => {
    assertCurrentPermission('case:create');
    const cleanTitle = title.trim().slice(0, 160);
    const cleanReference = refNumber.trim().toUpperCase().slice(0, 80);
    if (!cleanTitle || !cleanReference) throw new Error('Case title and reference are required.');
    const id = createId('case');
    const now = new Date().toISOString();
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run(
        'INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, cleanReference, cleanTitle, caseType.trim().slice(0, 60) || 'other', 'active', classification.trim().slice(0, 40) || 'OFFICIAL', now, now, now],
      );
      await appendAuditEntry(db, 'CREATE_CASE', id, `Created ${cleanReference}`, currentOperator());
    });
    await get().loadCases();
  },

  archiveCase: async (caseId) => {
    assertCurrentPermission('case:archive');
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run("UPDATE cases SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await appendAuditEntry(db, 'ARCHIVE_CASE', caseId, 'Archived case', currentOperator());
    });
    await get().loadCases();
  },

  restoreCase: async (caseId) => {
    assertCurrentPermission('case:restore');
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run("UPDATE cases SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await appendAuditEntry(db, 'RESTORE_CASE', caseId, 'Restored case', currentOperator());
    });
    await get().loadCases();
  },

  loadCaseAssignments: async (caseId) => {
    assertCurrentPermission('case:assign');
    const db = await getDb();
    const response = await db.query(
      `SELECT ca.*, u.badge AS operator_badge, u.name AS operator_name
       FROM case_assignments ca
       INNER JOIN users u ON u.id = ca.operator_id
       WHERE ca.case_id = ?
       ORDER BY CASE ca.status WHEN 'active' THEN 0 ELSE 1 END, ca.assigned_at DESC`,
      [caseId],
    );
    set({ caseAssignments: (response.values || []).map((record: any): CaseAssignment => ({
      id: record.id,
      caseId: record.case_id,
      operatorId: record.operator_id,
      operatorBadge: record.operator_badge,
      operatorName: record.operator_name,
      status: record.status === 'removed' ? 'removed' : 'active',
      note: record.assignment_note || '',
      assignedBy: record.assigned_by,
      assignedAt: record.assigned_at,
      removedBy: record.removed_by || null,
      removedAt: record.removed_at || null,
      removalReason: record.removal_reason || null,
    })) });
  },

  loadAssignableFieldOperators: async () => {
    assertCurrentPermission('case:assign');
    const db = await getDb();
    const response = await db.query("SELECT id, badge, name, last_login FROM users WHERE role = 'field' AND COALESCE(status, 'active') = 'active' ORDER BY badge COLLATE NOCASE ASC");
    set({ assignableFieldOperators: (response.values || []).map((record: any): AssignableFieldOperator => ({ id: record.id, badge: record.badge, name: record.name, lastLogin: record.last_login || null })) });
  },

  assignFieldOperator: async (caseId, operatorId, note) => {
    assertCurrentPermission('case:assign');
    const cleanNote = note.trim().slice(0, 500);
    const db = await getDb();
    const [caseResult, operatorResult] = await Promise.all([
      db.query('SELECT reference_number, status FROM cases WHERE id = ? LIMIT 1', [caseId]),
      db.query("SELECT id, badge, name FROM users WHERE id = ? AND role = 'field' AND COALESCE(status, 'active') = 'active' LIMIT 1", [operatorId]),
    ]);
    const caseRecord = caseResult.values?.[0];
    const operator = operatorResult.values?.[0];
    if (!caseRecord) throw new Error('Operation record was not found.');
    if (caseRecord.status !== 'active') throw new Error('Only active operations can be assigned to field operators.');
    if (!operator) throw new Error('Select an active field operator.');

    const now = new Date().toISOString();
    await withTransaction(db, async () => {
      const existing = await db.query('SELECT id FROM case_assignments WHERE case_id = ? AND operator_id = ? LIMIT 1', [caseId, operatorId]);
      if (existing.values?.[0]?.id) {
        await db.run('UPDATE case_assignments SET status = ?, assignment_note = ?, assigned_by = ?, assigned_at = ?, updated_at = ?, removed_by = NULL, removed_at = NULL, removal_reason = NULL WHERE id = ?', ['active', cleanNote || null, currentOperator(), now, now, existing.values[0].id]);
      } else {
        await db.run('INSERT INTO case_assignments (id, case_id, operator_id, status, assignment_note, assigned_by, assigned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [createId('assignment'), caseId, operatorId, 'active', cleanNote || null, currentOperator(), now, now]);
      }
      await appendAuditEntry(db, 'ASSIGN_FIELD_OPERATOR', caseId, `Assigned ${operator.badge} to ${caseRecord.reference_number}${cleanNote ? `: ${cleanNote}` : ''}`, currentOperator());
    });
    await get().loadCaseAssignments(caseId);
  },

  removeFieldAssignment: async (assignmentId, reason) => {
    assertCurrentPermission('case:assign');
    const cleanReason = reason.trim();
    if (cleanReason.length < 5 || cleanReason.length > 500) throw new Error('A removal reason between 5 and 500 characters is required.');
    const db = await getDb();
    const response = await db.query(
      `SELECT ca.*, c.reference_number, u.badge AS operator_badge
       FROM case_assignments ca
       INNER JOIN cases c ON c.id = ca.case_id
       INNER JOIN users u ON u.id = ca.operator_id
       WHERE ca.id = ? LIMIT 1`,
      [assignmentId],
    );
    const assignment = response.values?.[0];
    if (!assignment) throw new Error('Assignment record was not found.');
    if (assignment.status !== 'active') throw new Error('This assignment has already been removed.');
    const now = new Date().toISOString();
    await withTransaction(db, async () => {
      await db.run('UPDATE case_assignments SET status = ?, updated_at = ?, removed_by = ?, removed_at = ?, removal_reason = ? WHERE id = ?', ['removed', now, currentOperator(), now, cleanReason, assignmentId]);
      await appendAuditEntry(db, 'REMOVE_FIELD_ASSIGNMENT', assignment.case_id, `Removed ${assignment.operator_badge} from ${assignment.reference_number}: ${cleanReason}`, currentOperator());
    });
    await get().loadCaseAssignments(assignment.case_id);
  },

  loadDataMarkings: async (caseId) => {
    assertCurrentPermission('case:mark');
    const db = await getDb();
    const response = await db.query('SELECT * FROM data_markings WHERE case_id = ? ORDER BY object_type, object_id, marking', [caseId]);
    set({ dataMarkings: (response.values || []).map((record: any): DataMarking => ({
      id: String(record.id), caseId: String(record.case_id), objectType: record.object_type as MarkingObjectType,
      objectId: String(record.object_id), marking: String(record.marking), handlingInstructions: String(record.handling_instructions || ''),
      createdBy: String(record.created_by), createdAt: String(record.created_at),
    })) });
  },

  addDataMarking: async (objectType, objectId, marking, handlingInstructions = '') => {
    assertCurrentPermission('case:mark');
    const activeCaseId = get().activeCaseId;
    if (!activeCaseId) throw new Error('Select an operation before applying a marking.');
    const cleanMarking = marking.trim().toUpperCase();
    const cleanInstructions = handlingInstructions.trim().slice(0, 500);
    if (!/^[A-Z0-9_-]{3,64}$/.test(cleanMarking)) throw new Error('Marking must contain 3–64 letters, numbers, underscores, or hyphens.');
    if (!['case', 'node', 'note', 'evidence'].includes(objectType)) throw new Error('Unsupported marking target.');
    if (!objectId.trim()) throw new Error('Marking target is required.');
    const db = await getDb();
    const now = new Date().toISOString();
    const id = createId('marking');
    await withTransaction(db, async () => {
      await db.run('INSERT INTO data_markings (id, case_id, object_type, object_id, marking, handling_instructions, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, activeCaseId, objectType, objectId.trim(), cleanMarking, cleanInstructions || null, currentOperator(), now, now]);
      await appendAuditEntry(db, 'APPLY_DATA_MARKING', id, `Applied ${cleanMarking} marking to ${objectType} ${objectId.trim()}`, currentOperator());
    });
    await get().loadDataMarkings(activeCaseId);
  },

  removeDataMarking: async (markingId) => {
    assertCurrentPermission('case:mark');
    const db = await getDb();
    const response = await db.query('SELECT * FROM data_markings WHERE id = ? LIMIT 1', [markingId]);
    const marking = response.values?.[0];
    if (!marking) throw new Error('Data marking was not found.');
    await withTransaction(db, async () => {
      await db.run('DELETE FROM data_markings WHERE id = ?', [markingId]);
      await appendAuditEntry(db, 'REMOVE_DATA_MARKING', markingId, `Removed ${marking.marking} marking from ${marking.object_type} ${marking.object_id}`, currentOperator());
    });
    await get().loadDataMarkings(String(marking.case_id));
  },

  loadDisclosureRecords: async (caseId) => {
    assertCurrentPermission('case:export');
    const db = await getDb();
    const response = await db.query(
      `SELECT dr.*, fd.manifest_digest, fd.verification_status
       FROM disclosure_register dr
       INNER JOIN forensic_dossiers fd ON fd.id = dr.dossier_id
       WHERE dr.case_id = ?
       ORDER BY dr.disclosed_at DESC`,
      [caseId],
    );
    set({ disclosureRecords: (response.values || []).map((record: any): DisclosureRecord => ({
      id: String(record.id), dossierId: String(record.dossier_id), caseId: String(record.case_id), purpose: String(record.purpose),
      recipientDescription: String(record.recipient_description), authorizationReference: record.authorization_reference ? String(record.authorization_reference) : null,
      disclosedBy: String(record.disclosed_by), disclosedAt: String(record.disclosed_at), status: record.status === 'cancelled' ? 'cancelled' : record.status === 'shared' ? 'shared' : 'prepared',
      manifestDigest: String(record.manifest_digest), verificationStatus: String(record.verification_status),
    })) });
  },

  loadFieldTasks: async (caseId) => {
    const user = useAuthStore.getState().currentUser;
    if (!user) throw new Error('Sign in before loading field tasks.');
    await ensureCaseAccess(caseId);
    const db = await getDb();
    const response = user.role === 'field'
      ? await db.query(
        `SELECT ft.*, u.badge AS assignee_badge, u.name AS assignee_name FROM field_tasks ft
         INNER JOIN users u ON u.id = ft.assignee_id
         WHERE ft.case_id = ? AND ft.assignee_id = ? ORDER BY CASE ft.status WHEN 'assigned' THEN 0 ELSE 1 END, COALESCE(ft.due_at, ft.created_at), ft.created_at DESC`,
        [caseId, user.id],
      )
      : await db.query(
        `SELECT ft.*, u.badge AS assignee_badge, u.name AS assignee_name FROM field_tasks ft
         INNER JOIN users u ON u.id = ft.assignee_id
         WHERE ft.case_id = ? ORDER BY CASE ft.status WHEN 'assigned' THEN 0 ELSE 1 END, COALESCE(ft.due_at, ft.created_at), ft.created_at DESC`,
        [caseId],
      );
    set({ fieldTasks: (response.values || []).map((record: any): FieldTask => ({
      id: String(record.id), caseId: String(record.case_id), assigneeId: String(record.assignee_id), assigneeBadge: String(record.assignee_badge), assigneeName: String(record.assignee_name),
      title: String(record.title), objective: String(record.objective), checklist: Array.isArray(record.checklist) ? record.checklist.map(String) : (() => { try { const parsed = JSON.parse(String(record.checklist || '[]')); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } })(),
      contextNote: String(record.context_note || ''), dueAt: record.due_at ? String(record.due_at) : null, status: record.status === 'complete' ? 'complete' : record.status === 'unable' ? 'unable' : 'assigned',
      createdBy: String(record.created_by), createdAt: String(record.created_at), completedBy: record.completed_by ? String(record.completed_by) : null, completedAt: record.completed_at ? String(record.completed_at) : null,
      completionNote: String(record.completion_note || ''), inabilityReason: String(record.inability_reason || ''),
    })) });
  },

  createFieldTask: async (caseId, assigneeId, title, objective, checklist, contextNote = '', dueAt = '') => {
    assertCurrentPermission('case:assign');
    const cleanTitle = title.trim().slice(0, 160);
    const cleanObjective = objective.trim().slice(0, 1000);
    const cleanChecklist = [...new Set(checklist.map((item) => item.trim().slice(0, 300)).filter(Boolean))].slice(0, 20);
    const cleanContext = contextNote.trim().slice(0, 1000);
    const cleanDueAt = dueAt ? normaliseOccurredAt(dueAt) : null;
    if (cleanTitle.length < 3) throw new Error('Task title must contain at least three characters.');
    if (cleanObjective.length < 5) throw new Error('Task objective must contain at least five characters.');
    const db = await getDb();
    const assignment = await db.query("SELECT id FROM case_assignments WHERE case_id = ? AND operator_id = ? AND status = 'active' LIMIT 1", [caseId, assigneeId]);
    if (!assignment.values?.length) throw new Error('A field task can only be assigned to an active field-case assignment.');
    const now = new Date().toISOString();
    const taskId = createId('task');
    await withTransaction(db, async () => {
      await db.run('INSERT INTO field_tasks (id, case_id, assignee_id, title, objective, checklist, context_note, due_at, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [taskId, caseId, assigneeId, cleanTitle, cleanObjective, JSON.stringify(cleanChecklist), cleanContext || null, cleanDueAt, 'assigned', currentOperator(), now, now]);
      await appendAuditEntry(db, 'CREATE_FIELD_TASK', taskId, `Assigned field task “${cleanTitle}” to ${assigneeId}`, currentOperator());
    });
    await get().loadFieldTasks(caseId);
  },

  completeFieldTask: async (taskId, status, note) => {
    assertCurrentPermission('field:task:complete');
    const user = useAuthStore.getState().currentUser;
    if (!user) throw new Error('Sign in before completing a field task.');
    const cleanNote = note.trim().slice(0, 1000);
    if (status === 'unable' && cleanNote.length < 5) throw new Error('State why the task could not be completed.');
    const db = await getDb();
    const response = await db.query('SELECT * FROM field_tasks WHERE id = ? LIMIT 1', [taskId]);
    const task = response.values?.[0];
    if (!task) throw new Error('Field task was not found.');
    if (task.status !== 'assigned') throw new Error('Only an assigned task can be completed or returned.');
    if (user.role === 'field' && String(task.assignee_id) !== user.id) throw new Error('Field operators can complete only their own assigned tasks.');
    const now = new Date().toISOString();
    await withTransaction(db, async () => {
      await db.run('UPDATE field_tasks SET status = ?, completed_by = ?, completed_at = ?, completion_note = ?, inability_reason = ?, updated_at = ? WHERE id = ?', [status, user.badge, now, status === 'complete' ? cleanNote || null : null, status === 'unable' ? cleanNote : null, now, taskId]);
      await appendAuditEntry(db, status === 'complete' ? 'COMPLETE_FIELD_TASK' : 'RETURN_FIELD_TASK', taskId, `${status === 'complete' ? 'Completed' : 'Returned'} field task ${task.title}`, user.badge);
    });
    await get().loadFieldTasks(String(task.case_id));
  },

  loadPlaybookMilestones: async (caseId) => {
    await ensureCaseAccess(caseId);
    const db = await getDb();
    const response = await db.query("SELECT * FROM case_playbook_milestones WHERE case_id = ? ORDER BY CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END, COALESCE(due_at, created_at), created_at", [caseId]);
    set({ playbookMilestones: (response.values || []).map((record: any): CasePlaybookMilestone => ({
      id: String(record.id), caseId: String(record.case_id), title: String(record.title), objective: String(record.objective), category: String(record.category),
      ownerRole: ['admin', 'supervisor', 'analyst', 'field'].includes(record.owner_role) ? record.owner_role as PlaybookOwnerRole : 'analyst',
      status: ['not_started', 'in_progress', 'blocked', 'complete'].includes(record.status) ? record.status as PlaybookMilestoneStatus : 'not_started',
      dueAt: record.due_at ? String(record.due_at) : null, linkedObjectIds: parseLinkedNodes(record.linked_object_ids), blockerReason: String(record.blocker_reason || ''), completionNote: String(record.completion_note || ''),
      createdBy: String(record.created_by), createdAt: String(record.created_at), updatedBy: String(record.updated_by), updatedAt: String(record.updated_at), completedBy: record.completed_by ? String(record.completed_by) : null, completedAt: record.completed_at ? String(record.completed_at) : null,
    })) });
  },

  createPlaybookMilestone: async (caseId, title, objective, category, ownerRole, dueAt = '', linkedObjectIds = []) => {
    assertCurrentPermission('case:plan');
    await ensureCaseAccess(caseId);
    const cleanTitle = title.trim().slice(0, 160);
    const cleanObjective = objective.trim().slice(0, 1000);
    const cleanCategory = category.trim().slice(0, 80);
    const cleanDueAt = dueAt ? normaliseOccurredAt(dueAt) : null;
    const cleanLinkedIds = [...new Set(linkedObjectIds.map((id) => id.trim().slice(0, 160)).filter(Boolean))].slice(0, 30);
    if (cleanTitle.length < 3) throw new Error('Milestone title must contain at least three characters.');
    if (cleanObjective.length < 5) throw new Error('Milestone objective must contain at least five characters.');
    if (cleanCategory.length < 2) throw new Error('Milestone category must contain at least two characters.');
    if (!['admin', 'supervisor', 'analyst', 'field'].includes(ownerRole)) throw new Error('Milestone owner role is not supported.');
    const now = new Date().toISOString();
    const milestoneId = createId('milestone');
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('INSERT INTO case_playbook_milestones (id, case_id, title, objective, category, owner_role, status, due_at, linked_object_ids, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [milestoneId, caseId, cleanTitle, cleanObjective, cleanCategory, ownerRole, 'not_started', cleanDueAt, JSON.stringify(cleanLinkedIds), currentOperator(), now, currentOperator(), now]);
      await appendAuditEntry(db, 'CREATE_CASE_MILESTONE', milestoneId, `Created ${cleanCategory} milestone: ${cleanTitle}`, currentOperator());
    });
    await get().loadPlaybookMilestones(caseId);
  },

  updatePlaybookMilestone: async (milestoneId, status, note = '') => {
    assertCurrentPermission('case:plan');
    if (!['not_started', 'in_progress', 'blocked', 'complete'].includes(status)) throw new Error('Milestone status is not supported.');
    const cleanNote = note.trim().slice(0, 1000);
    if ((status === 'blocked' || status === 'complete') && cleanNote.length < 5) throw new Error(status === 'blocked' ? 'State the blocker before blocking a milestone.' : 'Record a completion note before completing a milestone.');
    const db = await getDb();
    const response = await db.query('SELECT * FROM case_playbook_milestones WHERE id = ? LIMIT 1', [milestoneId]);
    const milestone = response.values?.[0];
    if (!milestone) throw new Error('Case milestone was not found.');
    await ensureCaseAccess(String(milestone.case_id));
    const now = new Date().toISOString();
    await withTransaction(db, async () => {
      await db.run('UPDATE case_playbook_milestones SET status = ?, blocker_reason = ?, completion_note = ?, completed_by = ?, completed_at = ?, updated_by = ?, updated_at = ? WHERE id = ?', [status, status === 'blocked' ? cleanNote : null, status === 'complete' ? cleanNote : null, status === 'complete' ? currentOperator() : null, status === 'complete' ? now : null, currentOperator(), now, milestoneId]);
      await appendAuditEntry(db, status === 'blocked' ? 'BLOCK_CASE_MILESTONE' : status === 'complete' ? 'COMPLETE_CASE_MILESTONE' : 'UPDATE_CASE_MILESTONE', milestoneId, `${status.replace('_', ' ')} milestone: ${milestone.title}`, currentOperator());
    });
    await get().loadPlaybookMilestones(String(milestone.case_id));
  },

  loadCaseLeads: async (caseId) => {
    await ensureCaseAccess(caseId);
    const db = await getDb();
    const response = await db.query("SELECT * FROM case_leads WHERE case_id = ? ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'under_review' THEN 1 WHEN 'actioned' THEN 2 ELSE 3 END, received_at DESC", [caseId]);
    set({ caseLeads: (response.values || []).map((record: any): CaseLead => ({
      id: String(record.id), caseId: String(record.case_id), title: String(record.title), summary: String(record.summary), sourceType: String(record.source_type), sourceReference: String(record.source_reference), receivedAt: String(record.received_at),
      sensitivityMarking: String(record.sensitivity_marking || ''), status: ['new', 'under_review', 'actioned', 'closed', 'promoted'].includes(record.status) ? record.status as CaseLeadStatus : 'new', dispositionNote: String(record.disposition_note || ''),
      promotedNodeId: record.promoted_node_id ? String(record.promoted_node_id) : null, promotedBy: record.promoted_by ? String(record.promoted_by) : null, promotedAt: record.promoted_at ? String(record.promoted_at) : null,
      createdBy: String(record.created_by), createdAt: String(record.created_at), updatedBy: String(record.updated_by), updatedAt: String(record.updated_at),
    })) });
  },

  createCaseLead: async (caseId, title, summary, sourceType, sourceReference, sensitivityMarking = '', receivedAt = '') => {
    assertCurrentPermission('lead:create');
    await ensureCaseAccess(caseId);
    const cleanTitle = title.trim().slice(0, 160);
    const cleanSummary = summary.trim().slice(0, 3000);
    const cleanSourceType = sourceType.trim().slice(0, 80);
    const cleanSourceReference = sourceReference.trim().slice(0, 240);
    const cleanSensitivity = sensitivityMarking.trim().toUpperCase().slice(0, 80);
    const timestamp = receivedAt ? normaliseOccurredAt(receivedAt) : new Date().toISOString();
    if (cleanTitle.length < 3) throw new Error('Lead title must contain at least three characters.');
    if (cleanSummary.length < 5) throw new Error('Lead summary must contain at least five characters.');
    if (!cleanSourceType || !cleanSourceReference) throw new Error('Lead source type and reference are required.');
    const now = new Date().toISOString();
    const leadId = createId('lead');
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('INSERT INTO case_leads (id, case_id, title, summary, source_type, source_reference, received_at, sensitivity_marking, status, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [leadId, caseId, cleanTitle, cleanSummary, cleanSourceType, cleanSourceReference, timestamp, cleanSensitivity || null, 'new', currentOperator(), now, currentOperator(), now]);
      await appendAuditEntry(db, 'CREATE_CASE_LEAD', leadId, `Recorded local lead: ${cleanTitle}`, currentOperator());
    });
    await get().loadCaseLeads(caseId);
  },

  updateCaseLead: async (leadId, status, dispositionNote = '') => {
    assertCurrentPermission('lead:manage');
    if (!['new', 'under_review', 'actioned', 'closed'].includes(status)) throw new Error('Lead status is not supported.');
    const cleanNote = dispositionNote.trim().slice(0, 1000);
    if ((status === 'actioned' || status === 'closed') && cleanNote.length < 5) throw new Error('Record a disposition note before closing or actioning a lead.');
    const db = await getDb();
    const response = await db.query('SELECT * FROM case_leads WHERE id = ? LIMIT 1', [leadId]);
    const lead = response.values?.[0];
    if (!lead) throw new Error('Case lead was not found.');
    if (lead.status === 'promoted') throw new Error('A promoted lead is immutable. Update the linked intelligence record instead.');
    await ensureCaseAccess(String(lead.case_id));
    const now = new Date().toISOString();
    await withTransaction(db, async () => {
      await db.run('UPDATE case_leads SET status = ?, disposition_note = ?, updated_by = ?, updated_at = ? WHERE id = ?', [status, cleanNote || null, currentOperator(), now, leadId]);
      await appendAuditEntry(db, 'UPDATE_CASE_LEAD', leadId, `${status.replace('_', ' ')} local lead: ${lead.title}`, currentOperator());
    });
    await get().loadCaseLeads(String(lead.case_id));
  },

  promoteCaseLead: async (leadId, nodeType, confidence, attributes = {}, occurredAt = '') => {
    assertCurrentPermission('lead:manage');
    assertCurrentPermission('intelligence:create');
    if (!ENTITY_TYPES.has(nodeType) || nodeType === 'evidence') throw new Error('Choose a non-evidence intelligence type when promoting a lead.');
    const db = await getDb();
    const response = await db.query('SELECT * FROM case_leads WHERE id = ? LIMIT 1', [leadId]);
    const lead = response.values?.[0];
    if (!lead) throw new Error('Case lead was not found.');
    if (lead.status === 'promoted') throw new Error('This lead has already been promoted to intelligence.');
    if (get().activeCaseId !== String(lead.case_id)) throw new Error('Open the lead’s case before promoting it to intelligence.');
    await ensureCaseAccess(String(lead.case_id));
    const now = new Date().toISOString();
    const nodeId = createId('node');
    const cleanAttributes = normaliseAttributes({ ...attributes, 'Lead reference': String(lead.id), 'Lead source': `${String(lead.source_type)}: ${String(lead.source_reference)}` });
    const normalisedOccurredAt = normaliseOccurredAt(occurredAt || String(lead.received_at));
    const cleanLabel = String(lead.title).trim().slice(0, 160);
    await withTransaction(db, async () => {
      await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status, submitted_by, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nodeId, lead.case_id, cleanLabel, nodeType, Math.max(1, Math.min(5, Math.round(confidence))), now, normalisedOccurredAt, JSON.stringify(cleanAttributes), 'not_required', null, null]);
      await db.run("UPDATE case_leads SET status = 'promoted', disposition_note = ?, promoted_node_id = ?, promoted_by = ?, promoted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?", ['Promoted to intelligence record.', nodeId, currentOperator(), now, currentOperator(), now, leadId]);
      await appendAuditEntry(db, 'PROMOTE_CASE_LEAD', leadId, `Promoted local lead to ${nodeType}: ${cleanLabel} (${nodeId})`, currentOperator());
    });
    set({ graphElements: [...get().graphElements, { data: { id: nodeId, label: cleanLabel, type: nodeType, confidence: Math.max(1, Math.min(5, Math.round(confidence))), created_at: now, occurred_at: normalisedOccurredAt, attributes: cleanAttributes, review_status: 'not_required', submitted_by: null, submitted_at: null, reviewed_by: null, reviewed_at: null, review_notes: null } }] });
    await get().loadCaseLeads(String(lead.case_id));
  },

  loadGraphElements: async (caseId) => {
    await ensureCaseAccess(caseId);
    const db = await getDb();
    const nodesResponse = await db.query('SELECT * FROM nodes WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
    const edgesResponse = await db.query('SELECT * FROM edges WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
    const evidenceResponse = await db.query('SELECT * FROM evidence_provenance WHERE case_id = ?', [caseId]);
    const evidenceRecords = evidenceResponse.values || [];
    await migrateLegacyEvidenceAttachments(db, evidenceRecords);
    const evidenceByNodeId = new Map<string, EvidenceProvenance>(evidenceRecords.map((record: any) => [record.node_id, {
      id: record.id,
      caseId: record.case_id,
      nodeId: record.node_id,
      exhibitNumber: record.exhibit_number,
      sourceType: record.source_type,
      sourceReference: record.source_reference,
      acquiredAt: record.acquired_at,
      acquiredBy: record.acquired_by,
      handlingStatus: record.handling_status,
      verificationStatus: record.verification_status,
      chainOfCustody: record.chain_of_custody,
      attachmentName: record.attachment_name || '',
      attachmentUri: record.attachment_uri || '',
      attachmentMimeType: record.attachment_mime_type || '',
      attachmentDigest: record.attachment_digest || '',
      fingerprint: record.fingerprint,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      createdBy: record.created_by,
    }]));
    const elements: GraphElement[] = [];
    (nodesResponse.values || []).forEach((node: any) => {
      let attributes: Record<string, string> = {};
      try { attributes = normaliseAttributes(JSON.parse(node.attributes || '{}')); } catch { /* A malformed legacy attribute is safely ignored. */ }
      elements.push({ data: { id: node.id, label: node.label, type: node.type, confidence: node.confidence, created_at: node.created_at, occurred_at: node.occurred_at, attributes, evidence: evidenceByNodeId.get(node.id), review_status: node.review_status || 'not_required', submitted_by: node.submitted_by || null, submitted_at: node.submitted_at || null, reviewed_by: node.reviewed_by || null, reviewed_at: node.reviewed_at || null, review_notes: node.review_notes || null } });
    });
    (edgesResponse.values || []).forEach((edge: any) => {
      elements.push({ data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label, created_at: edge.created_at } });
    });
    set({ graphElements: elements });
  },

  addNode: async (nodeType, label, confidence, attributes = {}, evidence = {}, occurredAt) => {
    assertCurrentPermission('intelligence:create');
    const { activeCaseId, graphElements } = get();
    const cleanLabel = label.trim().slice(0, 160);
    if (!activeCaseId) throw new Error('Select a case before adding an entity.');
    await ensureCaseAccess(activeCaseId);
    if (!ENTITY_TYPES.has(nodeType)) throw new Error('Unsupported entity type.');
    if (!cleanLabel) throw new Error('Entity label is required.');
    const id = createId('node');
    const now = new Date().toISOString();
    const cleanAttributes = normaliseAttributes(attributes);
    const reviewStatus: ReviewStatus = useAuthStore.getState().currentUser?.role === 'field' ? 'pending' : 'not_required';
    const submittedBy = reviewStatus === 'pending' ? currentOperator() : null;
    const submittedAt = reviewStatus === 'pending' ? now : null;
    const normalisedEvidence = nodeType === 'evidence' ? normaliseEvidenceProvenance(evidence) : null;
    if (normalisedEvidence) validateEvidenceProvenance(normalisedEvidence);
    const normalisedOccurredAt = normaliseOccurredAt(occurredAt || normalisedEvidence?.acquiredAt);
    const db = await getDb();
    let evidenceRecord: EvidenceProvenance | undefined;
    await withTransaction(db, async () => {
      await db.run(
        'INSERT INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status, submitted_by, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, activeCaseId, cleanLabel, nodeType, Math.max(1, Math.min(5, Math.round(confidence))), now, normalisedOccurredAt, JSON.stringify(cleanAttributes), reviewStatus, submittedBy, submittedAt],
      );
      if (normalisedEvidence) {
        const provenanceId = createId('evidence');
        evidenceRecord = {
          id: provenanceId,
          caseId: activeCaseId,
          nodeId: id,
          ...normalisedEvidence,
          fingerprint: await createEvidenceFingerprint(normalisedEvidence),
          createdAt: now,
          updatedAt: now,
          createdBy: currentOperator(),
        };
        await db.run(
          `INSERT INTO evidence_provenance (id, case_id, node_id, exhibit_number, source_type, source_reference, acquired_at, acquired_by, handling_status, verification_status, chain_of_custody, fingerprint, attachment_name, attachment_uri, attachment_mime_type, attachment_digest, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            evidenceRecord.id, evidenceRecord.caseId, evidenceRecord.nodeId, evidenceRecord.exhibitNumber,
            evidenceRecord.sourceType, evidenceRecord.sourceReference, evidenceRecord.acquiredAt, evidenceRecord.acquiredBy,
            evidenceRecord.handlingStatus, evidenceRecord.verificationStatus, evidenceRecord.chainOfCustody, evidenceRecord.fingerprint,
            evidenceRecord.attachmentName, evidenceRecord.attachmentUri, evidenceRecord.attachmentMimeType, evidenceRecord.attachmentDigest,
            evidenceRecord.createdAt, evidenceRecord.updatedAt, evidenceRecord.createdBy,
          ],
        );
      }
      await appendAuditEntry(db, reviewStatus === 'pending' ? 'SUBMIT_INTELLIGENCE_FOR_REVIEW' : (normalisedEvidence ? 'REGISTER_EVIDENCE' : 'ADD_NODE'), id, reviewStatus === 'pending' ? `Submitted ${nodeType}: ${cleanLabel} for supervisor review.` : (normalisedEvidence ? `Registered evidence ${normalisedEvidence.exhibitNumber}: ${cleanLabel}` : `Added ${nodeType}: ${cleanLabel}`), currentOperator());
    });
    set({ graphElements: [...graphElements, { data: { id, label: cleanLabel, type: nodeType, confidence: Math.max(1, Math.min(5, Math.round(confidence))), created_at: now, occurred_at: normalisedOccurredAt, attributes: cleanAttributes, evidence: evidenceRecord, review_status: reviewStatus, submitted_by: submittedBy, submitted_at: submittedAt, reviewed_by: null, reviewed_at: null, review_notes: null } }] });
    if (reviewStatus === 'pending' && can(useAuthStore.getState().currentUser?.role, 'intelligence:review')) await get().loadReviewQueue();
    return id;
  },

  updateNode: async (id, label, confidence, attributes, occurredAt) => {
    const cleanLabel = label.trim().slice(0, 160);
    if (!cleanLabel) throw new Error('Entity label is required.');
    const cleanAttributes = normaliseAttributes(attributes);
    const normalisedOccurredAt = normaliseOccurredAt(occurredAt);
    const db = await getDb();
    const nodeResult = await db.query('SELECT review_status, submitted_by FROM nodes WHERE id = ?', [id]);
    const node = nodeResult.values?.[0];
    if (!node) throw new Error('The intelligence record no longer exists.');
    const isReturnedSubmission = node.review_status === 'returned' && node.submitted_by === currentOperator();
    assertCurrentPermission(isReturnedSubmission ? 'intelligence:resubmit' : 'intelligence:update');
    const now = new Date().toISOString();
    await withTransaction(db, async () => {
      if (isReturnedSubmission) {
        await db.run(
          "UPDATE nodes SET label = ?, confidence = ?, occurred_at = ?, attributes = ?, review_status = 'pending', submitted_at = ?, reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL WHERE id = ?",
          [cleanLabel, Math.max(1, Math.min(5, Math.round(confidence))), normalisedOccurredAt, JSON.stringify(cleanAttributes), now, id],
        );
        await appendAuditEntry(db, 'RESUBMIT_INTELLIGENCE_FOR_REVIEW', id, `Corrected and resubmitted intelligence: ${cleanLabel}`, currentOperator());
      } else {
        await db.run('UPDATE nodes SET label = ?, confidence = ?, occurred_at = ?, attributes = ? WHERE id = ?', [cleanLabel, Math.max(1, Math.min(5, Math.round(confidence))), normalisedOccurredAt, JSON.stringify(cleanAttributes), id]);
        await appendAuditEntry(db, 'UPDATE_NODE', id, `Updated intelligence metadata and chronology for: ${cleanLabel}`, currentOperator());
      }
    });
    set({ graphElements: get().graphElements.map((element) => element.data.id === id ? { ...element, data: { ...element.data, label: cleanLabel, confidence: Math.max(1, Math.min(5, Math.round(confidence))), occurred_at: normalisedOccurredAt, attributes: cleanAttributes, ...(isReturnedSubmission ? { review_status: 'pending' as ReviewStatus, submitted_at: now, reviewed_by: null, reviewed_at: null, review_notes: null } : {}) } } : element) });
    if (isReturnedSubmission && can(useAuthStore.getState().currentUser?.role, 'intelligence:review')) await get().loadReviewQueue();
  },

  addEdge: async (sourceId, targetId, relationshipType) => {
    assertCurrentPermission('intelligence:create');
    const { activeCaseId, graphElements } = get();
    const cleanRelationship = relationshipType.trim().slice(0, 80);
    if (!activeCaseId || sourceId === targetId || !cleanRelationship) return;
    if (graphElements.some((element) => element.data.source === sourceId && element.data.target === targetId && element.data.label === cleanRelationship)) return;
    const id = createId('edge');
    const now = new Date().toISOString();
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, activeCaseId, sourceId, targetId, cleanRelationship, now]);
      await appendAuditEntry(db, 'ADD_EDGE', id, `Connected ${sourceId} to ${targetId}`, currentOperator());
    });
    set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: cleanRelationship, created_at: now } }] });
  },

  deleteNode: async (nodeId) => {
    assertCurrentPermission('intelligence:delete');
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
      await db.run('DELETE FROM evidence_provenance WHERE node_id = ?', [nodeId]);
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
      await appendAuditEntry(db, 'DELETE_NODE_CASCADE', nodeId, 'Deleted entity and all attached relationships', currentOperator());
    });
    set({ graphElements: get().graphElements.filter((element) => element.data.id !== nodeId && element.data.source !== nodeId && element.data.target !== nodeId), selectedNodeId: null, selectedEdgeId: null });
  },

  deleteEdge: async (edgeId) => {
    assertCurrentPermission('intelligence:delete');
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('DELETE FROM edges WHERE id = ?', [edgeId]);
      await appendAuditEntry(db, 'DELETE_EDGE', edgeId, 'Deleted relationship', currentOperator());
    });
    set({ graphElements: get().graphElements.filter((element) => element.data.id !== edgeId), selectedEdgeId: null });
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setConnectingFromId: (id) => set({ connectingFromId: id }),
  toggleFilter: (nodeType) => set((state) => ({ hiddenNodeTypes: state.hiddenNodeTypes.includes(nodeType) ? state.hiddenNodeTypes.filter((type) => type !== nodeType) : [...state.hiddenNodeTypes, nodeType] })),

  loadNotes: async (caseId) => {
    await ensureCaseAccess(caseId);
    await ensureNotesTable();
    const db = await getDb();
    const response = await db.query('SELECT * FROM notes WHERE case_id = ? ORDER BY created_at DESC', [caseId]);
    const notes = (response.values || []).map((note: any) => ({ ...note, linked_nodes: parseLinkedNodes(note.linked_nodes) }));
    set({ notes });
  },

  addNote: async (content, linkedNodeIds) => {
    assertCurrentPermission('intelligence:create');
    const { activeCaseId, notes, graphElements } = get();
    const cleanContent = content.trim().slice(0, MAX_NOTE_LENGTH);
    if (!activeCaseId || !cleanContent) return;
    await ensureCaseAccess(activeCaseId);
    const validNodeIds = new Set(graphElements.filter((element) => !element.data.source).map((element) => element.data.id));
    const safeLinkedNodes = [...new Set(linkedNodeIds.filter((id) => validNodeIds.has(id)))];
    const id = createId('note');
    const now = new Date().toISOString();
    await ensureNotesTable();
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('INSERT INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)', [id, activeCaseId, cleanContent, JSON.stringify(safeLinkedNodes), now]);
      await appendAuditEntry(db, 'ADD_NOTE', id, 'Recorded intelligence note', currentOperator());
    });
    set({ notes: [{ id, case_id: activeCaseId, content: cleanContent, linked_nodes: safeLinkedNodes, created_at: now }, ...notes] });
  },

  deleteNote: async (noteId) => {
    assertCurrentPermission('intelligence:delete');
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('DELETE FROM notes WHERE id = ?', [noteId]);
      await appendAuditEntry(db, 'DELETE_NOTE', noteId, 'Deleted intelligence note', currentOperator());
    });
    set((state) => ({ notes: state.notes.filter((note) => note.id !== noteId) }));
  },

  exportActiveCase: async () => {
    assertCurrentPermission('case:export');
    const { activeCaseId, cases, graphElements, notes } = get();
    if (!activeCaseId) return;
    const activeCase = cases.find((entry) => entry.id === activeCaseId);
    if (!activeCase) return;
    const password = window.prompt('FORENSIC DOSSIER: Enter a new password of at least 12 characters:');
    if (!password) return;
    if (password.length < 12) throw new Error('Export password must contain at least 12 characters.');
    const purpose = window.prompt('DISCLOSURE PURPOSE: State the authorized purpose for this dossier:');
    if (!purpose) return;
    const recipientDescription = window.prompt('RECIPIENT: Describe the authorized recipient or destination:');
    if (!recipientDescription) return;
    const authorizationReference = window.prompt('AUTHORIZATION REFERENCE: Optional approval, warrant, or disclosure reference:') || undefined;
    const redactionChoice = window.prompt('REDACTION PROFILE: Enter comma-separated values from notes, attachment_paths, observer_identity, observed_time; leave blank for none:') || '';
    const omitted = redactionChoice.split(',').map((value) => value.trim()).filter(Boolean) as DossierRedactionProfile['omitted'];
    const rationale = omitted.length > 0 ? window.prompt('REDACTION RATIONALE: Explain why these fields are omitted:') || '' : '';
    if (activeCase.classification !== 'OFFICIAL') await requireHighRiskReauthentication('Confirm restricted forensic dossier export');

    const db = await getDb();
    const auditResponse = await db.query('SELECT * FROM audit_logs ORDER BY timestamp ASC, id ASC');
    const auditEntries = auditResponse.values || [];
    const auditVerification = await verifyAuditChain(auditEntries);
    if (!auditVerification.valid) throw new Error('The audit ledger must verify before a forensic dossier can be exported.');
    const auditHeadHash = auditEntries.length ? String(auditEntries[auditEntries.length - 1].entry_hash || '') || null : null;
    const markingsResponse = await db.query('SELECT object_type, object_id, marking, handling_instructions, created_by, created_at FROM data_markings WHERE case_id = ? ORDER BY object_type, object_id, marking', [activeCaseId]);
    const now = new Date().toISOString();
    const dossierId = createId('dossier');
    const identity = await getDeviceIdentity();
    const disclosure: DossierDisclosure = { purpose, recipientDescription, authorizationReference };
    const dossier = await buildForensicDossier({
      dossierId,
      caseId: activeCaseId,
      reference: activeCase.reference_number,
      title: activeCase.title,
      classification: activeCase.classification,
      exportedAt: now,
      exportedBy: currentOperator(),
      redactionProfile: { omitted, rationale },
      disclosure,
      audit: { chainValid: auditVerification.valid, verifiedEntries: auditVerification.verifiedEntries, auditHeadHash },
      signer: { fingerprint: identity.fingerprint, publicKey: identity.publicKey, sign: signWithDeviceIdentity },
      content: {
        case: { id: activeCase.id, reference_number: activeCase.reference_number, title: activeCase.title, case_type: activeCase.case_type, status: activeCase.status, classification: activeCase.classification, date_opened: activeCase.date_opened },
        nodes: graphElements.filter((element) => !element.data.source),
        relationships: graphElements.filter((element) => Boolean(element.data.source)),
        notes,
        markings: markingsResponse.values || [],
      },
    });
    const dossierVerification = await verifyForensicDossier(dossier);
    const signatureValid = dossierVerification.valid && await verifyDeviceSignature(identity.publicKey, dossier.manifest.integrity.manifest, dossier.manifest.signer.signature);
    if (!signatureValid) throw new Error('The forensic dossier could not be integrity-verified with this device identity.');

    await withTransaction(db, async () => {
      await db.run(
        'INSERT INTO forensic_dossiers (id, case_id, manifest_digest, signature, signer_fingerprint, audit_chain_valid, audit_head_hash, classification, redaction_profile, exported_by, exported_at, purpose, recipient_description, authorization_reference, verification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [dossierId, activeCaseId, dossier.manifest.integrity.manifest, dossier.manifest.signer.signature, identity.fingerprint, 1, auditHeadHash, activeCase.classification, JSON.stringify(dossier.manifest.redaction_profile), currentOperator(), now, dossier.manifest.disclosure.purpose, dossier.manifest.disclosure.recipientDescription, dossier.manifest.disclosure.authorizationReference || null, 'verified'],
      );
      await db.run(
        'INSERT INTO disclosure_register (id, dossier_id, case_id, purpose, recipient_description, authorization_reference, disclosed_by, disclosed_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [createId('disclosure'), dossierId, activeCaseId, dossier.manifest.disclosure.purpose, dossier.manifest.disclosure.recipientDescription, dossier.manifest.disclosure.authorizationReference || null, currentOperator(), now, 'prepared'],
      );
      await appendAuditEntry(db, 'CREATE_FORENSIC_DOSSIER', dossierId, `Created verified dossier for ${activeCase.reference_number}; recipient: ${dossier.manifest.disclosure.recipientDescription}`, currentOperator());
    });

    const encryptedPayload = await encryptPackage(JSON.stringify(dossier), password);
    const fileName = `forensic_dossier_${activeCase.reference_number.replace(/[^A-Za-z0-9_-]/g, '_')}_${dossierId.slice(-8)}.enc`;
    const fileResult = await Filesystem.writeFile({ path: fileName, data: encryptedPayload, directory: Directory.Cache, encoding: Encoding.UTF8 });
    useAuthStore.getState().setIntentionalBackground(true);
    const canShare = await Share.canShare();
    if (!canShare.value) throw new Error('The device cannot share this encrypted forensic dossier.');
    await Share.share({ title: `Forensic dossier: ${activeCase.reference_number}`, text: 'Encrypted CrimeGraph forensic dossier', url: fileResult.uri, dialogTitle: 'Share forensic dossier' });
    await withTransaction(db, async () => {
      await db.run("UPDATE disclosure_register SET status = 'shared' WHERE dossier_id = ?", [dossierId]);
      await appendAuditEntry(db, 'SHARE_FORENSIC_DOSSIER', dossierId, `Issued share intent for dossier ${dossier.manifest.integrity.manifest}`, currentOperator());
    });
  },

  importCase: async (encryptedData) => {
    assertCurrentPermission('case:import');
    if (!encryptedData || encryptedData.length > MAX_IMPORT_BASE64_LENGTH) throw new Error('Import package is empty or exceeds the supported size.');
    const password = window.prompt('SECURE IMPORT: Enter the package password:');
    if (!password) return;
    const decoded = JSON.parse(await decryptPackage(encryptedData, password));
    const dossierVerification = await verifyForensicDossier(decoded);
    const manifestDigest = dossierVerification.manifestDigest;
    const isForensicDossier = manifestDigest !== null;
    if (isForensicDossier) {
      const manifest = decoded?.manifest;
      const publicKey = manifest?.signer?.public_key;
      const signature = manifest?.signer?.signature;
      if (!dossierVerification.valid || typeof publicKey !== 'string' || typeof signature !== 'string' || !await verifyDeviceSignature(publicKey, manifestDigest, signature)) {
        throw new Error(`Forensic dossier verification failed: ${dossierVerification.errors.join(' ') || 'device signature is invalid.'}`);
      }
    }
    const packageCandidate = isForensicDossier ? {
      metadata: {
        reference: decoded.manifest.reference,
        title: decoded.manifest.title,
        classification: decoded.manifest.classification,
      },
      intelligence_nodes: decoded.content.nodes,
      relationships: decoded.content.relationships,
      notes: decoded.content.notes,
    } : decoded;
    const parsed = validateImportedPackage(packageCandidate);
    const db = await getDb();
    const newCaseId = createId('case');
    const now = new Date().toISOString();
    const importedReference = `${parsed.reference}-IMP-${now.slice(0, 10).replace(/-/g, '')}`.slice(0, 80);

    await withTransaction(db, async () => {
      await db.run(
        'INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newCaseId, importedReference, `${parsed.title} (Imported)`.slice(0, 160), 'other', 'active', parsed.classification, now, now, now],
      );
      const idMap = new Map<string, string>();
      for (const node of parsed.nodes) {
        const data = readElementData(node);
        if (!data || typeof data.id !== 'string' || typeof data.label !== 'string' || !ENTITY_TYPES.has(String(data.type))) continue;
        const newNodeId = createId('node');
        idMap.set(data.id, newNodeId);
        const confidence = Number.isFinite(Number(data.confidence)) ? Math.max(1, Math.min(5, Math.round(Number(data.confidence)))) : 3;
        await db.run(
          'INSERT INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status, submitted_by, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newNodeId, newCaseId, data.label.trim().slice(0, 160), String(data.type), confidence, typeof data.created_at === 'string' ? data.created_at.slice(0, 40) : now, typeof data.occurred_at === 'string' ? normaliseOccurredAt(data.occurred_at) : null, JSON.stringify(normaliseAttributes(data.attributes as Record<string, string> || {})), 'pending', 'IMPORTED_PACKAGE', now],
        );
        if (data.type === 'evidence' && data.evidence && typeof data.evidence === 'object') {
          const importedEvidence = normaliseEvidenceProvenance(data.evidence as EvidenceProvenanceInput);
          validateEvidenceProvenance(importedEvidence);
          const provenanceId = createId('evidence');
          const createdAt = typeof (data.evidence as Record<string, unknown>).createdAt === 'string' ? String((data.evidence as Record<string, unknown>).createdAt).slice(0, 40) : now;
          const updatedAt = typeof (data.evidence as Record<string, unknown>).updatedAt === 'string' ? String((data.evidence as Record<string, unknown>).updatedAt).slice(0, 40) : now;
          await db.run(
            `INSERT INTO evidence_provenance (id, case_id, node_id, exhibit_number, source_type, source_reference, acquired_at, acquired_by, handling_status, verification_status, chain_of_custody, fingerprint, attachment_name, attachment_uri, attachment_mime_type, attachment_digest, created_at, updated_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              provenanceId, newCaseId, newNodeId, importedEvidence.exhibitNumber, importedEvidence.sourceType,
              importedEvidence.sourceReference, importedEvidence.acquiredAt, importedEvidence.acquiredBy,
              importedEvidence.handlingStatus, importedEvidence.verificationStatus, importedEvidence.chainOfCustody,
              await createEvidenceFingerprint(importedEvidence), importedEvidence.attachmentName, importedEvidence.attachmentUri,
              importedEvidence.attachmentMimeType, importedEvidence.attachmentDigest, createdAt, updatedAt,
              typeof (data.evidence as Record<string, unknown>).createdBy === 'string' ? String((data.evidence as Record<string, unknown>).createdBy).slice(0, 120) : 'IMPORTED_PACKAGE',
            ],
          );
        }
      }
      for (const relationship of parsed.relationships) {
        const data = readElementData(relationship);
        if (!data || typeof data.source !== 'string' || typeof data.target !== 'string' || typeof data.label !== 'string') continue;
        const source = idMap.get(data.source);
        const target = idMap.get(data.target);
        if (!source || !target || source === target) continue;
        await db.run(
          'INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [createId('edge'), newCaseId, source, target, data.label.trim().slice(0, 80), typeof data.created_at === 'string' ? data.created_at.slice(0, 40) : now],
        );
      }
      await ensureNotesTable();
      for (const note of parsed.notes) {
        if (!note || typeof note !== 'object') continue;
        const candidate = note as Record<string, unknown>;
        const content = typeof candidate.content === 'string' ? candidate.content.trim().slice(0, MAX_NOTE_LENGTH) : '';
        if (!content) continue;
        const linkedNodeIds = Array.isArray(candidate.linked_nodes) ? candidate.linked_nodes.filter((id): id is string => typeof id === 'string').map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)) : [];
        await db.run(
          'INSERT INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)',
          [createId('note'), newCaseId, content, JSON.stringify(linkedNodeIds), typeof candidate.created_at === 'string' ? candidate.created_at.slice(0, 40) : now],
        );
      }
      await appendAuditEntry(db, isForensicDossier ? 'IMPORT_VERIFIED_DOSSIER' : 'IMPORT_CASE', newCaseId, isForensicDossier ? `Imported verified forensic dossier ${parsed.reference} signed by ${dossierVerification.signerFingerprint}` : `Imported encrypted package ${parsed.reference}`, currentOperator());
    });
    await get().loadCases();
  },

  loadAuditLogs: async () => {
    assertCurrentPermission('audit:view');
    const db = await getDb();
    const response = await db.query('SELECT * FROM audit_logs ORDER BY timestamp ASC, id ASC');
    const orderedLogs = response.values || [];
    const auditVerification = await verifyAuditChain(orderedLogs);
    set({ auditLogs: [...orderedLogs].reverse(), auditVerification });
  },

  loadReviewQueue: async () => {
    assertCurrentPermission('intelligence:review');
    const db = await getDb();
    const response = await db.query(
      `SELECT n.id AS node_id, n.case_id, n.label, n.type, n.submitted_by, n.submitted_at, n.review_notes,
              c.reference_number, c.title AS case_title
         FROM nodes n
         INNER JOIN cases c ON c.id = n.case_id
        WHERE n.review_status = 'pending'
        ORDER BY COALESCE(n.submitted_at, n.created_at) ASC, n.created_at ASC`,
    );
    const reviewQueue: ReviewQueueItem[] = (response.values || []).map((record: any) => ({
      nodeId: String(record.node_id),
      caseId: String(record.case_id),
      caseReference: String(record.reference_number),
      caseTitle: String(record.case_title),
      label: String(record.label),
      nodeType: String(record.type),
      submittedBy: String(record.submitted_by || 'UNKNOWN_OPERATOR'),
      submittedAt: String(record.submitted_at || ''),
      reviewNotes: String(record.review_notes || ''),
    }));
    set({ reviewQueue });
  },

  reviewNode: async (nodeId, decision, notes) => {
    assertCurrentPermission('intelligence:review');
    if (decision !== 'approved' && decision !== 'returned') throw new Error('Unsupported review decision.');
    const cleanNotes = notes.trim().slice(0, MAX_REVIEW_NOTE_LENGTH);
    if (decision === 'returned' && !cleanNotes) throw new Error('A correction comment is required when returning intelligence.');
    const db = await getDb();
    const record = (await db.query('SELECT id, label, case_id, review_status FROM nodes WHERE id = ?', [nodeId])).values?.[0];
    if (!record) throw new Error('The intelligence record no longer exists.');
    if (record.review_status !== 'pending') throw new Error('Only pending intelligence can be reviewed. Refresh the queue and try again.');
    const now = new Date().toISOString();
    await withTransaction(db, async () => {
      await db.run(
        'UPDATE nodes SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ? WHERE id = ? AND review_status = ?',
        [decision, currentOperator(), now, cleanNotes, nodeId, 'pending'],
      );
      const action = decision === 'approved' ? 'APPROVE_INTELLIGENCE' : 'RETURN_INTELLIGENCE_FOR_CORRECTION';
      const detail = decision === 'approved'
        ? `Approved intelligence: ${String(record.label)}${cleanNotes ? `. Review note: ${cleanNotes}` : ''}`
        : `Returned intelligence for correction: ${String(record.label)}. Comment: ${cleanNotes}`;
      await appendAuditEntry(db, action, nodeId, detail, currentOperator());
    });
    set((state) => ({
      graphElements: state.graphElements.map((element) => element.data.id === nodeId
        ? { ...element, data: { ...element.data, review_status: decision, reviewed_by: currentOperator(), reviewed_at: now, review_notes: cleanNotes } }
        : element),
    }));
    await get().loadReviewQueue();
  },

  wipeDatabase: async () => {
    assertCurrentPermission('system:wipe');
    await requireHighRiskReauthentication('Permanently wipe all protected CrimeGraph data');
    const db = await getDb();
    const attachments = (await db.query('SELECT attachment_uri FROM evidence_provenance WHERE attachment_uri IS NOT NULL AND attachment_uri != ?', [''])).values || [];
    for (const attachment of attachments) {
      try { await Filesystem.deleteFile({ path: String(attachment.attachment_uri) }); } catch { /* Destroying the storage key below makes a surviving protected file unreadable. */ }
    }
    await destroyProtectedLocalStorage();
    const resetDb = await getDb();
    await appendAuditEntry(resetDb, 'SYSTEM_WIPE', 'DEVICE', 'Protected storage was reset and the device-held encryption secret was destroyed.', 'SYSTEM_WIPE');
    set({ cases: [], graphElements: [], activeCaseId: null, auditLogs: [], auditVerification: null, reviewQueue: [], notes: [], selectedNodeId: null, selectedEdgeId: null, connectingFromId: null });
  },
}));
