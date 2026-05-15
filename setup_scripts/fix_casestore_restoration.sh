#!/bin/bash

echo "Restoring complete caseStore.ts..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';
import { encryptPackage, decryptPackage } from '../capacitor/crypto';

export interface Case { id: string; reference_number: string; title: string; case_type: string; status: string; classification: string; date_opened: string; node_count?: number; }
export interface GraphElement { data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; created_at?: string; attributes?: Record<string, string>; }; }
export interface AuditLog { id: string; timestamp: string; user_id: string; action: string; target_id: string; details: string; }

interface CaseState {
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[]; selectedNodeId: string | null; selectedEdgeId: string | null; connectingFromId: string | null; auditLogs: AuditLog[];
  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number, attributes?: Record<string, string>) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>; deleteEdge: (edgeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void; setSelectedEdgeId: (id: string | null) => void; setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>; importCase: (encryptedData: string) => Promise<void>;
  loadAuditLogs: () => Promise<void>; wipeDatabase: () => Promise<void>;
}

const logAudit = async (action: string, targetId: string, details: string) => {
  try {
    const db = await getDb();
    const userId = useAuthStore.getState().currentUser?.id || 'SYSTEM_UNKNOWN';
    await db.run('INSERT INTO audit_logs (id, timestamp, user_id, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?)', [`audit_${Date.now()}`, new Date().toISOString(), userId, action, targetId, details]);
  } catch (e) {}
};

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [], activeCaseId: null, graphElements: [], selectedNodeId: null, selectedEdgeId: null, connectingFromId: null, auditLogs: [],
  
  loadCases: async () => {
    try {
      const db = await getDb();
      const res = await db.query('SELECT * FROM cases ORDER BY date_opened DESC');
      set({ cases: res.values || [] });
    } catch (e) {}
  },

  setActiveCase: (id) => { set({ activeCaseId: id }); get().loadGraphElements(id); },

  addCase: async (title, refNumber, caseType, classification) => {
    const id = `case_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run('INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, refNumber, title, caseType, 'active', classification, now, now, now]);
      await logAudit('CREATE_CASE', id, `Created ${refNumber}`);
      get().loadCases();
    } catch (e) { throw e; }
  },

  archiveCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await logAudit('ARCHIVE_CASE', caseId, 'Archived');
      get().loadCases();
    } catch (e) {}
  },

  restoreCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await logAudit('RESTORE_CASE', caseId, 'Restored');
      get().loadCases();
    } catch (e) {}
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
    const id = `node_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      const attrString = JSON.stringify(attributes);
      await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at, attributes) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, activeCaseId, label, nodeType, confidence, now, attrString]);
      await logAudit('ADD_NODE', id, `Added ${nodeType}: ${label}`);
      set({ graphElements: [...graphElements, { data: { id, label, type: nodeType, confidence, created_at: now, attributes } }] });
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
      await logAudit('ADD_EDGE', id, `Connected ${sourceId} to ${targetId}`);
      set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: relationshipType, created_at: now } }] });
    } catch (e) {}
  },

  deleteNode: async (nodeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
      await logAudit('DELETE_NODE', nodeId, 'Destroyed');
      const remainingElements = graphElements.filter(e => e.data.id !== nodeId && e.data.source !== nodeId && e.data.target !== nodeId);
      set({ graphElements: remainingElements, selectedNodeId: null, selectedEdgeId: null });
    } catch (e) {}
  },

  deleteEdge: async (edgeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges WHERE id = ?', [edgeId]);
      await logAudit('DELETE_EDGE', edgeId, 'Severed');
      const remainingElements = graphElements.filter(e => e.data.id !== edgeId);
      set({ graphElements: remainingElements, selectedEdgeId: null });
    } catch (e) {}
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setConnectingFromId: (id) => set({ connectingFromId: id }),

  exportActiveCase: async () => {
    const { activeCaseId, cases, graphElements } = get();
    if (!activeCaseId) return;
    const activeCase = cases.find(c => c.id === activeCaseId);
    if (!activeCase) return;

    const password = window.prompt("SECURE EXPORT: Enter a strong password to encrypt this intelligence package:");
    if (!password) { alert("Export cancelled. A password is required."); return; }

    await logAudit('EXPORT_PACKAGE', activeCaseId, 'Exported Encrypted intelligence package');

    const exportData = {
      metadata: { reference: activeCase.reference_number, title: activeCase.title, classification: activeCase.classification, exported_at: new Date().toISOString(), system: "CrimeGraph v1.0" },
      intelligence_nodes: graphElements.filter(e => !e.data.source), relationships: graphElements.filter(e => e.data.source)
    };

    try {
      const jsonStr = JSON.stringify(exportData, null, 2);
      const encryptedPayload = await encryptPackage(jsonStr, password);
      const fileName = `intelligence_pkg_${activeCase.reference_number}.enc`;

      const fileResult = await Filesystem.writeFile({ path: fileName, data: encryptedPayload, directory: Directory.Cache, encoding: Encoding.UTF8 });
      useAuthStore.getState().setIntentionalBackground(true);
      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({ title: `Encrypted Package: ${activeCase.reference_number}`, text: `AES-GCM Encrypted Intelligence Data for ${activeCase.title}`, url: fileResult.uri, dialogTitle: 'Export Secure Package' });
      } else { alert("Device does not support native sharing."); }
    } catch (error) { console.error('Export failed:', error); alert('Failed to encrypt and export case data.'); }
  },

  importCase: async (encryptedData: string) => {
    const password = window.prompt("SECURE IMPORT: Enter the decryption password for this package:");
    if (!password) { alert("Import cancelled. Password required."); return; }

    try {
      const jsonStr = await decryptPackage(encryptedData, password);
      const data = JSON.parse(jsonStr);
      if (!data.metadata || !data.intelligence_nodes) throw new Error("Invalid format");

      const db = await getDb();
      const newCaseId = `case_${Date.now()}`;
      const now = new Date().toISOString();
      const refNumber = `${data.metadata.reference}-IMP`;
      const title = `${data.metadata.title} (Imported)`;

      await db.run('INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newCaseId, refNumber, title, 'other', 'active', data.metadata.classification || 'OFFICIAL', now, now, now]);

      const idMap = new Map<string, string>();
      for (const node of data.intelligence_nodes) {
        const newNodeId = `node_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        idMap.set(node.data.id, newNodeId);
        
        // 🚀 Ensure metadata attributes survive the import process
        const attrString = node.data.attributes ? JSON.stringify(node.data.attributes) : '{}';
        
        await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at, attributes) VALUES (?, ?, ?, ?, ?, ?, ?)', [newNodeId, newCaseId, node.data.label, node.data.type, node.data.confidence, node.data.created_at || now, attrString]);
      }
      for (const edge of data.relationships) {
        const newEdgeId = `edge_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        const newSource = idMap.get(edge.data.source);
        const newTarget = idMap.get(edge.data.target);
        if (newSource && newTarget) {
          await db.run('INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [newEdgeId, newCaseId, newSource, newTarget, edge.data.label, edge.data.created_at || now]);
        }
      }
      get().loadCases();
      await logAudit('IMPORT_CASE', newCaseId, `Imported decrypted package: ${title}`);
    } catch (e) {
      console.error('Import failed', e);
      alert('Decryption failed. Incorrect password or corrupted file.');
      throw e;
    }
  },

  loadAuditLogs: async () => {
    try {
      const db = await getDb();
      const res = await db.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100');
      set({ auditLogs: res.values || [] });
    } catch (e) { console.error('Failed to load audit logs', e); }
  },

  wipeDatabase: async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges');
      await db.run('DELETE FROM nodes');
      await db.run('DELETE FROM cases');
      await db.run('DELETE FROM audit_logs');
      set({ cases: [], graphElements: [], activeCaseId: null, auditLogs: [] });
      await logAudit('SYSTEM_WIPE', 'ALL_DATA', 'All operational intelligence and history was permanently destroyed via Kill Switch');
      get().loadAuditLogs();
      get().loadCases();
    } catch (e) { console.error('Failed to wipe database', e); }
  }
}));
EOF

echo "Staging files..."
git add src/stores/caseStore.ts

echo "Committing..."
git commit -m "fix: restore missing export/import/wipe functions accidentally truncated in previous patch"

echo "Pushing to GitHub..."
git push origin main

echo "Restoration complete! CI/CD should turn green."
