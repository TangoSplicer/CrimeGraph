#!/bin/bash

echo "Upgrading db.ts with nodes, edges, and active connection pooling..."
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
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        role TEXT NOT NULL, display_name TEXT NOT NULL, force_unit TEXT,
        biometric_enabled INTEGER DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT, is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY, reference_number TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
        case_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', lead_officer_id TEXT,
        classification TEXT NOT NULL DEFAULT 'OFFICIAL', description TEXT, date_opened TEXT NOT NULL,
        date_closed TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL, label TEXT NOT NULL,
        type TEXT NOT NULL, confidence INTEGER DEFAULT 3, created_at TEXT NOT NULL,
        FOREIGN KEY(case_id) REFERENCES cases(id)
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL, source TEXT NOT NULL,
        target TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(case_id) REFERENCES cases(id),
        FOREIGN KEY(source) REFERENCES nodes(id),
        FOREIGN KEY(target) REFERENCES nodes(id)
      );
    `;
    await db.execute(createTables);

    // Auto-seed a dummy case if the database is completely empty
    const res = await db.query("SELECT COUNT(*) as count FROM cases");
    if (res.values && res.values[0].count === 0) {
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['1', 'OP-VANGUARD-26', 'Operation Vanguard (O/C Network)', 'organised_crime', 'active', 'SECRET', now, now, now]
      );
    }
    
    dbInstance = db;
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
EOF

echo "Upgrading caseStore.ts for Async SQLite CRUD..."
cat << 'EOF' > src/stores/caseStore.ts
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
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void;
  setConnectingFromId: (id: string | null) => void;
}

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [],
  activeCaseId: '1',
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
      await db.run(
        'INSERT INTO nodes (id, case_id, label, type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, activeCaseId, label, nodeType, confidence, now]
      );
      
      const newNode: GraphElement = { data: { id, label, type: nodeType, confidence } };
      set({ graphElements: [...graphElements, newNode] });
    } catch (e) { console.error('Failed to insert node', e); }
  },

  addEdge: async (sourceId, targetId, relationshipType) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId || sourceId === targetId) return;
    
    const exists = graphElements.some(e => e.data.source === sourceId && e.data.target === targetId);
    if (exists) return;

    const id = `edge_${Date.now()}`;
    const now = new Date().toISOString();

    try {
      const db = await getDb();
      await db.run(
        'INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, activeCaseId, sourceId, targetId, relationshipType, now]
      );

      const newEdge: GraphElement = { data: { id, source: sourceId, target: targetId, label: relationshipType } };
      set({ graphElements: [...graphElements, newEdge] });
    } catch (e) { console.error('Failed to insert edge', e); }
  },

  deleteNode: async (nodeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      // Delete relationships first to maintain integrity
      await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
      // Then delete the node
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);

      // Filter state: remove the node AND any edge that touches it
      const remainingElements = graphElements.filter(e => 
        e.data.id !== nodeId && e.data.source !== nodeId && e.data.target !== nodeId
      );
      
      set({ graphElements: remainingElements, selectedNodeId: null });
    } catch (e) { console.error('Failed to delete node', e); }
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setConnectingFromId: (id) => set({ connectingFromId: id })
}));
EOF

echo "Patching GraphWorkspaceScreen.tsx to map the real Delete Node function..."
cat << 'EOF' > src/screens/GraphWorkspaceScreen.tsx
import React, { useEffect } from 'react';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';

export const GraphWorkspaceScreen: React.FC = () => {
  const { 
    graphElements, selectedNodeId, setSelectedNodeId, 
    connectingFromId, setConnectingFromId, deleteNode, 
    activeCaseId, loadGraphElements 
  } = useCaseStore();
  
  // Load data on mount if empty
  useEffect(() => {
    if (activeCaseId && graphElements.length === 0) {
      loadGraphElements(activeCaseId);
    }
  }, [activeCaseId, graphElements.length, loadGraphElements]);

  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);

  const handleStartConnection = () => {
    if (selectedNodeId) {
      setConnectingFromId(selectedNodeId);
      setSelectedNodeId(null);
    }
  };

  const handleDeleteNode = () => {
    if (selectedNodeId && window.confirm('Are you sure you want to permanently delete this intelligence node and all its connections?')) {
      deleteNode(selectedNodeId);
    }
  };

  const renderStars = (rating: number = 3) => {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14] relative">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-10 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">OP-VANGUARD-26</h2>
          <p className="text-xs text-[#7880a0]">Graph Workspace</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#454d66] text-[#dde1ec] bg-[#252a3a]">
          SECRET
        </span>
      </div>

      {connectingFromId && (
        <div className="absolute top-[70px] left-4 right-4 z-20 bg-[#3a7bd5] text-white p-3 rounded shadow-lg flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wide animate-pulse">
            Tap target node to connect...
          </span>
          <button 
            onClick={() => setConnectingFromId(null)}
            className="text-white border border-white/30 px-3 py-1 rounded text-xs hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        <GraphCanvas />
      </div>

      <BottomSheet 
        isOpen={!!selectedNodeId && !connectingFromId} 
        onClose={() => setSelectedNodeId(null)}
        title={selectedNode?.data.label || 'Node Details'}
      >
        {selectedNode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Type</span>
              <span className="text-[#dde1ec] capitalize">{selectedNode.data.type?.replace('_', ' ')}</span>
            </div>
            
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Confidence</span>
              <span className="text-[#1d9a6c] font-mono text-lg">
                {renderStars(selectedNode.data.confidence)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button 
                onClick={handleStartConnection}
                className="py-3 bg-[#3a7bd5] text-white font-bold rounded shadow-md hover:bg-[#4a8be5] transition-colors"
              >
                Draw Connection
              </button>
              <button 
                className="py-3 border border-[#c0392b] text-[#c0392b] font-bold rounded hover:bg-[#c0392b] hover:text-white transition-colors"
                onClick={handleDeleteNode}
              >
                Delete Node
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomTabBar />
    </div>
  );
};
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: implement sqlite persistence, node deletion, and db cascading"

echo "Pushing to GitHub..."
git push origin main

echo "Phase 6 SQLite deployed!"
