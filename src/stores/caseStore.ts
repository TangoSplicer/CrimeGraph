import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';
import { decryptPackage, encryptPackage } from '../capacitor/crypto';
import { appendAuditEntry, verifyAuditChain, type AuditVerificationResult } from '../utils/auditLedger';
import { assertPermission } from '../utils/permissions';
import {
  createEvidenceFingerprint,
  normaliseEvidenceProvenance,
  validateEvidenceProvenance,
  type EvidenceProvenance,
  type EvidenceProvenanceInput,
} from '../utils/evidenceProvenance';

export interface Case { id: string; reference_number: string; title: string; case_type: string; status: string; classification: string; date_opened: string; }
export interface GraphElement { data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; created_at?: string; occurred_at?: string | null; attributes?: Record<string, string>; evidence?: EvidenceProvenance; }; }
export interface AuditLog { id: string; timestamp: string; user_id: string; action: string; target_id: string; details: string; previous_hash?: string | null; entry_hash?: string | null; }
export interface IntelNote { id: string; case_id: string; content: string; linked_nodes: string[]; created_at: string; }

interface CaseState {
  cases: Case[];
  activeCaseId: string | null;
  graphElements: GraphElement[];
  auditLogs: AuditLog[];
  auditVerification: AuditVerificationResult | null;
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
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number, attributes?: Record<string, string>, evidence?: EvidenceProvenanceInput, occurredAt?: string) => Promise<void>;
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
const MAX_IMPORT_BASE64_LENGTH = 12 * 1024 * 1024;
const MAX_IMPORT_NODES = 2000;
const MAX_IMPORT_EDGES = 6000;
const MAX_IMPORT_NOTES = 2000;

const createId = (prefix: string): string => window.crypto?.randomUUID ? `${prefix}_${window.crypto.randomUUID()}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const currentOperator = (): string => useAuthStore.getState().currentUser?.badge || 'SYSTEM_UNKNOWN';
const assertCurrentPermission = (permission: Parameters<typeof assertPermission>[1]): void =>
  assertPermission(useAuthStore.getState().currentUser?.role, permission);

const logAudit = async (action: string, targetId: string, details: string) => {
  const db = await getDb();
  return appendAuditEntry(db, action, targetId, details, currentOperator());
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

const validateImportedPackage = (candidate: unknown) => {
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

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [],
  activeCaseId: null,
  graphElements: [],
  auditLogs: [],
  auditVerification: null,
  notes: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  connectingFromId: null,
  hiddenNodeTypes: [],

  loadCases: async () => {
    const db = await getDb();
    const response = await db.query('SELECT * FROM cases ORDER BY date_opened DESC');
    set({ cases: response.values || [] });
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

  loadGraphElements: async (caseId) => {
    const db = await getDb();
    const nodesResponse = await db.query('SELECT * FROM nodes WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
    const edgesResponse = await db.query('SELECT * FROM edges WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
    const evidenceResponse = await db.query('SELECT * FROM evidence_provenance WHERE case_id = ?', [caseId]);
    const evidenceByNodeId = new Map<string, EvidenceProvenance>((evidenceResponse.values || []).map((record: any) => [record.node_id, {
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
      elements.push({ data: { id: node.id, label: node.label, type: node.type, confidence: node.confidence, created_at: node.created_at, occurred_at: node.occurred_at, attributes, evidence: evidenceByNodeId.get(node.id) } });
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
    if (!ENTITY_TYPES.has(nodeType)) throw new Error('Unsupported entity type.');
    if (!cleanLabel) throw new Error('Entity label is required.');
    const id = createId('node');
    const now = new Date().toISOString();
    const cleanAttributes = normaliseAttributes(attributes);
    const normalisedEvidence = nodeType === 'evidence' ? normaliseEvidenceProvenance(evidence) : null;
    if (normalisedEvidence) validateEvidenceProvenance(normalisedEvidence);
    const normalisedOccurredAt = normaliseOccurredAt(occurredAt || normalisedEvidence?.acquiredAt);
    const db = await getDb();
    let evidenceRecord: EvidenceProvenance | undefined;
    await withTransaction(db, async () => {
      await db.run(
        'INSERT INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, activeCaseId, cleanLabel, nodeType, Math.max(1, Math.min(5, Math.round(confidence))), now, normalisedOccurredAt, JSON.stringify(cleanAttributes)],
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
      await appendAuditEntry(db, normalisedEvidence ? 'REGISTER_EVIDENCE' : 'ADD_NODE', id, normalisedEvidence ? `Registered evidence ${normalisedEvidence.exhibitNumber}: ${cleanLabel}` : `Added ${nodeType}: ${cleanLabel}`, currentOperator());
    });
    set({ graphElements: [...graphElements, { data: { id, label: cleanLabel, type: nodeType, confidence: Math.max(1, Math.min(5, Math.round(confidence))), created_at: now, occurred_at: normalisedOccurredAt, attributes: cleanAttributes, evidence: evidenceRecord } }] });
  },

  updateNode: async (id, label, confidence, attributes, occurredAt) => {
    assertCurrentPermission('intelligence:update');
    const cleanLabel = label.trim().slice(0, 160);
    if (!cleanLabel) throw new Error('Entity label is required.');
    const cleanAttributes = normaliseAttributes(attributes);
    const normalisedOccurredAt = normaliseOccurredAt(occurredAt);
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run('UPDATE nodes SET label = ?, confidence = ?, occurred_at = ?, attributes = ? WHERE id = ?', [cleanLabel, Math.max(1, Math.min(5, Math.round(confidence))), normalisedOccurredAt, JSON.stringify(cleanAttributes), id]);
      await appendAuditEntry(db, 'UPDATE_NODE', id, `Updated intelligence metadata and chronology for: ${cleanLabel}`, currentOperator());
    });
    set({ graphElements: get().graphElements.map((element) => element.data.id === id ? { ...element, data: { ...element.data, label: cleanLabel, confidence: Math.max(1, Math.min(5, Math.round(confidence))), occurred_at: normalisedOccurredAt, attributes: cleanAttributes } } : element) });
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
    const password = window.prompt('SECURE EXPORT: Enter a new password of at least 12 characters:');
    if (!password) return;
    if (password.length < 12) throw new Error('Export password must contain at least 12 characters.');

    const exportData = {
      metadata: {
        package_version: 3,
        reference: activeCase.reference_number,
        title: activeCase.title,
        classification: activeCase.classification,
        exported_at: new Date().toISOString(),
        system: 'CrimeGraph',
      },
      intelligence_nodes: graphElements.filter((element) => !element.data.source),
      relationships: graphElements.filter((element) => Boolean(element.data.source)),
      notes,
    };
    const encryptedPayload = await encryptPackage(JSON.stringify(exportData), password);
    const fileName = `intel_pkg_${activeCase.reference_number.replace(/[^A-Za-z0-9_-]/g, '_')}.enc`;
    const fileResult = await Filesystem.writeFile({ path: fileName, data: encryptedPayload, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await logAudit('EXPORT_PACKAGE', activeCaseId, `Exported encrypted package for ${activeCase.reference_number}`);
    useAuthStore.getState().setIntentionalBackground(true);
    const canShare = await Share.canShare();
    if (!canShare.value) throw new Error('The device cannot share this encrypted package.');
    await Share.share({ title: `Encrypted package: ${activeCase.reference_number}`, text: 'Encrypted CrimeGraph intelligence package', url: fileResult.uri, dialogTitle: 'Export package' });
  },

  importCase: async (encryptedData) => {
    assertCurrentPermission('case:import');
    if (!encryptedData || encryptedData.length > MAX_IMPORT_BASE64_LENGTH) throw new Error('Import package is empty or exceeds the supported size.');
    const password = window.prompt('SECURE IMPORT: Enter the package password:');
    if (!password) return;
    const parsed = validateImportedPackage(JSON.parse(await decryptPackage(encryptedData, password)));
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
          'INSERT INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [newNodeId, newCaseId, data.label.trim().slice(0, 160), String(data.type), confidence, typeof data.created_at === 'string' ? data.created_at.slice(0, 40) : now, typeof data.occurred_at === 'string' ? normaliseOccurredAt(data.occurred_at) : null, JSON.stringify(normaliseAttributes(data.attributes as Record<string, string> || {}))],
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
      await appendAuditEntry(db, 'IMPORT_CASE', newCaseId, `Imported encrypted package ${parsed.reference}`, currentOperator());
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

  wipeDatabase: async () => {
    assertCurrentPermission('system:wipe');
    const db = await getDb();
    await withTransaction(db, async () => {
      await ensureNotesTable();
      await db.run('DELETE FROM edges');
      await db.run('DELETE FROM nodes');
      await db.run('DELETE FROM notes');
      await db.run('DELETE FROM evidence_provenance');
      await db.run('DELETE FROM cases');
      await db.run('DELETE FROM audit_logs');
      await db.run('DELETE FROM users');
    });
    await appendAuditEntry(db, 'SYSTEM_WIPE', 'DEVICE', 'Database sanitised; prior intelligence and operator records removed.', 'SYSTEM_WIPE');
    set({ cases: [], graphElements: [], activeCaseId: null, auditLogs: [], auditVerification: null, notes: [], selectedNodeId: null, selectedEdgeId: null, connectingFromId: null });
  },
}));
