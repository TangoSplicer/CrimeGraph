import { create } from 'zustand';
import { getDb } from '../capacitor/db';

export interface Case {
  id: string; reference_number: string; title: string;
  case_type: string; status: string; classification: string; date_opened: string; node_count?: number;
}

export interface GraphElement {
  data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; };
}

interface CaseState {
  cases: Case[];
  activeCaseId: string | null;
  graphElements: GraphElement[];
  selectedNodeId: string | null;
  connectingFromId: string | null;
  
  loadCases: () => Promise<void>;
  setActiveCase: (id: string) => void;
  addCase: (title: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>;
  restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void;
  setConnectingFromId: (id: string | null) => void;
}

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [],
  activeCaseId: null,
  graphElements: [],
  selectedNodeId: null,
  connectingFromId: null,
  
  loadCases: async () => {
    try {
      const db = await getDb();
      const res = await db.query('SELECT * FROM cases ORDER BY date_opened DESC');
      set({ cases: res.values || [] });
    } catch (e) { console.error('Failed to load cases', e); }
  },

  setActiveCase: (id) => {
    set({ activeCaseId: id });
    get().loadGraphElements(id);
  },

  addCase: async (title, caseType, classification) => {
    const id = `case_${Date.now()}`;
    const refNumber = `CG-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    try {
      const db = await getDb();
      await db.run(
        'INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, refNumber, title, caseType, 'active', classification, now, now, now]
      );
      get().loadCases();
    } catch (e) { console.error('Failed to create case', e); }
  },

  archiveCase: async (caseId) => {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      await db.run("UPDATE cases SET status = 'archived', updated_at = ? WHERE id = ?", [now, caseId]);
      get().loadCases();
    } catch (e) { console.error('Failed to archive case', e); }
  },

  restoreCase: async (caseId) => {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      await db.run("UPDATE cases SET status = 'active', updated_at = ? WHERE id = ?", [now, caseId]);
      get().loadCases();
    } catch (e) { console.error('Failed to restore case', e); }
  },

  loadGraphElements: async (caseId) => {
    try {
      const db = await getDb();
      const nodesRes = await db.query('SELECT * FROM nodes WHERE case_id = ?', [caseId]);
      const edgesRes = await db.query('SELECT * FROM edges WHERE case_id = ?', [caseId]);
      
      const elements: GraphElement[] = [];
      if (nodesRes.values) {
        nodesRes.values.forEach((n: any) => elements.push({
          data: { id: n.id, label: n.label, type: n.type, confidence: n.confidence }
        }));
      }
      if (edgesRes.values) {
        edgesRes.values.forEach((e: any) => elements.push({
          data: { id: e.id, source: e.source, target: e.target, label: e.label }
        }));
      }
      set({ graphElements: elements });
    } catch (e) { console.error('Failed to load graph', e); }
  },

  addNode: async (nodeType, label, confidence) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId) return;
    const id = `node_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, activeCaseId, label, nodeType, confidence, now]);
      set({ graphElements: [...graphElements, { data: { id, label, type: nodeType, confidence } }] });
    } catch (e) { console.error(e); }
  },

  addEdge: async (sourceId, targetId, relationshipType) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId || sourceId === targetId) return;
    if (graphElements.some(e => e.data.source === sourceId && e.data.target === targetId)) return;
    const id = `edge_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run('INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, activeCaseId, sourceId, targetId, relationshipType, now]);
      set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: relationshipType } }] });
    } catch (e) { console.error(e); }
  },

  deleteNode: async (nodeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
      const remainingElements = graphElements.filter(e => e.data.id !== nodeId && e.data.source !== nodeId && e.data.target !== nodeId);
      set({ graphElements: remainingElements, selectedNodeId: null });
    } catch (e) { console.error(e); }
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setConnectingFromId: (id) => set({ connectingFromId: id })
}));
