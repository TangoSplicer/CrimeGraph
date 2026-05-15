#!/bin/bash

echo "Installing Capacitor Filesystem plugin..."
npm install @capacitor/filesystem

echo "Patching caseStore.ts to write physical files before sharing..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';

export interface Case {
  id: string; reference_number: string; title: string;
  case_type: string; status: string; classification: string; date_opened: string; node_count?: number;
}

export interface GraphElement {
  data: { 
    id: string; label: string; type?: string; source?: string; target?: string; 
    confidence?: number; created_at?: string; 
  };
}

interface CaseState {
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[];
  selectedNodeId: string | null; connectingFromId: string | null;
  
  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  addCase: (title: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void; setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>;
}

const logAudit = async (action: string, targetId: string, details: string) => {
  try {
    const db = await getDb();
    const userId = useAuthStore.getState().currentUser?.id || 'SYSTEM_UNKNOWN';
    const id = `audit_${Date.now()}`;
    await db.run(
      'INSERT INTO audit_logs (id, timestamp, user_id, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [id, new Date().toISOString(), userId, action, targetId, details]
    );
  } catch (e) {
    console.error('Audit log failed', e);
  }
};

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [], activeCaseId: null, graphElements: [], selectedNodeId: null, connectingFromId: null,
  
  loadCases: async () => {
    try {
      const db = await getDb();
      const res = await db.query('SELECT * FROM cases ORDER BY date_opened DESC');
      set({ cases: res.values || [] });
    } catch (e) { console.error('Failed to load cases', e); }
  },

  setActiveCase: (id) => { set({ activeCaseId: id }); get().loadGraphElements(id); },

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
      await logAudit('CREATE_CASE', id, `Created ${refNumber}: ${title}`);
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  archiveCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await logAudit('ARCHIVE_CASE', caseId, 'Case moved to archive');
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  restoreCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await logAudit('RESTORE_CASE', caseId, 'Case restored from archive');
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  loadGraphElements: async (caseId) => {
    try {
      const db = await getDb();
      const nodesRes = await db.query('SELECT * FROM nodes WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
      const edgesRes = await db.query('SELECT * FROM edges WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
      
      const elements: GraphElement[] = [];
      if (nodesRes.values) {
        nodesRes.values.forEach((n: any) => elements.push({
          data: { id: n.id, label: n.label, type: n.type, confidence: n.confidence, created_at: n.created_at }
        }));
      }
      if (edgesRes.values) {
        edgesRes.values.forEach((e: any) => elements.push({
          data: { id: e.id, source: e.source, target: e.target, label: e.label, created_at: e.created_at }
        }));
      }
      set({ graphElements: elements });
    } catch (e) { console.error(e); }
  },

  addNode: async (nodeType, label, confidence) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId) return;
    const id = `node_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, activeCaseId, label, nodeType, confidence, now]);
      await logAudit('ADD_NODE', id, `Added ${nodeType}: ${label} (Conf: ${confidence})`);
      set({ graphElements: [...graphElements, { data: { id, label, type: nodeType, confidence, created_at: now } }] });
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
      await logAudit('ADD_EDGE', id, `Connected ${sourceId} to ${targetId} via ${relationshipType}`);
      set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: relationshipType, created_at: now } }] });
    } catch (e) { console.error(e); }
  },

  deleteNode: async (nodeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
      await logAudit('DELETE_NODE', nodeId, 'Node and associated edges destroyed');
      const remainingElements = graphElements.filter(e => e.data.id !== nodeId && e.data.source !== nodeId && e.data.target !== nodeId);
      set({ graphElements: remainingElements, selectedNodeId: null });
    } catch (e) { console.error(e); }
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setConnectingFromId: (id) => set({ connectingFromId: id }),

  exportActiveCase: async () => {
    const { activeCaseId, cases, graphElements } = get();
    if (!activeCaseId) return;
    
    const activeCase = cases.find(c => c.id === activeCaseId);
    if (!activeCase) return;

    await logAudit('EXPORT_PACKAGE', activeCaseId, 'Exported intelligence package to external sheet');

    const exportData = {
      metadata: {
        reference: activeCase.reference_number,
        title: activeCase.title,
        classification: activeCase.classification,
        exported_at: new Date().toISOString(),
        system: "CrimeGraph v1.0"
      },
      intelligence_nodes: graphElements.filter(e => !e.data.source),
      relationships: graphElements.filter(e => e.data.source)
    };

    try {
      // 🚀 FIXED: Generate file name and stringify JSON
      const jsonStr = JSON.stringify(exportData, null, 2);
      const fileName = `intelligence_pkg_${activeCase.reference_number}.json`;

      // 🚀 FIXED: Write the physical file to the device's native cache directory
      const fileResult = await Filesystem.writeFile({
        path: fileName,
        data: jsonStr,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      const canShare = await Share.canShare();
      if (canShare.value) {
        // 🚀 FIXED: Pass the native file:// URI to the Share sheet
        await Share.share({
          title: `Intelligence Package: ${activeCase.reference_number}`,
          text: `Encrypted Intelligence Data for ${activeCase.title}`,
          url: fileResult.uri,
          dialogTitle: 'Export Intelligence Package',
        });
      } else {
        alert("Device does not support native sharing.");
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export case data. See logs for details.');
    }
  }
}));
EOF

echo "Staging files..."
git add package.json package-lock.json src/stores/caseStore.ts

echo "Committing..."
git commit -m "fix: implement native Filesystem API for reliable JSON export sharing"

echo "Pushing to GitHub..."
git push origin main

echo "Export Patch Deployed!"
