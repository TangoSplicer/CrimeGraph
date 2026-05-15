#!/bin/bash

echo "Patching caseStore.ts to support edge selection and deletion..."
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
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[]; 
  selectedNodeId: string | null; 
  selectedEdgeId: string | null; // 🚀 NEW: Track selected relationships
  connectingFromId: string | null;
  auditLogs: AuditLog[];
  
  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>; // 🚀 NEW: Delete just the relationship
  setSelectedNodeId: (id: string | null) => void; 
  setSelectedEdgeId: (id: string | null) => void; // 🚀 NEW
  setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>; importCase: (encryptedData: string) => Promise<void>;
  
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
  cases: [], activeCaseId: null, graphElements: [], selectedNodeId: null, selectedEdgeId: null, connectingFromId: null, auditLogs: [],
  
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
      await logAudit('ADD_NODE', id, `Added ${nodeType}: ${label}`);
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
      await logAudit('ADD_EDGE', id, `Connected ${sourceId} to ${targetId}`);
      set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: relationshipType, created_at: now } }] });
    } catch (e) { console.error(e); }
  },

  deleteNode: async (nodeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
      await logAudit('DELETE_NODE', nodeId, 'Node and edges destroyed');
      const remainingElements = graphElements.filter(e => e.data.id !== nodeId && e.data.source !== nodeId && e.data.target !== nodeId);
      set({ graphElements: remainingElements, selectedNodeId: null, selectedEdgeId: null });
    } catch (e) { console.error(e); }
  },

  // 🚀 NEW: Delete Edge Function
  deleteEdge: async (edgeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges WHERE id = ?', [edgeId]);
      await logAudit('DELETE_EDGE', edgeId, 'Relationship severed');
      const remainingElements = graphElements.filter(e => e.data.id !== edgeId);
      set({ graphElements: remainingElements, selectedEdgeId: null });
    } catch (e) { console.error(e); }
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

echo "Patching GraphCanvas.tsx to handle edge taps and selection styling..."
cat << 'EOF' > src/components/graph/GraphCanvas.tsx
import React, { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { useCaseStore } from '../../stores/caseStore';

const nodeColors: Record<string, string> = {
  person: '#3a7bd5', vehicle: '#7c4dbb', phone: '#1a9a8a', location: '#c0680a',
  event: '#c0392b', digital_account: '#2776b8', organisation: '#b07d0a', evidence: '#1a8a4a',
};

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { graphElements } = useCaseStore();

  useEffect(() => {
    if (!containerRef.current) return;

    const style: any[] = [
      { selector: 'node', style: {
          'label': 'data(label)', 'background-color': (ele: any) => nodeColors[ele.data('type')] || '#7880a0',
          'color': '#dde1ec', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6,
          'font-family': 'Space Mono, monospace', 'font-size': '10px', 'width': 48, 'height': 48,
          'border-width': 2, 'border-color': '#252a3a'
      }},
      { selector: 'node:selected', style: { 'border-width': 4, 'border-color': '#ffffff', 'shadow-blur': 15, 'shadow-color': '#ffffff' }},
      { selector: 'edge', style: {
          'width': 2, 'line-color': '#454d66', 'target-arrow-color': '#454d66', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier', 'label': 'data(label)', 'color': '#7880a0', 'font-size': '8px',
          'text-background-opacity': 1, 'text-background-color': '#0c0e14', 'text-background-padding': 2
      }},
      // 🚀 NEW: Edge Selection Styling (Glows Red when tapped)
      { selector: 'edge:selected', style: {
          'width': 4, 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c', 'color': '#e74c3c'
      }}
    ];

    const cy = cytoscape({
      container: containerRef.current, elements: graphElements, style: style,
      layout: { name: 'cose', padding: 50, animate: false },
      userZoomingEnabled: true, userPanningEnabled: true, boxSelectionEnabled: false,
      minZoom: 0.1, maxZoom: 4, touchTapThreshold: 8,
    });
    
    cyRef.current = cy;

    cy.on('tap', (evt) => {
      const target = evt.target;
      const state = useCaseStore.getState();
      
      if (target === cy) { 
        state.setSelectedNodeId(null); 
        state.setSelectedEdgeId(null);
        return; 
      }
      
      if (target.isNode()) {
        const targetId = target.id();
        if (state.connectingFromId) {
          state.addEdge(state.connectingFromId, targetId, 'LINKED_TO');
          state.setConnectingFromId(null);
        } else {
          state.setSelectedNodeId(targetId);
        }
      }

      // 🚀 NEW: Handle Edge Selection
      if (target.isEdge() && !state.connectingFromId) {
        state.setSelectedEdgeId(target.id());
      }
    });

    return () => cy.destroy();
  }, []);

  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    
    const currentIds = new Set();
    cy.elements().forEach((ele: any) => { currentIds.add(ele.id()); });
    const newElements = graphElements.filter(e => !currentIds.has(e.data.id));

    if (newElements.length > 0) {
      cy.add(newElements);
      cy.layout({ name: 'cose', padding: 50, animate: true, animationDuration: 300, randomize: false }).run();
    }

    const stateIds = new Set(graphElements.map(e => e.data.id));
    const elementsToRemove = cy.elements().filter((ele: any) => !stateIds.has(ele.id()));
    
    if (elementsToRemove.length > 0) {
      cy.remove(elementsToRemove);
    }
  }, [graphElements]);

  return <div ref={containerRef} className="w-full h-full bg-[#0c0e14]" />;
};
EOF

echo "Patching GraphWorkspaceScreen.tsx to render the Edge Bottom Sheet..."
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
    graphElements, 
    selectedNodeId, setSelectedNodeId, 
    selectedEdgeId, setSelectedEdgeId, // 🚀 NEW
    connectingFromId, setConnectingFromId, 
    deleteNode, deleteEdge, // 🚀 NEW
    activeCaseId, cases, exportActiveCase
  } = useCaseStore();
  
  const activeCase = cases.find(c => c.id === activeCaseId);

  useEffect(() => {
    if (!activeCaseId) navigate('/');
  }, [activeCaseId, navigate]);

  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);
  const selectedEdge = graphElements.find(e => e.data.id === selectedEdgeId);

  // Helper to find labels for the edge sheet
  const getLabelForNode = (id: string) => {
    return graphElements.find(e => e.data.id === id)?.data.label || 'Unknown';
  };

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

  const handleDeleteEdge = () => {
    if (selectedEdgeId && window.confirm('Sever this relationship link? Both nodes will remain intact.')) {
      deleteEdge(selectedEdgeId);
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
          <button onClick={exportActiveCase} className="text-[10px] font-bold px-2 py-1 rounded border border-[#3a7bd5] text-[#3a7bd5] hover:bg-[#3a7bd5] hover:text-white transition-colors">
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

      {/* 🚀 FIXED: Bottom Sheet now renders dynamic content based on whether a Node OR an Edge is selected */}
      <BottomSheet 
        isOpen={(!!selectedNodeId || !!selectedEdgeId) && !connectingFromId} 
        onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} 
        title={selectedNode ? selectedNode.data.label : 'Relationship Details'}
      >
        
        {/* VIEW 1: Node Details */}
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
              <button onClick={handleStartConnection} className="py-3 bg-[#3a7bd5] text-white font-bold rounded hover:bg-[#4a8be5]">Draw Connection</button>
              <button onClick={handleDeleteNode} className="py-3 border border-[#c0392b] text-[#c0392b] font-bold rounded hover:bg-[#c0392b] hover:text-white">Delete Node</button>
            </div>
          </div>
        )}

        {/* VIEW 2: Edge Details */}
        {selectedEdge && selectedEdge.data.source && selectedEdge.data.target && (
          <div className="space-y-6">
            <div className="bg-[#1c2030] border border-[#252a3a] rounded p-4 flex flex-col items-center space-y-3">
              <span className="text-[#dde1ec] font-mono text-xs">{getLabelForNode(selectedEdge.data.source)}</span>
              <div className="flex flex-col items-center text-[#e74c3c]">
                <span className="text-[10px] font-bold uppercase mb-1">{selectedEdge.data.label}</span>
                <span>↓</span>
              </div>
              <span className="text-[#dde1ec] font-mono text-xs">{getLabelForNode(selectedEdge.data.target)}</span>
            </div>
            
            <div className="pt-4">
              <button onClick={handleDeleteEdge} className="w-full py-3 bg-[#c0392b] text-white font-bold rounded hover:bg-[#a93226]">
                Sever Connection
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
git commit -m "feat: implement edge selection and relationship severing on graph canvas"

echo "Pushing to GitHub..."
git push origin main

echo "Phase 12 (Edge Severing) Deployed!"
