#!/bin/bash

echo "Patching caseStore.ts to include archive actions..."
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
EOF

echo "Patching DashboardScreen.tsx for Tabbed UI..."
cat << 'EOF' > src/screens/DashboardScreen.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const DashboardScreen: React.FC = () => {
  const { cases, loadCases, setActiveCase, archiveCase, restoreCase } = useCaseStore();
  const navigate = useNavigate();
  const [view, setView] = useState<'active' | 'archived'>('active');

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleCaseSelect = (caseId: string) => {
    setActiveCase(caseId);
    navigate('/graph');
  };

  const handleArchiveToggle = (e: React.MouseEvent, caseId: string, currentStatus: string) => {
    e.stopPropagation(); // Prevent the click from launching the graph
    if (currentStatus === 'archived') {
      restoreCase(caseId);
    } else {
      if (window.confirm('Archive this operation? It will be moved to the archive tab.')) {
        archiveCase(caseId);
      }
    }
  };

  const displayedCases = cases.filter(c => 
    view === 'active' ? c.status !== 'archived' : c.status === 'archived'
  );

  const getClassificationColor = (classification: string) => {
    switch(classification) {
      case 'SECRET': return 'bg-[#3d0000] text-[#e74c3c] border-[#e74c3c]';
      case 'OFFICIAL-SENSITIVE': return 'bg-[#3d2a00] text-[#f39c12] border-[#f39c12]';
      default: return 'bg-[#252a3a] text-[#dde1ec] border-[#454d66]';
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe flex justify-between items-center">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">Operations</h1>
          <p className="text-[#7880a0] text-xs mt-1">Select a database to load</p>
        </div>
        <button 
          onClick={() => navigate('/new-case')}
          className="bg-[#3a7bd5] text-white text-xs font-bold px-3 py-2 rounded shadow-md hover:bg-[#4a8be5]"
        >
          + NEW
        </button>
      </div>

      {/* Tabs */}
      <div className="flex w-full bg-[#14171f] border-b border-[#252a3a]">
        <button 
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'active' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0]'}`}
          onClick={() => setView('active')}
        >
          Active
        </button>
        <button 
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'archived' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0]'}`}
          onClick={() => setView('archived')}
        >
          Archived
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayedCases.map((c) => (
          <div 
            key={c.id} 
            onClick={() => handleCaseSelect(c.id)}
            className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4 active:bg-[#252a3a] transition-colors cursor-pointer relative"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs text-[#3a7bd5]">{c.reference_number}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getClassificationColor(c.classification)}`}>
                {c.classification}
              </span>
            </div>
            
            <h2 className="text-lg font-bold text-[#dde1ec] mb-1 pr-16">{c.title}</h2>
            
            <div className="flex justify-between items-center text-xs text-[#7880a0] mt-4">
              <span className="uppercase">{c.case_type.replace('_', ' ')}</span>
              <span className={`uppercase font-bold ${c.status === 'archived' ? 'text-[#7880a0]' : 'text-[#1d9a6c]'}`}>
                {c.status}
              </span>
            </div>

            {/* Quick Action Button */}
            <button 
              onClick={(e) => handleArchiveToggle(e, c.id, c.status)}
              className="absolute top-12 right-4 px-3 py-1.5 bg-[#0f1219] border border-[#252a3a] text-[#7880a0] text-[10px] font-bold uppercase rounded hover:border-[#454d66] hover:text-[#dde1ec]"
            >
              {c.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </div>
        ))}

        {displayedCases.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-12 space-y-2">
            <p className="text-[#7880a0] text-sm">
              {view === 'active' ? 'No active operations found.' : 'No archived operations.'}
            </p>
          </div>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
};
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: implement operation archiving and dual-tab dashboard"

echo "Pushing to GitHub..."
git push origin main

echo "Archive patch deployed!"
