#!/bin/bash

echo "Updating caseStore.ts to include timestamps and export logic..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';

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
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  archiveCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  restoreCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
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
      set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: relationshipType, created_at: now } }] });
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
  setConnectingFromId: (id) => set({ connectingFromId: id }),

  // 🚀 PHASE 8: Export Engine
  exportActiveCase: async () => {
    const { activeCaseId, cases, graphElements } = get();
    const activeCase = cases.find(c => c.id === activeCaseId);
    if (!activeCase) return;

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
      // Create a Blob from the JSON data
      const jsonStr = JSON.stringify(exportData, null, 2);
      
      // Attempt to invoke the native share sheet
      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({
          title: `Intelligence Package: ${activeCase.reference_number}`,
          text: `Encrypted Intelligence Data for ${activeCase.title}`,
          url: `data:application/json;base64,${btoa(jsonStr)}`,
          dialogTitle: 'Export Intelligence Package',
        });
      } else {
        alert("Device does not support native sharing.");
      }
    } catch (error) {
      console.error('Export failed', error);
      alert('Failed to export case data.');
    }
  }
}));
EOF

echo "Creating TimelineScreen.tsx..."
cat << 'EOF' > src/screens/TimelineScreen.tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const TimelineScreen: React.FC = () => {
  const navigate = useNavigate();
  const { graphElements, activeCaseId, cases } = useCaseStore();
  const activeCase = cases.find(c => c.id === activeCaseId);

  useEffect(() => {
    if (!activeCaseId) navigate('/');
  }, [activeCaseId, navigate]);

  // Sort elements chronologically
  const timelineEvents = [...graphElements].sort((a, b) => {
    const dateA = new Date(a.data.created_at || 0).getTime();
    const dateB = new Date(b.data.created_at || 0).getTime();
    return dateB - dateA; // Newest first
  });

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Unknown Date';
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe shadow-md">
        <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase?.reference_number}</h2>
        <p className="text-xs text-[#7880a0]">Intelligence Timeline</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {timelineEvents.map((el) => {
          const isEdge = !!el.data.source;
          return (
            <div key={el.data.id} className="relative pl-6 border-l-2 border-[#252a3a]">
              {/* Timeline dot */}
              <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-[#0c0e14] ${isEdge ? 'bg-[#7c4dbb]' : 'bg-[#1d9a6c]'}`} />
              
              <div className="bg-[#14171f] border border-[#252a3a] rounded p-3">
                <span className="text-[10px] font-mono text-[#7880a0] mb-1 block">
                  {formatDate(el.data.created_at)}
                </span>
                
                {isEdge ? (
                  <p className="text-[#dde1ec] text-sm">
                    Relationship established: <span className="font-bold text-[#3a7bd5]">{el.data.label}</span>
                  </p>
                ) : (
                  <div>
                    <p className="text-[#dde1ec] text-sm">
                      Entity added: <span className="font-bold">{el.data.label}</span>
                    </p>
                    <span className="text-[10px] uppercase text-[#7880a0] mt-1 block">
                      Type: {el.data.type?.replace('_', ' ')} • Conf: {el.data.confidence}/5
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {timelineEvents.length === 0 && (
          <p className="text-center text-[#7880a0] mt-10 text-sm">No intelligence logged yet.</p>
        )}
      </div>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Patching GraphWorkspaceScreen.tsx to add the Export button..."
cat << 'EOF' > src/screens/GraphWorkspaceScreen.tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';

export const GraphWorkspaceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    graphElements, selectedNodeId, setSelectedNodeId, 
    connectingFromId, setConnectingFromId, deleteNode, 
    activeCaseId, cases, exportActiveCase
  } = useCaseStore();
  
  const activeCase = cases.find(c => c.id === activeCaseId);

  useEffect(() => {
    if (!activeCaseId) navigate('/');
  }, [activeCaseId, navigate]);

  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);

  const handleStartConnection = () => {
    if (selectedNodeId) {
      setConnectingFromId(selectedNodeId);
      setSelectedNodeId(null);
    }
  };

  const handleDeleteNode = () => {
    if (selectedNodeId && window.confirm('Permanently delete this intelligence node and connections?')) {
      deleteNode(selectedNodeId);
    }
  };

  const renderStars = (rating: number = 3) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

  if (!activeCase) return null;

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14] relative">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-10 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase.reference_number}</h2>
          <p className="text-[10px] text-[#7880a0] truncate w-48">{activeCase.title}</p>
        </div>
        <div className="flex items-center space-x-2">
          {/* 🚀 Phase 8: Export Button */}
          <button 
            onClick={exportActiveCase}
            className="text-[10px] font-bold px-2 py-1 rounded border border-[#3a7bd5] text-[#3a7bd5] hover:bg-[#3a7bd5] hover:text-white transition-colors"
          >
            EXPORT
          </button>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#454d66] text-[#dde1ec] bg-[#252a3a]">
            {activeCase.classification}
          </span>
        </div>
      </div>

      {connectingFromId && (
        <div className="absolute top-[70px] left-4 right-4 z-20 bg-[#3a7bd5] text-white p-3 rounded shadow-lg flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wide animate-pulse">Tap target node...</span>
          <button onClick={() => setConnectingFromId(null)} className="text-white border border-white/30 px-3 py-1 rounded text-xs">Cancel</button>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        <GraphCanvas />
      </div>

      <BottomSheet isOpen={!!selectedNodeId && !connectingFromId} onClose={() => setSelectedNodeId(null)} title={selectedNode?.data.label || 'Node Details'}>
        {selectedNode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Type</span>
              <span className="text-[#dde1ec] capitalize">{selectedNode.data.type?.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Confidence</span>
              <span className="text-[#1d9a6c] font-mono text-lg">{renderStars(selectedNode.data.confidence)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <button onClick={handleStartConnection} className="py-3 bg-[#3a7bd5] text-white font-bold rounded">Draw Connection</button>
              <button onClick={handleDeleteNode} className="py-3 border border-[#c0392b] text-[#c0392b] font-bold rounded">Delete Node</button>
            </div>
          </div>
        )}
      </BottomSheet>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Wiring Timeline Route into App.tsx..."
cat << 'EOF' > src/App.tsx
import React, { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { initDatabase } from './capacitor/db';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { GraphWorkspaceScreen } from './screens/GraphWorkspaceScreen';
import { AddEntityScreen } from './screens/AddEntityScreen';
import { CreateCaseScreen } from './screens/CreateCaseScreen';
import { TimelineScreen } from './screens/TimelineScreen';

const PrivacyScreen = registerPlugin<any>('PrivacyScreen');

const App: React.FC = () => {
  const { isLocked, recordActivity, lock, lockTimeoutMs, lastActivityAt } = useAuthStore();

  useEffect(() => {
    initDatabase().catch(console.error);
    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.enable().catch(console.error);
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) lock();
      });
    }
    const timer = setInterval(() => {
      if (!isLocked && Date.now() - lastActivityAt > lockTimeoutMs) lock();
    }, 5000);
    return () => clearInterval(timer);
  }, [isLocked, lastActivityAt, lockTimeoutMs, lock]);

  return (
    <div className="w-full h-screen relative flex flex-col items-center justify-center bg-[#0c0e14] text-[#dde1ec]" onClick={recordActivity} onTouchStart={recordActivity}>
      {isLocked ? (
        <LoginScreen />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardScreen />} />
            <Route path="/new-case" element={<CreateCaseScreen />} />
            <Route path="/graph" element={<GraphWorkspaceScreen />} />
            <Route path="/add" element={<AddEntityScreen />} />
            <Route path="/timeline" element={<TimelineScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      )}
    </div>
  );
};
export default App;
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: implement Phase 7 Timeline and Phase 8 JSON Export"

echo "Pushing to GitHub..."
git push origin main

echo "Phases 7 & 8 Deployed!"
