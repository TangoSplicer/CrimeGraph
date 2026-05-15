#!/bin/bash

echo "Patching caseStore.ts to throw errors to the UI..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';
import { encryptPackage, decryptPackage } from '../capacitor/crypto';

export interface Case { id: string; reference_number: string; title: string; case_type: string; status: string; classification: string; date_opened: string; node_count?: number; }
export interface GraphElement { data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; created_at?: string; }; }

interface CaseState {
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[]; selectedNodeId: string | null; connectingFromId: string | null;
  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void; setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>; importCase: (encryptedData: string) => Promise<void>;
}

const logAudit = async (action: string, targetId: string, details: string) => {
  try {
    const db = await getDb();
    const userId = useAuthStore.getState().currentUser?.id || 'SYSTEM_UNKNOWN';
    await db.run('INSERT INTO audit_logs (id, timestamp, user_id, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?)', [`audit_${Date.now()}`, new Date().toISOString(), userId, action, targetId, details]);
  } catch (e) {}
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

  addCase: async (title, refNumber, caseType, classification) => {
    const id = `case_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run('INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, refNumber, title, caseType, 'active', classification, now, now, now]);
      await logAudit('CREATE_CASE', id, `Created ${refNumber}: ${title}`);
      get().loadCases();
    } catch (e) { 
      console.error('Database rejection:', e); 
      // 🚀 FIXED: Throw the error so the UI knows the SQLite constraints failed
      throw new Error('Database rejected creation. Check uniqueness.');
    }
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
      if (nodesRes.values) nodesRes.values.forEach((n: any) => elements.push({ data: { id: n.id, label: n.label, type: n.type, confidence: n.confidence, created_at: n.created_at } }));
      if (edgesRes.values) edgesRes.values.forEach((e: any) => elements.push({ data: { id: e.id, source: e.source, target: e.target, label: e.label, created_at: e.created_at } }));
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
        await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)', [newNodeId, newCaseId, node.data.label, node.data.type, node.data.confidence, node.data.created_at || now]);
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
  }
}));
EOF

echo "Patching CreateCaseScreen.tsx to alert the user of validation failures..."
cat << 'EOF' > src/screens/CreateCaseScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const CreateCaseScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addCase } = useCaseStore();
  const [title, setTitle] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [caseType, setCaseType] = useState('major_crime');
  const [classification, setClassification] = useState('OFFICIAL');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !refNumber.trim()) return;
    
    try {
      await addCase(title.trim(), refNumber.trim().toUpperCase(), caseType, classification);
      navigate('/');
    } catch (error) {
      // 🚀 FIXED: Alert the user instead of failing silently
      alert("Failed to create Operation. The URN/Reference Number must be completely unique. Please ensure this reference isn't already used in your Active or Archived tabs.");
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">New Operation</h1>
          <p className="text-[#7880a0] text-xs">Initialize a blank workspace</p>
        </div>
        <button onClick={() => navigate('/')} className="text-[#7880a0] font-bold text-sm">Cancel</button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Reference No. / URN</label>
            <input 
              type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5] uppercase"
              placeholder="e.g. OP-VANGUARD-26" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Operation Title</label>
            <input 
              type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
              placeholder="e.g. Operation Vanguard" value={title} onChange={(e) => setTitle(e.target.value)} required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Type</label>
            <select 
              value={caseType} onChange={(e) => setCaseType(e.target.value)}
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            >
              <option value="major_crime">Major Crime</option>
              <option value="missing_person">Missing Person</option>
              <option value="organised_crime">Organised Crime</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Classification</label>
            <select 
              value={classification} onChange={(e) => setClassification(e.target.value)}
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            >
              <option value="OFFICIAL">OFFICIAL</option>
              <option value="OFFICIAL-SENSITIVE">OFFICIAL-SENSITIVE</option>
              <option value="SECRET">SECRET</option>
            </select>
          </div>

          <button type="submit" className="w-full py-3 bg-[#3a7bd5] hover:bg-[#4a8be5] text-white font-bold rounded shadow-lg transition-colors mt-8">
            Create Database
          </button>
        </form>
      </div>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "fix: surface SQLite unique constraint errors to UI on case creation"

echo "Pushing to GitHub..."
git push origin main

echo "Validation Patch Deployed!"
