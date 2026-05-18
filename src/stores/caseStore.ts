import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';
import { encryptPackage, decryptPackage } from '../capacitor/crypto';

export interface Case { id: string; reference_number: string; title: string; case_type: string; status: string; classification: string; date_opened: string; }
export interface GraphElement { data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; created_at?: string; attributes?: Record<string, string>; }; }
export interface AuditLog { id: string; timestamp: string; user_id: string; action: string; target_id: string; details: string; }
export interface IntelNote { id: string; case_id: string; content: string; linked_nodes: string[]; created_at: string; }

interface CaseState {
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[]; auditLogs: AuditLog[]; notes: IntelNote[];
  selectedNodeId: string | null; selectedEdgeId: string | null; connectingFromId: string | null; hiddenNodeTypes: string[];

  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number, attributes?: Record<string, string>) => Promise<void>;
  updateNode: (id: string, label: string, confidence: number, attributes: Record<string, string>) => Promise<void>; // 🚀 NEW
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>; deleteEdge: (edgeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void; setSelectedEdgeId: (id: string | null) => void; setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>; importCase: (encryptedData: string) => Promise<void>;
  loadAuditLogs: () => Promise<void>; wipeDatabase: () => Promise<void>; toggleFilter: (nodeType: string) => void;
  loadNotes: (caseId: string) => Promise<void>; addNote: (content: string, linkedNodeIds: string[]) => Promise<void>; deleteNote: (noteId: string) => Promise<void>;
}

const logAudit = async (action: string, targetId: string, details: string) => {
  try {
    const db = await getDb();
    const userId = useAuthStore.getState().currentUser?.badge || 'SYSTEM_UNKNOWN';
    await db.run('INSERT INTO audit_logs (id, timestamp, user_id, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?)', [`audit_${Date.now()}`, new Date().toISOString(), userId, action, targetId, details]);
  } catch (e) {}
};

const ensureNotesTable = async () => {
  const db = await getDb();
  await db.run('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, case_id TEXT, content TEXT, linked_nodes TEXT, created_at TEXT)');
};

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [], activeCaseId: null, graphElements: [], auditLogs: [], notes: [], selectedNodeId: null, selectedEdgeId: null, connectingFromId: null, hiddenNodeTypes: [],
  
  loadCases: async () => {
    try {
      const db = await getDb();
      const res = await db.query('SELECT * FROM cases ORDER BY date_opened DESC');
      set({ cases: res.values || [] });
    } catch (e) {}
  },

  setActiveCase: (id) => { 
    set({ activeCaseId: id, hiddenNodeTypes: [] }); 
    get().loadGraphElements(id); 
    get().loadNotes(id);
  },

  addCase: async (title, refNumber, caseType, classification) => {
    const id = `case_${Date.now()}`; const now = new Date().toISOString();
    const db = await getDb();
    await db.run('INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, refNumber, title, caseType, 'active', classification, now, now, now]);
    await logAudit('CREATE_CASE', id, `Created ${refNumber}`);
    get().loadCases();
  },

  archiveCase: async (caseId) => {
    const db = await getDb();
    await db.run("UPDATE cases SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
    await logAudit('ARCHIVE_CASE', caseId, 'Archived');
    get().loadCases();
  },

  restoreCase: async (caseId) => {
    const db = await getDb();
    await db.run("UPDATE cases SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
    await logAudit('RESTORE_CASE', caseId, 'Restored');
    get().loadCases();
  },

  loadGraphElements: async (caseId) => {
    try {
      const db = await getDb();
      const nodesRes = await db.query('SELECT * FROM nodes WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
      const edgesRes = await db.query('SELECT * FROM edges WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
      const elements: GraphElement[] = [];
      if (nodesRes.values) {
        nodesRes.values.forEach((n: any) => {
          let parsedAttr = {};
          try { if (n.attributes) parsedAttr = JSON.parse(n.attributes); } catch(err){}
          elements.push({ data: { id: n.id, label: n.label, type: n.type, confidence: n.confidence, created_at: n.created_at, attributes: parsedAttr } });
        });
      }
      if (edgesRes.values) edgesRes.values.forEach((e: any) => elements.push({ data: { id: e.id, source: e.source, target: e.target, label: e.label, created_at: e.created_at } }));
      set({ graphElements: elements });
    } catch (e) {}
  },

  addNode: async (nodeType, label, confidence, attributes = {}) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId) return;
    const id = `node_${Date.now()}`; const now = new Date().toISOString();
    const db = await getDb();
    const attrString = JSON.stringify(attributes);
    await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at, attributes) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, activeCaseId, label, nodeType, confidence, now, attrString]);
    await logAudit('ADD_NODE', id, `Added ${nodeType}: ${label}`);
    set({ graphElements: [...graphElements, { data: { id, label, type: nodeType, confidence, created_at: now, attributes } }] });
  },

  // 🚀 NEW: Update Node Metadata
  updateNode: async (id, label, confidence, attributes) => {
    const { graphElements } = get();
    const attrString = JSON.stringify(attributes);
    try {
      const db = await getDb();
      await db.run('UPDATE nodes SET label = ?, confidence = ?, attributes = ? WHERE id = ?', [label, confidence, attrString, id]);
      await logAudit('UPDATE_NODE', id, `Modified metadata for: ${label}`);
      set({
        graphElements: graphElements.map(e => 
          e.data.id === id ? { ...e, data: { ...e.data, label, confidence, attributes } } : e
        )
      });
    } catch (e) {}
  },

  addEdge: async (sourceId, targetId, relationshipType) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId || sourceId === targetId) return;
    if (graphElements.some(e => e.data.source === sourceId && e.data.target === targetId)) return;
    const id = `edge_${Date.now()}`; const now = new Date().toISOString();
    const db = await getDb();
    await db.run('INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, activeCaseId, sourceId, targetId, relationshipType, now]);
    await logAudit('ADD_EDGE', id, `Connected ${sourceId} to ${targetId}`);
    set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: relationshipType, created_at: now } }] });
  },

  deleteNode: async (nodeId) => {
    const { graphElements } = get();
    const db = await getDb();
    await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
    await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
    await logAudit('DELETE_NODE', nodeId, 'Destroyed node and connections');
    const remainingElements = graphElements.filter(e => e.data.id !== nodeId && e.data.source !== nodeId && e.data.target !== nodeId);
    set({ graphElements: remainingElements, selectedNodeId: null, selectedEdgeId: null });
  },

  deleteEdge: async (edgeId) => {
    const { graphElements } = get();
    const db = await getDb();
    await db.run('DELETE FROM edges WHERE id = ?', [edgeId]);
    await logAudit('DELETE_EDGE', edgeId, 'Severed relationship');
    set({ graphElements: graphElements.filter(e => e.data.id !== edgeId), selectedEdgeId: null });
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setConnectingFromId: (id) => set({ connectingFromId: id }),
  toggleFilter: (nodeType) => set(s => ({ hiddenNodeTypes: s.hiddenNodeTypes.includes(nodeType) ? s.hiddenNodeTypes.filter(t => t !== nodeType) : [...s.hiddenNodeTypes, nodeType] })),

  loadNotes: async (caseId) => {
    await ensureNotesTable();
    const db = await getDb();
    const res = await db.query('SELECT * FROM notes WHERE case_id = ? ORDER BY created_at DESC', [caseId]);
    const loadedNotes = (res.values || []).map((n: any) => ({ ...n, linked_nodes: JSON.parse(n.linked_nodes || '[]') }));
    set({ notes: loadedNotes });
  },
  addNote: async (content, linkedNodeIds) => {
    const { activeCaseId, notes } = get();
    if (!activeCaseId) return;
    const id = `note_${Date.now()}`; const now = new Date().toISOString();
    await ensureNotesTable();
    const db = await getDb();
    await db.run('INSERT INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)', [id, activeCaseId, content, JSON.stringify(linkedNodeIds), now]);
    await logAudit('ADD_NOTE', id, 'Intelligence log recorded');
    set({ notes: [{ id, case_id: activeCaseId, content, linked_nodes: linkedNodeIds, created_at: now }, ...notes] });
  },
  deleteNote: async (noteId) => {
    const db = await getDb();
    await db.run('DELETE FROM notes WHERE id = ?', [noteId]);
    await logAudit('DELETE_NOTE', noteId, 'Destroyed log');
    set(s => ({ notes: s.notes.filter(n => n.id !== noteId) }));
  },

  exportActiveCase: async () => {
    const { activeCaseId, cases, graphElements, notes } = get();
    if (!activeCaseId) return;
    const activeCase = cases.find(c => c.id === activeCaseId);
    if (!activeCase) return;
    const password = window.prompt("SECURE EXPORT: Enter a strong password:");
    if (!password) return;
    await logAudit('EXPORT_PACKAGE', activeCaseId, 'Exported Encrypted intelligence package');
    const exportData = {
      metadata: { reference: activeCase.reference_number, title: activeCase.title, classification: activeCase.classification, exported_at: new Date().toISOString(), system: "CrimeGraph v1.1" },
      intelligence_nodes: graphElements.filter(e => !e.data.source), relationships: graphElements.filter(e => e.data.source), notes: notes
    };
    try {
      const encryptedPayload = await encryptPackage(JSON.stringify(exportData, null, 2), password);
      const fileName = `intel_pkg_${activeCase.reference_number}.enc`;
      const fileResult = await Filesystem.writeFile({ path: fileName, data: encryptedPayload, directory: Directory.Cache, encoding: Encoding.UTF8 });
      useAuthStore.getState().setIntentionalBackground(true);
      const canShare = await Share.canShare();
      if (canShare.value) await Share.share({ title: `Encrypted Package: ${activeCase.reference_number}`, text: `AES-GCM Data`, url: fileResult.uri, dialogTitle: 'Export' });
    } catch (e) { alert('Export failed.'); }
  },

  importCase: async (encryptedData: string) => {
    const password = window.prompt("SECURE IMPORT: Enter decryption password:");
    if (!password) return;
    try {
      const jsonStr = await decryptPackage(encryptedData, password);
      const data = JSON.parse(jsonStr);
      const db = await getDb();
      const newCaseId = `case_${Date.now()}`; const now = new Date().toISOString();
      await db.run('INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newCaseId, `${data.metadata.reference}-IMP`, `${data.metadata.title} (Imported)`, 'other', 'active', data.metadata.classification || 'OFFICIAL', now, now, now]);

      const idMap = new Map<string, string>();
      for (const node of data.intelligence_nodes) {
        const newNodeId = `node_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        idMap.set(node.data.id, newNodeId);
        await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at, attributes) VALUES (?, ?, ?, ?, ?, ?, ?)', [newNodeId, newCaseId, node.data.label, node.data.type, node.data.confidence, node.data.created_at || now, node.data.attributes ? JSON.stringify(node.data.attributes) : '{}']);
      }
      for (const edge of data.relationships) {
        const newEdgeId = `edge_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        const newSource = idMap.get(edge.data.source); const newTarget = idMap.get(edge.data.target);
        if (newSource && newTarget) await db.run('INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [newEdgeId, newCaseId, newSource, newTarget, edge.data.label, edge.data.created_at || now]);
      }
      await ensureNotesTable();
      if (data.notes) {
        for (const note of data.notes) {
          const newNoteId = `note_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
          const newLinkedNodes = note.linked_nodes.map((oldId: string) => idMap.get(oldId)).filter(Boolean);
          await db.run('INSERT INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)', [newNoteId, newCaseId, note.content, JSON.stringify(newLinkedNodes), note.created_at || now]);
        }
      }
      get().loadCases();
      await logAudit('IMPORT_CASE', newCaseId, `Imported package`);
    } catch (e) { alert('Decryption failed.'); throw e; }
  },

  loadAuditLogs: async () => {
    const db = await getDb();
    const res = await db.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200');
    set({ auditLogs: res.values || [] });
  },

  wipeDatabase: async () => {
    const db = await getDb();
    await db.run('DELETE FROM edges'); await db.run('DELETE FROM nodes'); await db.run('DELETE FROM cases'); await db.run('DELETE FROM audit_logs');
    try { await db.run('DELETE FROM notes'); } catch(e){}
    set({ cases: [], graphElements: [], activeCaseId: null, auditLogs: [], notes: [] });
    await logAudit('SYSTEM_WIPE', 'ALL_DATA', 'Wiped via Kill Switch');
    get().loadAuditLogs(); get().loadCases();
  }
}));
