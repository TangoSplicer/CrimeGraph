#!/bin/bash

echo "Patching caseStore.ts to include the Audit Ledger and Kill Switch..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';
import { encryptPackage, decryptPackage } from '../capacitor/crypto';

export interface Case { id: string; reference_number: string; title: string; case_type: string; status: string; classification: string; date_opened: string; node_count?: number; }
export interface GraphElement { data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; created_at?: string; }; }
export interface AuditLog { id: string; timestamp: string; user_id: string; action: string; target_id: string; details: string; }

interface CaseState {
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[]; selectedNodeId: string | null; connectingFromId: string | null;
  auditLogs: AuditLog[]; // 🚀 NEW: Audit Logs State
  
  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void; setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>; importCase: (encryptedData: string) => Promise<void>;
  
  // 🚀 NEW: Admin Functions
  loadAuditLogs: () => Promise<void>;
  wipeDatabase: () => Promise<void>;
}

const logAudit = async (action: string, targetId: string, details: string) => {
  try {
    const db = await getDb();
    const userId = useAuthStore.getState().currentUser?.id || 'SYSTEM_UNKNOWN';
    await db.run('INSERT INTO audit_logs (id, timestamp, user_id, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?)', [`audit_${Date.now()}`, new Date().toISOString(), userId, action, targetId, details]);
  } catch (e) {}
};

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [], activeCaseId: null, graphElements: [], selectedNodeId: null, connectingFromId: null, auditLogs: [],
  
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
    } catch (e) { throw e; }
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
  },

  // 🚀 PHASE 11: Admin Functions
  loadAuditLogs: async () => {
    try {
      const db = await getDb();
      // Fetch the latest 100 logs
      const res = await db.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100');
      set({ auditLogs: res.values || [] });
    } catch (e) { console.error('Failed to load audit logs', e); }
  },

  wipeDatabase: async () => {
    try {
      const db = await getDb();
      // Scorch the earth
      await db.execute('DELETE FROM edges; DELETE FROM nodes; DELETE FROM cases;');
      set({ cases: [], graphElements: [], activeCaseId: null });
      
      // We don't wipe the users table, and we append a final log to state the device was wiped
      await logAudit('SYSTEM_WIPE', 'ALL_DATA', 'All operational intelligence was permanently destroyed via Kill Switch');
      get().loadAuditLogs();
      get().loadCases();
    } catch (e) { console.error('Failed to wipe database', e); }
  }
}));
EOF

echo "Creating SettingsScreen.tsx..."
cat << 'EOF' > src/screens/SettingsScreen.tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { useAuthStore } from '../stores/authStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { auditLogs, loadAuditLogs, wipeDatabase } = useCaseStore();
  const { lock, currentUser } = useAuthStore();

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleWipe = () => {
    const confirm1 = window.confirm("WARNING: You are about to initiate a forensic wipe. All intelligence data will be permanently overwritten. Proceed?");
    if (confirm1) {
      const confirm2 = window.prompt("Type 'WIPE' to confirm complete data destruction:");
      if (confirm2 === 'WIPE') {
        wipeDatabase();
        alert("All operational data has been destroyed.");
        navigate('/');
      } else {
        alert("Wipe aborted.");
      }
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`;
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe shadow-md z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">Administration</h1>
          <p className="text-[#7880a0] text-xs mt-1">Security & Audit Hub</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#7880a0] uppercase tracking-widest">Logged in as</p>
          <p className="text-sm font-bold text-[#3a7bd5]">{currentUser?.username || 'ADMIN'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        
        {/* Security Controls */}
        <section>
          <h2 className="text-xs font-bold text-[#7880a0] uppercase tracking-widest mb-3 border-b border-[#252a3a] pb-1">Session Security</h2>
          <div className="space-y-3">
            <button 
              onClick={lock}
              className="w-full py-3 bg-[#1c2030] text-[#dde1ec] border border-[#454d66] rounded flex justify-between items-center px-4 hover:bg-[#252a3a]"
            >
              <span className="font-bold">Lock Application</span>
              <span>🔒</span>
            </button>
            
            <button 
              onClick={handleWipe}
              className="w-full py-3 bg-[#3d0000] text-[#e74c3c] border border-[#e74c3c] rounded flex justify-between items-center px-4 font-bold shadow-[0_0_15px_rgba(231,76,60,0.2)]"
            >
              <span>INITIATE KILL SWITCH (WIPE DATA)</span>
              <span>⚠️</span>
            </button>
          </div>
        </section>

        {/* Audit Ledger */}
        <section>
          <h2 className="text-xs font-bold text-[#7880a0] uppercase tracking-widest mb-3 border-b border-[#252a3a] pb-1 flex justify-between">
            <span>Immutable Audit Ledger</span>
            <span className="text-[#3a7bd5]">Latest 100</span>
          </h2>
          <div className="bg-[#14171f] border border-[#252a3a] rounded overflow-hidden">
            {auditLogs.length === 0 ? (
              <p className="p-4 text-center text-xs text-[#7880a0]">No audit records found.</p>
            ) : (
              <div className="divide-y divide-[#252a3a]">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-mono text-[#3a7bd5]">{log.action}</span>
                      <span className="text-[9px] text-[#7880a0]">{formatDate(log.timestamp)}</span>
                    </div>
                    <p className="text-xs text-[#dde1ec] mb-1">{log.details}</p>
                    <p className="text-[9px] text-[#7880a0] font-mono">User ID: {log.user_id} | Target: {log.target_id?.substring(0,12)}...</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </div>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Patching BottomTabBar.tsx to link the Settings page..."
cat << 'EOF' > src/components/layout/BottomTabBar.tsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const BottomTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: '/', label: 'HOME', icon: '⌂' },
    { id: '/graph', label: 'GRAPH', icon: '⎈' },
    { id: '/timeline', label: 'TIMELINE', icon: '⏱' },
    { id: '/settings', label: 'MORE', icon: '≡' }
  ];

  return (
    <div className="flex bg-[#14171f] border-t border-[#252a3a] pb-safe z-50">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => navigate(t.id)}
          className={`flex-1 py-3 flex flex-col items-center justify-center space-y-1 transition-colors ${
            location.pathname === t.id ? 'text-[#3a7bd5]' : 'text-[#7880a0] hover:text-[#dde1ec]'
          }`}
        >
          <span className="text-xl leading-none">{t.icon}</span>
          <span className="text-[9px] font-bold tracking-wider">{t.label}</span>
        </button>
      ))}
    </div>
  );
};
EOF

echo "Patching App.tsx to register the /settings route..."
sed -i "s|import { TimelineScreen } from './screens/TimelineScreen';|import { TimelineScreen } from './screens/TimelineScreen';\nimport { SettingsScreen } from './screens/SettingsScreen';|g" src/App.tsx
sed -i "s|<Route path=\"/timeline\" element={<TimelineScreen />} />|<Route path=\"/timeline\" element={<TimelineScreen />} />\n            <Route path=\"/settings\" element={<SettingsScreen />} />|g" src/App.tsx

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: implement Phase 11 Administration Hub, Audit Viewer, and Kill Switch"

echo "Pushing to GitHub..."
git push origin main

echo "Phase 11 Deployed!"
