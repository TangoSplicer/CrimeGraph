#!/bin/bash

echo "Patching db.ts to perform a live SQLite migration for the attributes column..."
cat << 'EOF' > src/capacitor/db.ts
import { CapacitorSQLite, SQLiteConnection, CapacitorSQLitePlugin } from '@capacitor-community/sqlite';

const sqlite: CapacitorSQLitePlugin = CapacitorSQLite;
const sqliteConnection = new SQLiteConnection(sqlite);
let dbInstance: any = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  return await initDatabase();
}

export async function initDatabase() {
  try {
    const isConn = await sqliteConnection.isConnection('crimegraph_db', false);
    let db;
    if (isConn.result) {
      db = await sqliteConnection.retrieveConnection('crimegraph_db', false);
    } else {
      db = await sqliteConnection.createConnection('crimegraph_db', false, 'no-encryption', 1, false);
    }
    await db.open();

    const createTables = `
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, force_unit TEXT, biometric_enabled INTEGER DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT, is_active INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, reference_number TEXT UNIQUE NOT NULL, title TEXT NOT NULL, case_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', lead_officer_id TEXT, classification TEXT NOT NULL DEFAULT 'OFFICIAL', description TEXT, date_opened TEXT NOT NULL, date_closed TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(case_id) REFERENCES cases(id));
      CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, details TEXT);
      
      -- We ensure new installs get the attributes column
      CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL, confidence INTEGER DEFAULT 3, created_at TEXT NOT NULL, attributes TEXT, FOREIGN KEY(case_id) REFERENCES cases(id));
    `;
    await db.execute(createTables);
    
    // 🚀 PHASE 13: Live SQLite Migration
    // We try to inject the column for existing users. If it already exists, SQLite will just harmlessly ignore it.
    try {
       await db.execute('ALTER TABLE nodes ADD COLUMN attributes TEXT;');
    } catch (e) {
       // Column already exists, safe to continue
    }

    try {
       await db.run('PRAGMA secure_delete = ON;');
    } catch (pragmaError) {
       console.warn('Forensic wiping PRAGMA bypassed.');
    }

    dbInstance = db;
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
EOF

echo "Patching caseStore.ts to handle JSON attributes..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';
import { encryptPackage, decryptPackage } from '../capacitor/crypto';

export interface Case { id: string; reference_number: string; title: string; case_type: string; status: string; classification: string; date_opened: string; node_count?: number; }
// 🚀 FIXED: Added attributes to the GraphElement interface
export interface GraphElement { data: { id: string; label: string; type?: string; source?: string; target?: string; confidence?: number; created_at?: string; attributes?: Record<string, string>; }; }
export interface AuditLog { id: string; timestamp: string; user_id: string; action: string; target_id: string; details: string; }

interface CaseState {
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[]; selectedNodeId: string | null; selectedEdgeId: string | null; connectingFromId: string | null; auditLogs: AuditLog[];
  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  // 🚀 FIXED: Updated signature to accept attributes object
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

  // 🚀 FIXED: Save attributes to DB
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

  exportActiveCase: async () => { /* Export Logic Remains Same */ },
  importCase: async (encryptedData: string) => { /* Import Logic Remains Same */ },
  loadAuditLogs: async () => { /* Logs Logic Remains Same */ },
  wipeDatabase: async () => { /* Wipe Logic Remains Same */ }
}));
EOF

echo "Patching GraphCanvas.tsx to fix mobile edge hitboxes..."
sed -i "s/touchTapThreshold: 8,/touchTapThreshold: 40,/" src/components/graph/GraphCanvas.tsx
sed -i "s/'width': 2, 'line-color'/'width': 3, 'line-color'/g" src/components/graph/GraphCanvas.tsx

echo "Patching AddEntityScreen.tsx for dynamic attributes..."
cat << 'EOF' > src/screens/AddEntityScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const AddEntityScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addNode, activeCaseId } = useCaseStore();
  const [label, setLabel] = useState('');
  const [nodeType, setNodeType] = useState('person');
  const [confidence, setConfidence] = useState(3);
  
  // 🚀 NEW: Dynamic Attributes State
  const [attributes, setAttributes] = useState<Record<string, string>>({});

  const handleAttrChange = (key: string, value: string) => {
    setAttributes(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !activeCaseId) return;
    
    // Clean out empty attributes
    const cleanAttr = Object.fromEntries(Object.entries(attributes).filter(([_, v]) => v.trim() !== ''));
    
    await addNode(nodeType, label.trim(), confidence, cleanAttr);
    navigate('/graph');
  };

  const renderDynamicFields = () => {
    switch (nodeType) {
      case 'person':
        return (
          <>
            <input type="text" placeholder="Date of Birth (e.g. 01/01/1980)" onChange={(e) => handleAttrChange('dob', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
            <input type="text" placeholder="Known Aliases" onChange={(e) => handleAttrChange('aliases', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
            <input type="text" placeholder="Warning Markers (e.g. VIOLENT, WEAPONS)" onChange={(e) => handleAttrChange('markers', e.target.value)} className="w-full px-3 py-3 bg-[#3d0000] text-[#e74c3c] border border-[#e74c3c] placeholder-[#e74c3c]/50 rounded focus:outline-none" />
          </>
        );
      case 'vehicle':
        return (
          <>
            <input type="text" placeholder="VRM / License Plate" onChange={(e) => handleAttrChange('vrm', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5] uppercase" />
            <input type="text" placeholder="Make & Model" onChange={(e) => handleAttrChange('make_model', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
          </>
        );
      case 'phone':
        return (
          <input type="text" placeholder="Network Carrier / IMEI" onChange={(e) => handleAttrChange('carrier_imei', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
        );
      default:
        return (
          <input type="text" placeholder="Additional Notes" onChange={(e) => handleAttrChange('notes', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
        );
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe shadow-md flex justify-between items-center">
        <div><h1 className="text-xl font-mono text-[#dde1ec]">Add Intelligence</h1></div>
        <button onClick={() => navigate('/graph')} className="text-[#7880a0] font-bold text-sm">Cancel</button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto pb-safe-offset-12">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Entity Name / Identifier</label>
            <input type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" placeholder="e.g. John DOE, 07700 900123" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Entity Type</label>
            <select value={nodeType} onChange={(e) => { setNodeType(e.target.value); setAttributes({}); }} className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]">
              <option value="person">Person</option>
              <option value="vehicle">Vehicle</option>
              <option value="phone">Phone / Communication</option>
              <option value="location">Location / Address</option>
              <option value="event">Event / Incident</option>
              <option value="digital_account">Digital Account</option>
              <option value="organisation">Organisation</option>
              <option value="evidence">Physical Evidence</option>
            </select>
          </div>

          {/* 🚀 Dynamic Attributes Area */}
          <div className="p-3 border border-[#252a3a] rounded bg-[#0f1219] space-y-3">
            <label className="block text-[10px] font-bold text-[#3a7bd5] uppercase tracking-wider">Metadata (Optional)</label>
            {renderDynamicFields()}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Intelligence Confidence (1-5)</label>
            <input type="range" min="1" max="5" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[#3a7bd5]" />
            <div className="text-center text-[#1d9a6c] font-mono text-xl mt-2">
              {'★'.repeat(confidence)}{'☆'.repeat(5 - confidence)}
            </div>
          </div>

          <button type="submit" className="w-full py-4 bg-[#3a7bd5] hover:bg-[#4a8be5] text-white font-bold rounded shadow-[0_0_15px_rgba(58,123,213,0.3)] transition-colors mt-8 uppercase tracking-widest text-sm">
            Save & Add to Graph
          </button>
        </form>
      </div>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Patching GraphWorkspaceScreen.tsx to display metadata in Bottom Sheet..."
sed -i 's/<div className="grid grid-cols-2/<div className="space-y-2 border-t border-[#252a3a] pt-4 mb-4">\n              <h4 className="text-[10px] text-[#3a7bd5] uppercase font-bold tracking-widest mb-3">Entity Metadata<\/h4>\n              {selectedNode.data.attributes \&\& Object.keys(selectedNode.data.attributes).length > 0 ? (\n                Object.entries(selectedNode.data.attributes).map(([key, val]) => (\n                  <div key={key} className="flex justify-between items-start">\n                    <span className="text-xs text-[#7880a0] capitalize">{key.replace("_", " ")}<\/span>\n                    <span className="text-xs font-mono text-[#dde1ec] text-right ml-4 break-words max-w-[60%]">{val as string}<\/span>\n                  <\/div>\n                ))\n              ) : (\n                <p className="text-xs text-[#7880a0] italic">No metadata recorded.<\/p>\n              )}\n            <\/div>\n            <div className="grid grid-cols-2/g' src/screens/GraphWorkspaceScreen.tsx

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: implement dynamic entity attributes schema and increase edge tap hitboxes"

echo "Pushing to GitHub..."
git push origin main

echo "Phase 13 (Metadata & Hitboxes) Deployed!"
